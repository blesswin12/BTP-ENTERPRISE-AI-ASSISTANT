'use strict'

const path = require('node:path')
const crypto = require('node:crypto')
process.chdir(path.resolve(__dirname, '..'))

const cds = require('@sap/cds')
const express = require('express')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { createProcurementRepository } = require('./procurement-repository')
const { registerProcurementTools } = require('./tools')

async function createServer() {
  cds.model = cds.model || await cds.load('*')
  await cds.connect.to('db')

  const server = new McpServer({
    name: 'sap-procurement-mcp',
    version: '1.0.0'
  })
  registerProcurementTools(server, createProcurementRepository(cds))
  return server
}

async function main() {
  const server = await createServer()
  const activeTransports = new Map()

  const app = express()
  app.use(express.json())

  // Handle all MCP Streamable HTTP requests (GET for SSE stream, POST for messages, DELETE to close session)
  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id']

    let transport

    if (sessionId && activeTransports.has(sessionId)) {
      // Reuse existing transport for this session
      transport = activeTransports.get(sessionId)
    } else {
      // For GET or DELETE requests, if sessionId is not found or invalid, return error early
      if (req.method === 'GET' || req.method === 'DELETE') {
        return res.status(404).send('Session not found.')
      }

      // New session — create a fresh transport (expected on POST for initialization)
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (newSessionId) => {
          activeTransports.set(newSessionId, transport)
        }
      })

      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid) activeTransports.delete(sid)
      }

      await server.connect(transport)
    }

    await transport.handleRequest(req, res, req.body)
  })

  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`SAP Procurement MCP server running on port ${port}`)
  })
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to start SAP Procurement MCP server:', error)
    process.exitCode = 1
  })
}

module.exports = { createServer }
