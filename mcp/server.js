'use strict'

const path = require('node:path')
process.chdir(path.resolve(__dirname, '..'))

const cds = require('@sap/cds')
const express = require('express')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js')
const { createProcurementRepository } = require('./procurement-repository')
const { registerProcurementTools } = require('./tools')
const xssec = require('@sap/xssec')
const xsenv = require('@sap/xsenv')

let uaaService
try {
  uaaService = xsenv.getServices({ uaa: { tag: 'xsuaa' } }).uaa
} catch (err) {
  console.warn('No UAA service found. Authentication will not be enforced.')
}


// Adding a middleware to authenticate XSUAA
async function authenticate(req, res, next) {
  if (!uaaService) {
    return next()
  }
  const authHeader = req.headers['authorization']
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Missing or invalid Authorization header')
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const token = authHeader.substring(7) // Remove 'Bearer ' prefix
  try {
    const securityContext = await xssec.createSecurityContext(token, uaaService)
    req.authInfo = securityContext
    return next()
  } catch (err) {
    console.error('Authentication failed:', err)
    return res.status(401).json({ error: 'Unauthorized' })
  }
}


async function buildCdsModel() {
  const db = await cds.connect.to('db')
  const model = cds.model || await cds.load('*')
  if (db.kind === 'sqlite') {
    await cds.deploy(model).to(db)
  }
  cds.model = cds.linked(model)
}

async function main() {
  
  // Build CDS model first
  await buildCdsModel()

  // Create ONE shared MCP server instance
  const mcpServer = new McpServer({
    name: 'sap-procurement-mcp',
    version: '1.0.0'
  })
  registerProcurementTools(mcpServer, createProcurementRepository(cds))

  const activeTransports = new Map()
  const app = express()
  app.use(express.json())

  // Use JWT validation
  app.use(['/mcp', '/mcp/messages'], authenticate)

  
  // SSE endpoint — client connects here first
  app.get('/mcp', async (req, res) => {             //opens up the mcp server for the client to connect to, and then the client can send messages to the server via the /mcp/messages endpoint. The server will respond with events that the client can listen to.
    console.log('New SSE connection request')

    res.setHeader('Access-Control-Allow-Origin', '*')

    const transport = new SSEServerTransport('/mcp/messages', res)
    const sessionId = transport.sessionId

    console.log(`Session created: ${sessionId}`)
    activeTransports.set(sessionId, transport)

    await mcpServer.connect(transport)

    res.on('close', () => {
      console.log(`Session closed: ${sessionId}`)
      activeTransports.delete(sessionId)
    })
  })

  // Messages endpoint — client sends tool calls here
  app.post('/mcp/messages', async (req, res) => {
    const sessionId = req.query.sessionId
    console.log(`Message received for session: ${sessionId}`)

    const transport = activeTransports.get(sessionId)
    if (!transport) {
      console.error(`No session found for: ${sessionId}`)
      return res.status(400).json({
        error: `No active SSE session found for sessionId: ${sessionId}`
      })
    }

    await transport.handlePostMessage(req, res, req.body)
  })

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      sessions: activeTransports.size,
      timestamp: new Date().toISOString()
    })
  })

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'sap-procurement-mcp',
      status: 'running',
      endpoints: {
        sse: '/mcp',
        messages: '/mcp/messages',
        health: '/health'
      },
      timestamp: new Date().toISOString()
    })
  })

  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`SAP Procurement MCP server running on port ${port}`)
    console.log(`SSE endpoint: http://localhost:${port}/mcp`)
    console.log(`Messages endpoint: http://localhost:${port}/mcp/messages`)
    console.log(`Health check: http://localhost:${port}/health`)
  })
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to start MCP server:', error)
    process.exitCode = 1
  })
}

module.exports = { main }