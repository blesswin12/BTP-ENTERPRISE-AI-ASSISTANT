'use strict'

const cds = require('@sap/cds')

// Must be FIRST line before anything else
const { GET, POST, PATCH, DELETE, expect, defaults } = cds.test('.')
  .in(__dirname + '/..')

// Set base path for all requests
defaults.path = '/chat'

describe('ChatService — Purchase Orders', () => {

  // ── READ tests ──

  it('GET /PurchaseOrders returns 200', async () => {
    const { status, data } = await GET `/PurchaseOrders`
    expect(status).to.equal(200)
    expect(data.value).to.be.an('array')
    expect(data.value.length).to.be.greaterThan(0)
  })

  it('GET /PurchaseOrders filters by status', async () => {
    const { data } = await GET `/PurchaseOrders?$filter=status eq 'Approved'`
    data.value.forEach(po => {
      expect(po.status).to.equal('Approved')
    })
  })

  it('GET /PurchaseOrders expands items', async () => {
    const { data } = await GET `/PurchaseOrders?$expand=items`
    expect(data.value[0]).to.have.property('items')
    expect(data.value[0].items).to.be.an('array')
  })

  it('GET /PurchaseOrders orders by totalAmount desc', async () => {
    const { data } = await GET `/PurchaseOrders?$orderby=totalAmount desc`
    const amounts = data.value.map(po => Number(po.totalAmount))
    for (let i = 0; i < amounts.length - 1; i++) {
      expect(amounts[i]).to.be.at.least(amounts[i + 1])
    }
  })

  it('GET /PurchaseOrders limits with $top', async () => {
    const { data } = await GET `/PurchaseOrders?$top=2`
    expect(data.value.length).to.be.at.most(2)
  })

  // ── CREATE tests ──

  it('POST /PurchaseOrders creates with auto defaults', async () => {
    const { status, data } = await POST('/PurchaseOrders', {
      purchaseOrder: 'PO-TEST-001',
      supplier     : 'Test Vendor Ltd',
      buyer        : 'Test Buyer',
      orderDate    : '2026-07-01',
      deliveryDate : '2026-08-01',
      totalAmount  : 100000
    })
    expect(status).to.equal(201)
    expect(data.status).to.equal('Pending')    // auto default
    expect(data.currency).to.equal('INR')      // auto default
    expect(data.ID).to.be.a('string')          // UUID generated
  })

  it('POST /PurchaseOrders rejects short PO number', async () => {
    defaults.validateStatus = () => true  // don't throw on 4xx
    const { status } = await POST('/PurchaseOrders', {
      purchaseOrder: 'ab',
      supplier     : 'Valid Vendor Ltd',
      buyer        : 'Valid Buyer',
      orderDate    : '2026-07-01',
      deliveryDate : '2026-08-01'
    })
    expect(status).to.equal(400)
    defaults.validateStatus = undefined  // reset
  })

  it('POST /PurchaseOrders rejects delivery before order date', async () => {
    defaults.validateStatus = () => true
    const { status } = await POST('/PurchaseOrders', {
      purchaseOrder: 'PO-DATE-001',
      supplier     : 'Valid Vendor Ltd',
      buyer        : 'Valid Buyer',
      orderDate    : '2026-08-01',
      deliveryDate : '2026-07-01'
    })
    expect(status).to.equal(400)
    defaults.validateStatus = undefined
  })

  // ── UPDATE tests ──

  it('PATCH /PurchaseOrders updates status', async () => {
    // Create first
    const { data: created } = await POST('/PurchaseOrders', {
      purchaseOrder: 'PO-PATCH-001',
      supplier     : 'Patch Vendor Ltd',
      buyer        : 'Patch Buyer',
      orderDate    : '2026-07-01',
      deliveryDate : '2026-08-01'
    })

    // Then update
    const { status } = await PATCH(
      `/PurchaseOrders(${created.ID})`,
      { status: 'Approved' }
    )
    expect(status).to.equal(200)
  })

  // ── DOCUMENT tests ──

  it('POST /uploadDocument uploads successfully', async () => {
    const { data } = await POST('/uploadDocument', {
      filename: 'policy.txt',
      content : 'Travel expenses must be submitted within 30 days. Hotel limit is 5000 INR.'
    })
    expect(data.value).to.include('uploaded successfully')
    expect(data.value).to.include('chunks stored')
  })

  it('POST /uploadDocument rejects empty filename', async () => {
    defaults.validateStatus = () => true
    const { status } = await POST('/uploadDocument', {
      filename: '',
      content : 'some content'
    })
    expect(status).to.equal(400)
    defaults.validateStatus = undefined
  })

  // ── CHAT HISTORY tests ──

  it('GET /ChatHistory returns array', async () => {
    const { status, data } = await GET `/ChatHistory`
    expect(status).to.equal(200)
    expect(data.value).to.be.an('array')
  })
})

describe('ChatService — Programmatic Tests', () => {

  it('queries PurchaseOrders directly without HTTP', async () => {
    const chatService = await cds.connect.to('ChatService')
    const { PurchaseOrders } = chatService.entities

    const results = await chatService.run(
      SELECT.from(PurchaseOrders)
    )
    expect(results).to.be.an('array')
    expect(results.length).to.be.greaterThan(0)
  })

  it('queries only Approved orders', async () => {
    const chatService = await cds.connect.to('ChatService')
    const { PurchaseOrders } = chatService.entities

    const results = await chatService.run(
      SELECT.from(PurchaseOrders).where({ status: 'Approved' })
    )
    results.forEach(po => {
      expect(po.status).to.equal('Approved')
    })
  })
})