'use strict' //using strict to enforce stricter parsing and error handling in JavaScript

const MAX_RESULT_LIMIT = 50 //only 50 max records will show up in the result set, to avoid performance issues and excessive data transfer

//ensures the limit values is always from 0 to 50, and if not provided, defaults to 10. This is a safeguard against excessive data retrieval that could impact performance.
function limit(value, fallback = 10) {
  return Math.min(Math.max(Number.isInteger(value) ? value : fallback, 1), MAX_RESULT_LIMIT)
}

//checks if a given date value falls within a specified range defined by 'from' and 'to' dates. If both 'from' and 'to' are not provided, it returns true, indicating that any date is acceptable. If the value is null or undefined, it returns false. Otherwise, it checks if the value is greater than or equal to 'from' (if provided) and less than or equal to 'to' (if provided).
function dateMatches(value, from, to) {
  if (!from && !to) return true
  if (!value) return false
  return (!from || value >= from) && (!to || value <= to)
}


//creates repository for procurement data, providing methods to search and retrieve purchase orders, spend summaries, late deliveries, and procurement documents. It uses the CDS model to interact with the database and perform various queries and aggregations.
function createProcurementRepository(cds) {
  const { SELECT } = cds.ql //extract data from CQL (Cds Query Language) to perform database operations on the entities defined in the CDS model. It allows for constructing queries to retrieve and manipulate data in a structured manner.
  

  //Check the model is loaded and returns the entities defined in the 'enterprise.ai' namespace of the CDS model. If the model is not loaded, it throws an error. This function serves as a utility to access the relevant entities for procurement operations.
  function entities() {
    if (!cds.model) throw new Error('CDS model is not loaded')
    return cds.entities('enterprise.ai')
  }
   //uses CQL- CAP's query language, which is a SQL-like syntax for querying CDS entities 
   //Searches for purchase orders based on various filters such as purchase order number, supplier, buyer, status, date range, and amount range. It constructs a query using the provided filters and retrieves matching purchase orders from the database. The results are further filtered based on date and amount criteria before being returned.
  async function searchPurchaseOrders(filters = {}) {
    const { PurchaseOrders } = entities()

    // creating a where with empty object 
    const where = {}


    //purchaseorder, supplier, buyer, and status are optional filters that can be applied to the search query. If provided, they are added to the 'where' object to filter the results accordingly. The 'trim()' method is used to remove any leading or trailing whitespace from the filter values.
    if (filters.purchaseOrder) where.purchaseOrder = filters.purchaseOrder.trim()
    if (filters.supplier) where.supplier = { like: `%${filters.supplier.trim()}%` }
    if (filters.buyer) where.buyer = { like: `%${filters.buyer.trim()}%` }
    if (filters.status) where.status = filters.status


    //creating a cap query to select purchase orders from the database based on the constructed 'where' object. It specifies the columns to be retrieved, including ID, purchase order number, supplier, buyer, order date, delivery date, status, currency, and total amount. If any filters are applied, they are included in the query using the 'where' clause.
    let query = SELECT.from(PurchaseOrders).columns(
      'ID', 'purchaseOrder', 'supplier', 'buyer', 'orderDate',
      'deliveryDate', 'status', 'currency', 'totalAmount'
    )

    //check if the 'where' object has any properties (i.e., if any filters were applied). If so, it adds the 'where' clause to the query to filter the results accordingly. Finally, it executes the query using 'cds.run()' and applies additional filtering based on date and amount criteria before returning the final result set.
    if (Object.keys(where).length) query = query.where(where)
    

    //Executing the query and applying additional filtering based on date and amount criteria. The results are filtered to include only those purchase orders that match the specified date range (if provided) and fall within the specified minimum and maximum amount range (if provided). The final result set is limited to the specified number of records (defaulting to 10 if not provided) to prevent excessive data retrieval.
    return (await cds.run(query))
      .filter(row => dateMatches(row.orderDate, filters.dateFrom, filters.dateTo))
      .filter(row => filters.minAmount == null || Number(row.totalAmount) >= filters.minAmount)
      .filter(row => filters.maxAmount == null || Number(row.totalAmount) <= filters.maxAmount)
      .slice(0, limit(filters.limit))
  }
   
  //uses Deep Compositions Expansion - uses [expnad * ] on the composed item s
  // executes a query to retrieve a single purchase order based on the provided purchase order number. It uses the 'SELECT.one.from()' method to fetch a single record from the 'PurchaseOrders' entity, including all columns and expanding the 'items' composition to retrieve related item details. The 'where' clause filters the results based on the trimmed purchase order number. The result is returned as a single object representing the purchase order and its associated items.
  async function getPurchaseOrder(purchaseOrder) {
    const { PurchaseOrders } = entities()
    return cds.run(
      SELECT.one.from(PurchaseOrders)
        .columns('*', { ref: ['items'], expand: ['*'] })
        .where({ purchaseOrder: purchaseOrder.trim() })
    )
  }
  
  //Analytical AGgrergations- Fetches the relevant from the models to calculate sums
  //Generate the procurement spend summary based on the provided filters. It retrieves purchase orders from the database and calculates various metrics such as total spend by currency, order count by status, and top suppliers based on spend. The results are aggregated and returned in a structured format, providing insights into procurement spending patterns and supplier performance.
  async function getSpendSummary(filters = {}) {
    //get the required entities from the CDS model to perform the necessary queries and aggregations for generating the procurement spend summary. It ensures that the relevant data is available for analysis and reporting.
    const { PurchaseOrders } = entities()
    //acts as an query to return the order values from the PurchaseOrders entity, selecting specific columns such as supplier, status, currency, total amount, and order date. The results are then filtered based on the provided date range and supplier criteria to generate the spend summary.
    const orders = (await cds.run(SELECT.from(PurchaseOrders).columns(
      'supplier', 'status', 'currency', 'totalAmount', 'orderDate'
    )))
      .filter(row => dateMatches(row.orderDate, filters.dateFrom, filters.dateTo))
      .filter(row => !filters.supplier || row.supplier.toLowerCase().includes(filters.supplier.toLowerCase()))



    //create empty summary objects to store the aggregated spend data by currency, order count by status, and supplier spend. These objects will be populated as the purchase orders are processed in the subsequent loop.
    const spendByCurrency = {}
    const orderCountByStatus = {}
    const supplierSpend = {}
    

    //loop through each purchase order in the 'orders' array and perform calculations to update the summary objects. For each order, it calculates the total spend by currency, counts the number of orders by status, and aggregates the spend for each supplier. The results are stored in the respective summary objects for further analysis and reporting.
    for (const order of orders) {
      const amount = Number(order.totalAmount || 0)
      spendByCurrency[order.currency] = (spendByCurrency[order.currency] || 0) + amount
      orderCountByStatus[order.status] = (orderCountByStatus[order.status] || 0) + 1
      const key = `${order.supplier} (${order.currency})`
      supplierSpend[key] = (supplierSpend[key] || 0) + amount
    }
    

    //return the aggregated spend summary data, including the total order count, spend by currency, order count by status, and top suppliers based on spend. The top suppliers are determined by sorting the supplier spend data in descending order and selecting the top 5 suppliers with the highest spend amounts. The final result is returned as an object containing the summarized procurement spend information.
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
  

  //Logical Exclusion and Date Comparison - Excludes certain statuses and compares delivery dates to identify late deliveries
  async function listLateDeliveries({ asOf, supplier, limit: resultLimit } = {}) {
    const { PurchaseOrders } = entities()
    const cutoff = asOf || new Date().toISOString().slice(0, 10)
    const excludedStatuses = new Set(['Rejected', 'Cancelled', 'Completed'])
    const orders = await cds.run(SELECT.from(PurchaseOrders).columns(
      'ID', 'purchaseOrder', 'supplier', 'buyer', 'deliveryDate',
      'status', 'currency', 'totalAmount'
    ))


    //return the output 
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
  

  //performs Document Retrievel Operations  with promise.all to fetch chunks and documents concurrently, then filters and sorts the results based on matched terms and scores.
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


// Anything inside the file until it is exporting is private to the module and cannot be accessed from outside. The createProcurementRepository function is exported, allowing other modules to import and use it to create a procurement repository instance with the defined methods for interacting with procurement data.
module.exports = { createProcurementRepository }
