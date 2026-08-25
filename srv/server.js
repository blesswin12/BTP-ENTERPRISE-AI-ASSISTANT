const cds = require('@sap/cds');
const logging = require("cf-nodejs-logging-support");
const express = require("express");
const path = require("path");
const { getDynamicHDIConnection, Enterprise_Tenants } = require('./hdi-router');

logging.setLoggingLevel("info");
const logger = logging.createLogger();

cds.on('bootstrap', (app) => {
  app.use(logging.logNetwork);

  // Middleware for Context Initiation
  app.use(async (req, res, next) => {
    try {
      const tenantId = req.user?.tenant || req.headers['x-tenant-id'] || req.headers['x-sap-subaccountid'];
      if (tenantId && Enterprise_Tenants.has(tenantId)) {
        req.hdiTx = await getDynamicHDIConnection(tenantId);
      }
    } catch (err) {
      console.warn("[Context Initiation Warning]", err.message);
    }
    next();
  });

  app.use('/chat-ui', express.static(path.join(__dirname, 'public/chat-ui')));
  app.use('/chat-ui', express.static(path.join(__dirname, '../public/chat-ui')));
});

cds.on('served', () => {
  logger.info("Application Logging & Context Propagation initialized successfully");
});

module.exports = cds.server;