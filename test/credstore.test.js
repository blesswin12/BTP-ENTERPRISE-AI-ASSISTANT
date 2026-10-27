const { expect } = require('chai');
const { getCredential, getPassword, clearCredentialCache, getCredStoreService } = require('../srv/credstore-util');

describe('Credential Store Utility Tests', () => {
  beforeEach(() => {
    clearCredentialCache();
  });

  it('should locate Credential Store binding from environment or default-env.json', () => {
    const service = getCredStoreService();
    expect(service).to.be.an('object');
    expect(service.credentials).to.be.an('object');
    expect(service.credentials.url).to.be.a('string');
  });

  it('should retrieve GROQ_API_KEY from Credential Store', async () => {
    const key = await getCredential('GROQ_API_KEY', 'default');
    expect(key).to.be.a('string');
    expect(key).to.have.lengthOf.at.least(10);
    expect(key.startsWith('gsk_')).to.be.true;
  });

  it('should use in-memory cache for subsequent requests', async () => {
    const start1 = Date.now();
    const key1 = await getPassword('GROQ_API_KEY');
    const duration1 = Date.now() - start1;

    const start2 = Date.now();
    const key2 = await getPassword('GROQ_API_KEY');
    const duration2 = Date.now() - start2;

    expect(key1).to.equal(key2);
    expect(duration2).to.be.lessThan(50);
  });
});
