'use strict'

const cds = require('@sap/cds')
const { GET, POST, PATCH, DELETE, expect } = cds.test()

describe('ChatService — Purchase Orders', () => {

  // ── READ tests ──

  it('GET /PurchaseOrders returns 200', async () => {
    const { status, data } = await GET('/chat/PurchaseOrders')
    expect(status).to.equal(200)
    expect(data.value).to.be.an('array')
    expect(data.value.length).to.be.greaterThan(0)
  })

  it('returns 400 for invalid filter', async () => {
    try {
      await GET("/chat/PurchaseOrders?$filter=invalidField eq 'ABC'")
      expect.fail('Should have thrown 400')
    } catch (err) {
      expect(err.status || err.response?.status).to.equal(400)
    }
  })
  it('GET /PurchaseOrders filters by status', async () => {
    const { data } = await GET("/chat/PurchaseOrders?$filter=status eq 'Approved'")
    expect(data.value).to.be.an('array')
    data.value.forEach(po => {
      expect(po.status).to.equal('Approved')
    })
  })

  it('GET /PurchaseOrders expands items', async () => {
    const { data } = await GET('/chat/PurchaseOrders?$expand=items')
    expect(data.value[0]).to.have.property('items')
    expect(data.value[0].items).to.be.an('array')
  })

  it('GET /PurchaseOrders orders by totalAmount desc', async () => {
    const { data } = await GET('/chat/PurchaseOrders?$orderby=totalAmount desc')
    const amounts = data.value.map(po => Number(po.totalAmount))
    for (let i = 0; i < amounts.length - 1; i++) {
      expect(amounts[i]).to.be.at.least(amounts[i + 1])
    }
  })

  it('GET /PurchaseOrders limits with $top', async () => {
    const { data } = await GET('/chat/PurchaseOrders?$top=2')
    expect(data.value.length).to.be.at.most(2)
  })

  // ── CREATE tests ──

  it('POST /PurchaseOrders creates with auto defaults', async () => {
    const { status, data } = await POST('/chat/PurchaseOrders', {
      purchaseOrder: 'PO-TEST-001',
      supplier     : 'Test Vendor Ltd',
      buyer        : 'Test Buyer',
      orderDate    : '2026-07-01',
      deliveryDate : '2026-08-01',
      totalAmount  : 100000
    })
    expect(status).to.equal(201)
    expect(data.status).to.equal('Pending')
    expect(data.currency).to.equal('INR')
    expect(data.ID).to.be.a('string')
  })

  it('POST /PurchaseOrders rejects short PO number', async () => {
    try {
      await POST('/chat/PurchaseOrders', {
        purchaseOrder: 'ab',
        supplier     : 'Valid Vendor Ltd',
        buyer        : 'Valid Buyer',
        orderDate    : '2026-07-01',
        deliveryDate : '2026-08-01'
      })
      expect.fail('Should have thrown 400')
    } catch (err) {
      expect(err.status || err.response?.status).to.equal(400)
    }
  })

  it('POST /PurchaseOrders rejects delivery before order date', async () => {
    try {
      await POST('/chat/PurchaseOrders', {
        purchaseOrder: 'PO-DATE-001',
        supplier     : 'Valid Vendor Ltd',
        buyer        : 'Valid Buyer',
        orderDate    : '2026-08-01',
        deliveryDate : '2026-07-01'
      })
      expect.fail('Should have thrown 400')
    } catch (err) {
      expect(err.status || err.response?.status).to.equal(400)
    }
  })

  // ── UPDATE tests ──

  it('PATCH /PurchaseOrders updates status', async () => {
    const { data: created } = await POST('/chat/PurchaseOrders', {
      purchaseOrder: 'PO-PATCH-001',
      supplier     : 'Patch Vendor Ltd',
      buyer        : 'Patch Buyer',
      orderDate    : '2026-07-01',
      deliveryDate : '2026-08-01'
    })

    const isActive = created.IsActiveEntity !== undefined ? created.IsActiveEntity : false
    const res = await PATCH(
      `/chat/PurchaseOrders(ID=${created.ID},IsActiveEntity=${isActive})`,
      { status: 'Approved' }
    )
    expect(res.status).to.equal(200, `Got status ${res.status}. Data: ${JSON.stringify(res.data)}`)
  })

  // ── DOCUMENT tests ──

  it('POST /uploadDocument uploads successfully', async () => {
    const { status, data } = await POST('/chat/uploadDocument', {
      filename: 'policy.txt',
      content : 'Travel expenses must be submitted within 30 days. Hotel limit is 5000 INR.'
    })
    expect(status).to.equal(200)
    expect(data.value).to.be.a('string')
    expect(data.value).to.include('upload accepted')
  })

  it('POST /uploadDocument rejects empty filename', async () => {
    try {
      await POST('/chat/uploadDocument', {
        filename: '',
        content : 'some content'
      })
      expect.fail('Should have thrown 400')
    } catch (err) {
      expect(err.status || err.response?.status).to.equal(400)
    }
  })

  // ── CHAT HISTORY tests ──

  it('GET /ChatHistory returns array', async () => {
    const { status, data } = await GET('/chat/ChatHistory')
    expect(status).to.equal(200)
    expect(data.value).to.be.an('array')
  })

  // ── DOCUMENTS ──

  it('GET /Documents returns array', async () => {
    const { status, data } = await GET('/chat/Documents')
    expect(status).to.equal(200)
    expect(data.value).to.be.an('array')
  })
})

describe('ChatService — Programmatic Tests', () => {

  it('queries PurchaseOrders directly without HTTP', async () => {
    const chatService = await cds.connect.to('ChatService')
    const { PurchaseOrders } = chatService.entities
    const results = await chatService.run(SELECT.from(PurchaseOrders))
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