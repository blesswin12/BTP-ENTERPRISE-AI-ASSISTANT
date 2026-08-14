# 🚀 Context Propagation Initiation & Implementation Guide

This guide provides a step-by-step blueprint for initiating and leveraging **Context Propagation (`cds.context` & `AsyncLocalStorage`)** in your **Enterprise AI Assistant** project.

---

## 📋 Table of Contents
1. [Prerequisite Check](#1-prerequisite-check)
2. [Step 1: Customizing Express Middleware in `srv/server.js`](#step-1-customizing-express-middleware-in-srvserverjs)
3. [Step 2: Creating a Context Helper Utility (`srv/utils/context-helper.js`)](#step-2-creating-a-context-helper-utility-srvutilscontext-helperjs)
4. [Step 3: Enriching AI Operations in `srv/chat-service.js`](#step-3-enriching-ai-operations-in-srvchat-servicejs)
5. [Step 4: Implementing Async Background Jobs (`cds.spawn`)](#step-4-implementing-async-background-jobs-cdsspawn)
6. [Step 5: Testing & Verification](#step-5-testing--verification)

---

## 1. Prerequisite Check

Your SAP CAP project is already configured with the essential dependencies required for `AsyncLocalStorage` context propagation:
* **Node.js**: Version 18+ (Includes native `node:async_hooks`).
* **CAP Framework**: `@sap/cds` (Version 7+ or 8+ natively uses `AsyncLocalStorage`).
* **Multi-Tenancy Support**: `@sap/cds-mtxs` integrated.

---

## Step 1: Customizing Express Middleware in `srv/server.js`

Enhance [`srv/server.js`](file:///home/user/projects/enterprise-ai-assistant/srv/server.js) to ensure custom headers (such as `x-correlation-id` or `x-tenant-id`) are automatically injected into `cds.context` on every incoming HTTP request.

### Updated `srv/server.js` Pattern:

```javascript
const cds = require('@sap/cds');
cds.env.add(require('@sap/cds-mtxs/env'));
require('@sap/cds-mtxs');
const logging = require("cf-nodejs-logging-support");
const express = require("express");
const path = require("path");
const { getDynamicHDIConnection } = require('./hdi-router');

logging.setLoggingLevel("info");
const logger = logging.createLogger();

cds.on('bootstrap', (app) => {
  app.use(logging.logNetwork);

  // Middleware for Context Initiation
  app.use(async (req, res, next) => {
    // 1. Identify Tenant
    const tenantId = req.user?.tenant || req.headers['x-tenant-id'] || req.headers['x-sap-subaccountid'];
    
    // 2. Set dynamic HDI connection if applicable
    if (tenantId) {
      req.hdiTx = await getDynamicHDIConnection(tenantId);
    }

    // 3. CAP automatically binds req to cds.context here
    next();
  });

  app.use('/chat-ui', express.static(path.join(__dirname, 'public/chat-ui')));
  app.use('/chat-ui', express.static(path.join(__dirname, '../public/chat-ui')));
});

cds.on('served', () => {
  logger.info("Application Logging & Context Propagation initialized successfully");
});

module.exports = cds.server;
```

---

## Step 2: Creating a Context Helper Utility (`srv/utils/context-helper.js`)

Create a reusable helper script in `srv/utils/context-helper.js` that any module in your application can import to read user, tenant, and request metadata cleanly.

```javascript
// srv/utils/context-helper.js
const cds = require('@sap/cds');

/**
 * Returns current context metadata (user, tenant, correlation ID)
 */
function getRequestContext() {
  const ctx = cds.context;
  return {
    correlationId: ctx?.id || 'SYS-ID',
    tenant: ctx?.tenant || 'provider',
    user: ctx?.user?.id || 'anonymous',
    roles: ctx?.user?.roles || [],
    locale: ctx?.locale || 'en',
    timestamp: ctx?.timestamp || new Date()
  };
}

/**
 * Log message with context information automatically attached
 */
function logWithContext(level, message, loggerInstance) {
  const ctx = getRequestContext();
  const formattedMsg = `[CorrelationID: ${ctx.correlationId}] [Tenant: ${ctx.tenant}] [User: ${ctx.user}] ${message}`;
  
  if (loggerInstance && typeof loggerInstance[level] === 'function') {
    loggerInstance[level](formattedMsg);
  } else {
    console.log(`[${level.toUpperCase()}] ${formattedMsg}`);
  }
}

module.exports = {
  getRequestContext,
  logWithContext
};
```

---

## Step 3: Enriching AI Operations in `srv/chat-service.js`

Use `cds.context` inside your Groq LLM completion function [`callGroq()`](file:///home/user/projects/enterprise-ai-assistant/srv/chat-service.js#L8) to log AI request telemetry per tenant and per user without changing function arguments.

### Before & After in `srv/chat-service.js`:

```javascript
// In srv/chat-service.js
const { getRequestContext, logWithContext } = require('./utils/context-helper');

async function callGroq(systemPrompt, userMessage, history = []) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  // Read context automatically via AsyncLocalStorage
  const ctx = getRequestContext();
  logWithContext('info', `Sending AI prompt to Groq (Model: ${GROQ_MODEL})`);

  const messages = [{ role: 'system', content: systemPrompt }];
  for (const turn of history) {
    messages.push({ role: 'user', content: turn.userQuestion });
    messages.push({ role: 'assistant', content: turn.aiResponse });
  }
  messages.push({ role: 'user', content: userMessage });

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
      // Pass Correlation ID downstream to Groq / AI Gateway
      'X-Correlation-ID': ctx.correlationId
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages,
      max_tokens: 1024,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    logWithContext('error', `Groq API failed: ${errorText}`);
    throw new Error(`Groq API request failed with ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content;
}
```

---

## Step 4: Implementing Async Background Jobs (`cds.spawn`)

When processing document embeddings or long-running AI workflows, run them asynchronously with **`cds.spawn`** so background tasks retain tenant and security context without delaying the user HTTP response.

### Example in `srv/chat-service.js`:

```javascript
// Registering custom action in ChatService
this.on('ingestDocumentAsync', async (req) => {
  const { documentText, documentName } = req.data;

  // 1. Immediately return acknowledgment to user
  req.reply({ status: 'ACCEPTED', message: 'Document ingestion started in background.' });

  // 2. Spawn background execution retaining active context
  cds.spawn({ tenant: cds.context.tenant, user: cds.context.user }, async (tx) => {
    // tx is an isolated background transaction
    const vector = await generateEmbedding(documentText);
    
    await tx.run(
      INSERT.into('enterprise.ai.Embeddings').entries({
        ID: cds.utils.uuid(),
        fileName: documentName,
        chunkText: documentText,
        vector: JSON.stringify(vector)
      })
    );

    console.log(`[Background Task Complete] Ingested document '${documentName}' for tenant '${cds.context.tenant}'`);
  });
});
```

---

## Step 5: Testing & Verification

### Verification Test Script (`test/context-test.js`)
Create a quick unit test to verify that context propagation works seamlessly:

```javascript
// test/context-test.js
const cds = require('@sap/cds');

describe('Context Propagation Verification', () => {
  it('should propagate context through AsyncLocalStorage', async () => {
    const testContext = new cds.EventContext({
      user: new cds.User('test-user-01'),
      tenant: 'test-tenant-100',
      id: 'CORR-TEST-99'
    });

    // Run inside context boundary
    await cds.context = testContext;

    expect(cds.context.user.id).toBe('test-user-01');
    expect(cds.context.tenant).toBe('test-tenant-100');
    expect(cds.context.id).toBe('CORR-TEST-99');
  });
});
```

---

## 📌 Summary Checklist for Implementation

| Step | Task | Status |
| :--- | :--- | :--- |
| **1** | Verify `srv/server.js` bootstrap middleware passes headers to request | ✅ |
| **2** | Add `srv/utils/context-helper.js` helper utility | 🔲 Next |
| **3** | Import helper into `srv/chat-service.js` to log LLM calls with correlation ID | 🔲 Next |
| **4** | Replace background `setTimeout` operations with `cds.spawn()` | 🔲 Next |
