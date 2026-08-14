const cds = require('@sap/cds');
const { expect } = require('chai');

describe('Context Propagation Tests', () => {
  it('should propagate context correctly', async () => {
    const testContext = new cds.EventContext({
      user: new cds.User('test-user-01'),
      tenant: 'test-tenant-100',
      id: 'test-correlation-id-123'
    });

    cds.context = testContext;

    expect(cds.context.user.id).to.equal('test-user-01');
    expect(cds.context.tenant).to.equal('test-tenant-100');
    expect(cds.context.id).to.equal('test-correlation-id-123');
  });
});
