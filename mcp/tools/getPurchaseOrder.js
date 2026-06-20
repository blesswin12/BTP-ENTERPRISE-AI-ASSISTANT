'use strict'

// Compatibility export for code that imported the original module.
// MCP registration is in tools/index.js and now reads from CAP/HANA.
module.exports = function getPurchaseOrder(repository, purchaseOrder) {
  return repository.getPurchaseOrder(purchaseOrder)
}
