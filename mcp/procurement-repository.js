'use strict'

const MAX_RESULT_LIMIT = 50

function limit(value, fallback = 10) {
  return Math.min(Math.max(Number.isInteger(value) ? value : fallback, 1), MAX_RESULT_LIMIT)
}

function dateMatches(value, from, to) {
  if (!from && !to) return true
  if (!value) return false
  return (!from || value >= from) && (!to || value <= to)
}

function createProcurementRepository(cds) {
  const { SELECT } = cds.ql

  function entities() {
    const result = cds.entities('enterprise.ai')
    if (!result) throw new Error('CDS model enterprise.ai is not loaded')
    return result
  }

  async function searchPurchaseOrders(filters = {}) {
    const { PurchaseOrders } = entities()
    const where = {}

    if (filters.purchaseOrder) where.purchaseOrder = filters.purchaseOrder.trim()
    if (filters.supplier) where.supplier = { like: `%${filters.supplier.trim()}%` }
    if (filters.buyer) where.buyer = { like: `%${filters.buyer.trim()}%` }
    if (filters.status) where.status = filters.status

    let query = SELECT.from(PurchaseOrders).columns(
      'ID', 'purchaseOrder', 'supplier', 'buyer', 'orderDate',
      'deliveryDate', 'status', 'currency', 'totalAmount'
    )
    if (Object.keys(where).length) query = query.where(where)

    return (await cds.run(query))
      .filter(row => dateMatches(row.orderDate, filters.dateFrom, filters.dateTo))
      .filter(row => filters.minAmount == null || Number(row.totalAmount) >= filters.minAmount)
      .filter(row => filters.maxAmount == null || Number(row.totalAmount) <= filters.maxAmount)
      .slice(0, limit(filters.limit))
  }

  async function getPurchaseOrder(purchaseOrder) {
    const { PurchaseOrders } = entities()
    return cds.run(
      SELECT.one.from(PurchaseOrders)
        .columns('*', { ref: ['items'], expand: ['*'] })
        .where({ purchaseOrder: purchaseOrder.trim() })
    )
  }

  async function getSpendSummary(filters = {}) {
    const { PurchaseOrders } = entities()
    const orders = (await cds.run(SELECT.from(PurchaseOrders).columns(
      'supplier', 'status', 'currency', 'totalAmount', 'orderDate'
    )))
      .filter(row => dateMatches(row.orderDate, filters.dateFrom, filters.dateTo))
      .filter(row => !filters.supplier || row.supplier.toLowerCase().includes(filters.supplier.toLowerCase()))

    const spendByCurrency = {}
    const orderCountByStatus = {}
    const supplierSpend = {}

    for (const order of orders) {
      const amount = Number(order.totalAmount || 0)
      spendByCurrency[order.currency] = (spendByCurrency[order.currency] || 0) + amount
      orderCountByStatus[order.status] = (orderCountByStatus[order.status] || 0) + 1
      const key = `${order.supplier} (${order.currency})`
      supplierSpend[key] = (supplierSpend[key] || 0) + amount
    }

    return {
      orderCount: orders.length,
      spendByCurrency,
      orderCountByStatus,
      topSuppliers: Object.entries(supplierSpend)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5)
        .map(([supplier, amount]) => ({ supplier, amount }))
    }
  }

  async function listLateDeliveries({ asOf, supplier, limit: resultLimit } = {}) {
    const { PurchaseOrders } = entities()
    const cutoff = asOf || new Date().toISOString().slice(0, 10)
    const excludedStatuses = new Set(['Rejected', 'Cancelled', 'Completed'])
    const orders = await cds.run(SELECT.from(PurchaseOrders).columns(
      'ID', 'purchaseOrder', 'supplier', 'buyer', 'deliveryDate',
      'status', 'currency', 'totalAmount'
    ))

    return orders
      .filter(order => order.deliveryDate && order.deliveryDate < cutoff)
      .filter(order => !excludedStatuses.has(order.status))
      .filter(order => !supplier || order.supplier.toLowerCase().includes(supplier.toLowerCase()))
      .sort((left, right) => left.deliveryDate.localeCompare(right.deliveryDate))
      .slice(0, limit(resultLimit))
      .map(order => ({
        ...order,
        daysLate: Math.floor((Date.parse(cutoff) - Date.parse(order.deliveryDate)) / 86400000)
      }))
  }

  async function searchProcurementDocuments({ query, limit: resultLimit } = {}) {
    const { Embeddings, Documents } = entities()
    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}-]{2,}/gu) || [])]
    const [chunks, documents] = await Promise.all([
      cds.run(SELECT.from(Embeddings).columns('ID', 'documentID', 'chunkIndex', 'chunkText').limit(250)),
      cds.run(SELECT.from(Documents).columns('ID', 'fileName'))
    ])
    const fileNames = new Map(documents.map(document => [document.ID, document.fileName]))

    return chunks
      .map(chunk => {
        const text = chunk.chunkText.toLowerCase()
        const matchedTerms = terms.filter(term => text.includes(term))
        return { ...chunk, fileName: fileNames.get(chunk.documentID), score: matchedTerms.length, matchedTerms }
      })
      .filter(chunk => chunk.score > 0)
      .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
      .slice(0, Math.min(limit(resultLimit, 5), 10))
  }

  return {
    searchPurchaseOrders,
    getPurchaseOrder,
    getSpendSummary,
    listLateDeliveries,
    searchProcurementDocuments
  }
}

module.exports = { createProcurementRepository }
