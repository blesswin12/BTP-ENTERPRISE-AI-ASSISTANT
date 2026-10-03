#!/usr/bin/env node
'use strict';
try { require('dotenv').config(); } catch (e) {}

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');

async function main() {
  const mcpUrl = process.env.MCP_SERVER_URL || 'http://localhost:3001/mcp';
  console.log(`Connecting to MCP server at: ${mcpUrl}...`);

  const transport = new SSEClientTransport(new URL(mcpUrl));
  const client = new Client(
    { name: 'sap-procurement-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    console.log('Connected to MCP server successfully!\n');

    // 1. List all available tools
    console.log('--- 1. Available Tools ---');
    const { tools } = await client.listTools();
    tools.forEach(tool => {
      console.log(`• ${tool.name}: ${tool.description}`);
    });
    console.log('');

    // 2. Call search_purchase_orders tool
    console.log('--- 2. Calling "search_purchase_orders" (limit: 3) ---');
    const searchResult = await client.callTool({
      name: 'search_purchase_orders',
      arguments: { limit: 3 }
    });
    console.log(searchResult.content?.[0]?.text || searchResult);
    console.log('');

    // 3. Call get_spend_summary tool
    console.log('--- 3. Calling "get_spend_summary" ---');
    const summaryResult = await client.callTool({
      name: 'get_spend_summary',
      arguments: {}
    });
    console.log(summaryResult.content?.[0]?.text || summaryResult);
    console.log('');

  } catch (error) {
    console.error('Error interacting with MCP server:', error.message);
  } finally {
    await client.close();
    process.exit(0);
  }
}

main();
