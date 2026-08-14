# 🧠 Context Propagation in SAP CAP (`cds.context`) & Node.js `AsyncLocalStorage`

## 📖 Introduction

In non-blocking, single-threaded Node.js applications, hundreds of HTTP requests and asynchronous tasks execute concurrently on a single event loop thread. 

**Context Propagation** is the ability to maintain request-scoped state (such as authenticated user, tenant ID, transaction, locale, and correlation ID) across asynchronous operations (Promises, `async/await`, timers, I/O callbacks) **without explicitly passing context objects through every function parameter**.

In SAP Cloud Application Programming Model (CAP), this is powered under the hood by Node.js **`AsyncLocalStorage`** (from `node:async_hooks`), exposed globally via **`cds.context`**.

---

## 🏗️ Architectural Foundations

### 1. The Challenge of the Node.js Event Loop
In multi-threaded platforms (like Java), thread-local storage (`ThreadLocal`) holds request state because one thread handles one request start-to-finish. In Node.js, a single thread context-switches between different asynchronous callbacks continuously.

```
Request A ---> [Async I/O start] -------------------------> [Async I/O complete]
                      \                                            ^
Request B -------------> [Async I/O start] -> [I/O complete] -----/
```

### 2. Node.js `AsyncLocalStorage` (ALS)
`AsyncLocalStorage` solves this by attaching state to the asynchronous execution chain created by `async_hooks`.

```javascript
const { AsyncLocalStorage } = require('node:async_hooks');
const asyncLocalStorage = new AsyncLocalStorage();

function logWithTenant(message) {
  const store = asyncLocalStorage.getStore();
  console.log(`[Tenant: ${store?.tenantId}] ${message}`);
}

asyncLocalStorage.run({ tenantId: 'tenant-123' }, async () => {
  // Asynchronous call chain automatically inherits store
  await new Promise((resolve) => setTimeout(resolve, 100));
  logWithTenant('Fetching purchase orders...'); // Outputs: [Tenant: tenant-123] Fetching purchase orders...
});
```

---

## ⚡ How SAP CAP Uses `AsyncLocalStorage` (`cds.context`)

In SAP CAP, `cds.context` is a dynamic getter bound to internal `AsyncLocalStorage`. When an incoming request hits the CAP server:

1. CAP's protocol adapter (Express middleware) constructs a `cds.EventContext` object containing:
   - `id`: Correlation ID / Request ID.
   - `user`: Security principal object (`cds.User`) with user ID, roles, and attributes.
   - `tenant`: Tenant ID for multi-tenant SaaS applications.
   - `locale`: User locale/language setting.
   - `http`: Reference to `{ req, res }`.
   - `timestamp`: Request start time.
2. CAP wraps the execution of request handlers inside `AsyncLocalStorage.run(context, ...)` (or setting `cds.context = context`).
3. Any CAP service (`cds.db`, `cds.connect.to()`, custom handlers) reads `cds.context` automatically during execution.

```
[HTTP Request]
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│ CAP Express Middleware                                  │
│ Creates EventContext: { tenant: 't1', user: 'alice' }   │
└─────────────────────────┬───────────────────────────────┘
                          │ AsyncLocalStorage.run(...)
                          ▼
┌─────────────────────────────────────────────────────────┐
│ CAP Application Service Handler                         │
│ reads `cds.context.user` implicitly                     │
└─────────────────────────┬───────────────────────────────┘
                          │ Implicit query execution
                          ▼
┌─────────────────────────────────────────────────────────┐
│ CAP Database Service (cds.db)                            │
│ Automatically appends tenant filter (WHERE tenant = 't1')│
└─────────────────────────┬───────────────────────────────┘
```

---

## 🎯 Key Use Cases & Applications

### 1. Implicit Multi-Tenant Data Isolation
When querying database entities in a multi-tenant CAP application, CAP database services automatically inspect `cds.context.tenant` and apply tenant filtering down to SAP HANA HDI container connections.

```javascript
// You write this:
const orders = await SELECT.from('SalesOrders');

// CAP automatically executes (under the hood):
// SELECT * FROM SalesOrders WHERE tenant = cds.context.tenant;
```

### 2. Implicit Security & Authorization
Accessing current user identity and roles anywhere in custom code:

```javascript
class OrderService extends cds.ApplicationService {
  async init() {
    this.before('CREATE', 'Orders', (req) => {
      // Accessing user from req or cds.context
      const user = cds.context.user;
      console.log(`Order created by: ${user.id}`);
      
      if (!user.is('Manager')) {
        req.reject(403, 'Only managers can create orders');
      }
    });
  }
}
```

### 3. Database Transaction Scoping (`cds.tx`)
Database transactions in CAP are bound to `cds.context`. When executing service queries inside an HTTP handler, all calls share the current request transaction context automatically.

