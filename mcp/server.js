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
  const db = await cds.connect.to('db')//database connection to the db service defined in the CDS model
  const model = cds.model || await cds.load('*')
  if (db.kind === 'sqlite') {
    await cds.deploy(model).to(db)//generate the databse table and populate them using CSV files 
  }
  cds.model = cds.linked(model)

  const server = new McpServer({
    name: 'sap-procurement-mcp',
    version: '1.0.0'
  })
  registerProcurementTools(server, createProcurementRepository(cds))
  return server
}

async function main() {
  const activeTransports = new Map()

  const app = express()
  app.use(express.json())

  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id']
    let transport

    if (sessionId && activeTransports.has(sessionId)) {
      transport = activeTransports.get(sessionId)
    } else {
      if (req.method === 'GET' || req.method === 'DELETE') {
        return res.status(404).send('Session not found.')
      }

      // ← create a fresh McpServer per session
      const server = await createServer()

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
