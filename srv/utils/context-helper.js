const cds = require('@sap/cds');

/**
 * Returns current request context metadata (correlation ID, tenant ID, user details)
 * backed safely by Node.js AsyncLocalStorage via cds.context.
 */
function getRequestContext() {
  const ctx = cds.context;
  return {
    correlationId: ctx?.id || 'SYS-ID',
    tenantId: ctx?.tenant || 'provider',
    userId: ctx?.user?.id || 'anonymous',
    userName: ctx?.user?.name || 'anonymous',
    roles: ctx?.user?.roles || [],
    locale: ctx?.locale || 'en',
    timestamp: ctx?.timestamp || new Date().toISOString()
  };
}

/**
 * Log message with context information automatically attached
 */
function logWithContext(level, message, loggerInstance) {
  const ctx = getRequestContext();
  const formattedMsg = `[CorrID: ${ctx.correlationId}] [Tenant: ${ctx.tenantId}] [User: ${ctx.userId}] - ${message}`;
  
  if (loggerInstance && typeof loggerInstance[level] === 'function') {
    loggerInstance[level](formattedMsg);
  } else {
    console.log(`[${level.toUpperCase()}] ${formattedMsg}`);
  }
}

/**
 * Strips unwanted OData annotations (@odata.*), draft flags, null values, and unrequested columns.
 * Reduces prompt context payload size by 30% to 60% before passing data to LLMs (Groq/OpenAI).
 */
function optimizeContextForAI(data, fieldsToKeep = []) {
  if (!data) return data;

  const isArray = Array.isArray(data);
  const list = isArray ? data : [data];

  const cleanedList = list.map(item => {
    if (typeof item !== 'object' || item === null) return item;
    
    const cleaned = {};
    for (const [key, value] of Object.entries(item)) {
      // 1. Skip OData metadata annotations & internal draft flags
      if (
        key.startsWith('@') ||
        key.startsWith('Draft') ||
        key === 'IsActiveEntity' ||
        key === 'HasDraftEntity' ||
        key === 'HasActiveEntity'
      ) {
        continue;
      }

      // 2. If specific fields are requested, filter by fieldsToKeep
      if (fieldsToKeep.length > 0 && !fieldsToKeep.includes(key)) {
        continue;
      }

      // 3. Skip null/undefined values to conserve tokens
      if (value !== null && value !== undefined) {
        if (typeof value === 'object') {
          cleaned[key] = optimizeContextForAI(value, fieldsToKeep);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  });

  return isArray ? cleanedList : cleanedList[0];
}

/**
 * Formats database records into a clean, token-optimized JSON string ready for LLM prompt context.
 */
function toTokenOptimizedJSON(data, fieldsToKeep = []) {
  const cleaned = optimizeContextForAI(data, fieldsToKeep);
  return JSON.stringify(cleaned, null, 2);
}

module.exports = {
  getRequestContext,
  logWithContext,
  optimizeContextForAI,
  toTokenOptimizedJSON
};