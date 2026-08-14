const { expect } = require('chai');
const { optimizeContextForAI, toTokenOptimizedJSON } = require('../srv/utils/context-helper');

describe('Token Optimization Utility Tests', () => {
    it('should strip OData metadata and draft properties', () => {
    const rawODataRecord = {
        '@odata.context': '$metadata#PurchaseOrders/$entity',
        '@odata.etag': 'W/"123456"',
        IsActiveEntity: true,
        HasDraftEntity: false,
        purchaseOrder: 'PO-9901',
        supplier: 'Acme Corp',
        totalAmount: 50000,
        nullField: null
    };

    const cleaned = optimizeContextForAI(rawODataRecord);

    expect(cleaned).to.not.have.property('@odata.context');
    expect(cleaned).to.not.have.property('@odata.etag');
    expect(cleaned).to.not.have.property('IsActiveEntity');
    expect(cleaned).to.not.have.property('nullField');

    expect(cleaned.purchaseOrder).to.equal('PO-9901');
    expect(cleaned.supplier).to.equal('Acme Corp');
    });

    it('should produce token-optimized JSON string', () => {
    const records = [
        { purchaseOrder: 'PO-01', supplier: 'Vendor A', '@odata.id': '1' }
    ];

    const jsonString = toTokenOptimizedJSON(records, ['purchaseOrder', 'supplier']);
    expect(jsonString).to.not.include('@odata.id');
    expect(jsonString).to.include('PO-01');
    });
});