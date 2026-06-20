# Refactoring MCP Server to Web Transport (Express & SSE)

This guide outlines the steps to refactor the MCP server in [server.js](file:///home/user/projects/enterprise-ai-assistant/mcp/server.js) to run on Express using the [SSEServerTransport](file:///home/user/projects/enterprise-ai-assistant/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/sse.js#L20) instead of the standard [StdioServerTransport](file:///home/user/projects/enterprise-ai-assistant/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js).

---

## 🛠️ Step-by-Step Instructions

### Step 1: Import Express and the SSE Server Transport
Modify the imports at the top of [server.js](file:///home/user/projects/enterprise-ai-assistant/mcp/server.js):
- Replace `StdioServerTransport` with `SSEServerTransport` from `@modelcontextprotocol/sdk/server/sse.js`.
- Import `express` at the top.

### Step 2: Update the `main()` function
Replace the `main()` function to set up Express and define the endpoints:
1. Initialize an Express application with JSON body-parsing middleware using `express.json()`.
2. Maintain an in-memory `activeTransports` map to associate unique session IDs with their corresponding `SSEServerTransport` instances.
3. Define **GET `/mcp`** to initialize `SSEServerTransport` with `/messages`, store the transport by `sessionId`, connect the transport to the MCP server, and clean up the session mapping when the connection closes.
4. Define **POST `/messages`** to look up the correct `SSEServerTransport` via the `sessionId` query parameter and delegate message processing with `transport.handlePostMessage(req, res)`.
5. Start the server listening on a port (e.g., `PORT` environment variable or default to `3000`).

---

## 📝 Code Diff

Apply the following changes to [server.js](file:///home/user/projects/enterprise-ai-assistant/mcp/server.js):

```diff
 'use strict'
 
 const path = require('node:path')
 process.chdir(path.resolve(__dirname, '..'))
 
 const cds = require('@sap/cds')
+const express = require('express')
 const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
-const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
+const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js')
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
-  await server.connect(new StdioServerTransport())
-  console.error('SAP Procurement MCP server is running on stdio')
+  const activeTransports = new Map()
+
+  const app = express()
+  app.use(express.json())
+
+  app.get('/mcp', async (req, res) => {
+    const transport = new SSEServerTransport('/messages', res)
+    const sessionId = transport.sessionId
+    activeTransports.set(sessionId, transport)
+
+    await server.connect(transport)
+
+    res.on('close', () => {
+      activeTransports.delete(sessionId)
+    })
+  })
+
+  app.post('/messages', async (req, res) => {
+    const sessionId = req.query.sessionId
+    const transport = activeTransports.get(sessionId)
+
+    if (!transport) {
+      return res.status(400).send('No active SSE session found for the provided sessionId.')
+    }
+
+    await transport.handlePostMessage(req, res)
+  })
+
+  const port = process.env.PORT || 3000
+  app.listen(port, () => {
+    console.log(`SAP Procurement MCP server running on port ${port}`)
+  })
 }
 
 if (require.main === module) {
```