```javascript
// Explicit transaction scoping using cds.tx with context
await cds.tx(cds.context, async (tx) => {
  await tx.run(INSERT.into('Logs').entries({ msg: 'Action performed' }));
  await tx.run(UPDATE('Orders').set({ status: 'PROCESSED' }));
});
```

### 4. Background Asynchronous Processing (`cds.spawn`)
Standard `setTimeout` or un-awaited background promises lose the original `cds.context` because the HTTP request lifecycle completes and cleans up the context.

To run background tasks with preserved tenant and user context, use **`cds.spawn`**:

```javascript
// Inside an HTTP Request Handler
this.on('triggerLongRunningTask', async (req) => {
  // Respond immediately to the HTTP client
  req.reply({ status: 'Processing started in background' });

  // Spawn background task maintaining tenant & user context
  cds.spawn({ tenant: cds.context.tenant, user: cds.context.user }, async (tx) => {
    // New AsyncLocalStorage context created with isolated transaction tx
    await new Promise(res => setTimeout(res, 5000));
    await tx.run(UPDATE('TaskQueue').set({ status: 'COMPLETED' }));
  });
});
```

### 5. Distributed Tracing & Correlation IDs
You can pass custom parameters or HTTP headers across asynchronous call stacks or downstream HTTP requests (e.g., calling Groq AI, HuggingFace, or external SAP S/4HANA OData services).

```javascript
const logger = cds.log('ai-assistant');

function logInfo(message) {
  const correlationId = cds.context?.id || 'NO-CORRELATION-ID';
  const tenant = cds.context?.tenant || 'provider';
  logger.info(`[${correlationId}] [Tenant: ${tenant}] ${message}`);
}
```

---

## 🛠️ Code Examples: Practical Usage Patterns

### A. Creating Custom Express Middleware with AsyncLocalStorage Context Propagation
If you need custom state (e.g. `traceId`, `clientIp`) propagated across your entire app alongside `cds.context`:

```javascript
// srv/server.js
const cds = require('@sap/cds');
const { AsyncLocalStorage } = require('node:async_hooks');

const appStore = new AsyncLocalStorage();

cds.on('bootstrap', (app) => {
  app.use((req, res, next) => {
    const customContext = {
      traceId: req.headers['x-trace-id'] || `trace-${Date.now()}`,
      clientIp: req.ip
    };

    // Propagate context through execution chain
    appStore.run(customContext, () => {
      next();
    });
  });
});

module.exports = { appStore };
```

### B. Accessing `cds.context` in Auxiliary / Helper Functions
Auxiliary utility files do not need `req` passed down through every layer:

```javascript
// srv/utils/auditLogger.js
const cds = require('@sap/cds');

async function recordAuditLog(action, details) {
  const ctx = cds.context;
  if (!ctx) {
    console.warn('Audit log recorded outside of active cds.context');
  }

  const auditEntry = {
    user: ctx?.user?.id || 'SYSTEM',
    tenant: ctx?.tenant || 'DEFAULT',
    correlationId: ctx?.id,
    action,
    details,
    timestamp: new Date()
  };

  // Run in autonomous transaction so it doesn't roll back if main TX fails
  await cds.tx({ tenant: ctx?.tenant }, async (tx) => {
    await tx.run(INSERT.into('AuditLogs').entries(auditEntry));
  });
}

module.exports = { recordAuditLog };
```

---

## ⚠️ Pitfalls & Best Practices

| Issue / Pitfall | Cause | Solution |
| :--- | :--- | :--- |
| **`cds.context` is `undefined`** | Executing code in standalone timers (`setInterval`/`setTimeout`) or un-bound event listeners outside request scope. | Wrap execution in `cds.spawn({ tenant, user }, async (tx) => ...)` or explicit `cds.context = new cds.EventContext(...)`. |
| **Context Leakage Across Requests** | Mutating global variables instead of request-scoped context. | Store request state strictly inside `cds.context` properties or dedicated `AsyncLocalStorage` stores. |
| **Context Dropped by Third-Party Callbacks** | Legacy libraries using non-standard callback queues or native C++ addons that do not preserve `async_hooks`. | Wrap callbacks in `AsyncLocalStorage.snapshot()` or bind them explicitly. |
| **Transaction Deadlocks in Background Jobs** | Sharing the HTTP request's database transaction with a background job that outlives the HTTP response. | `cds.spawn` automatically creates a fresh, isolated transaction context (`tx`). Always use `tx` in background jobs. |

---

## 🎯 Summary Checklist for Developers

1. ✅ **Never pass `req` to deep utility functions**: Use `cds.context.user` or `cds.context.tenant` inside helper modules.
2. ✅ **Use `cds.spawn` for background tasks**: Preserves multi-tenancy and security principal without locking the HTTP request transaction.
3. ✅ **Understand implicit DB filtering**: `cds.db` relies entirely on `cds.context` for multi-tenant HDI routing and tenant scoping.
4. ✅ **Ensure Node.js v16+**: Modern SAP CAP uses Node's native `AsyncLocalStorage` for high performance and low overhead context tracking.
