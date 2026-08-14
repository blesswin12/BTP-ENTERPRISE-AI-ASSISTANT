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