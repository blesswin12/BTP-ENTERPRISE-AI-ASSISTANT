'use strict'

const { z } = require('zod')

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false
}

function response(result) {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    structuredContent: { result }
  }
}

function registerProcurementTools(server, repository) {
  server.registerTool('search_purchase_orders', {
    title: 'Search purchase orders',
    description: 'Find purchase orders by number, supplier, buyer, status, order date, or amount.',
    inputSchema: {
      purchaseOrder: z.string().min(1).optional(),
      supplier: z.string().min(1).optional(),
      buyer: z.string().min(1).optional(),
      status: z.string().min(1).optional(),
      dateFrom: z.string().date().optional(),
      dateTo: z.string().date().optional(),
      minAmount: z.number().nonnegative().optional(),
      maxAmount: z.number().nonnegative().optional(),
      limit: z.number().int().min(1).max(50).default(10)
    },
    annotations
  }, async input => response(await repository.searchPurchaseOrders(input)))

  server.registerTool('get_purchase_order', {
    title: 'Get purchase order',
    description: 'Get one purchase order and its line items using the business PO number.',
    inputSchema: { purchaseOrder: z.string().min(1) },
    annotations
  }, async ({ purchaseOrder }) => response(await repository.getPurchaseOrder(purchaseOrder)))

  server.registerTool('get_spend_summary', {
    title: 'Get spend summary',
    description: 'Summarize procurement spend without combining different currencies.',
    inputSchema: {
      supplier: z.string().min(1).optional(),
      dateFrom: z.string().date().optional(),
      dateTo: z.string().date().optional()
    },
    annotations
  }, async input => response(await repository.getSpendSummary(input)))

  server.registerTool('list_late_deliveries', {
    title: 'List late deliveries',
    description: 'List non-completed purchase orders whose delivery date is before the requested date.',
    inputSchema: {
      asOf: z.string().date().optional(),
      supplier: z.string().min(1).optional(),
      limit: z.number().int().min(1).max(50).default(10)
    },
    annotations
  }, async input => response(await repository.listLateDeliveries(input)))

  server.registerTool('search_procurement_documents', {
    title: 'Search procurement documents',
    description: 'Find uploaded procurement document excerpts using keyword ranking.',
    inputSchema: {
      query: z.string().min(2).max(500),
      limit: z.number().int().min(1).max(10).default(5)
    },
    annotations
  }, async input => response(await repository.searchProcurementDocuments(input)))
}

module.exports = { registerProcurementTools }
