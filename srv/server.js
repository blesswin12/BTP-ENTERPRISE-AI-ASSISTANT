const cds = require('@sap/cds')
const logging = require("cf-nodejs-logging-support");

// Set the minimum log level
logging.setLoggingLevel("info");

// Create a global logger
const logger = logging.createLogger();

// React on bootstrap to hook into Express
cds.on('bootstrap', (app) => {
  // Enable automatic request logging
  app.use(logging.logNetwork);
})

// Log a startup message when the services are served
cds.on('served', () => {
  logger.info("Application Logging integration initialized successfully");
})

// Delegate server startup to default CAP server
module.exports = cds.server
