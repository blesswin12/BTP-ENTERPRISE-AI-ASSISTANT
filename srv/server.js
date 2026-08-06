const cds = require('@sap/cds');
cds.env.add(require('@sap/cds-mtxs/env'));
require('@sap/cds-mtxs');
const logging = require("cf-nodejs-logging-support");
const express = require("express")
const path = require("path")
const { getDynamicHDIConnection } = require('./hdi-router');

// Set the minimum log level
logging.setLoggingLevel("info");

// Create a global logger
const logger = logging.createLogger();

// React on bootstrap to hook into Express
cds.on('bootstrap', (app) => {
  // Enable automatic request logging
  app.use(logging.logNetwork);

  app.use(async (req, res, next) => {
    const tenantId= req.user?.tenant || req.headers['x-tenant-id'] || req.headers['x-sap-subaccountid'];
    if (tenantId) {
      req.hdiTx = await getDynamicHDIConnection(tenantId);
    }
    next();
  });

  app.use('/chat-ui',express.static(path.join(__dirname,'public/chat-ui')));
  app.use('/chat-ui',express.static(path.join(__dirname,'../public/chat-ui')));
});

// Log a startup message when the services are served
cds.on('served', () => {
  logger.info("Application Logging integration initialized successfully");
});

// Delegate server startup to default CAP server
module.exports = cds.server;
