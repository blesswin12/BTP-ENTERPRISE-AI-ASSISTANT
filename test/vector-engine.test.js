const { expect } = require('chai');
const { generateEmbedding, cosineSimilarity, parseVector } = require('../srv/utils/embedding-helper');

describe('Vector Engine & Embeddings Tests', () => {

  it('should generate a 384-dimensional vector for input text', async () => {
    const vector = await generateEmbedding('SAP HANA Cloud Vector Engine semantic test');
    expect(vector).to.be.an('array');
    expect(vector).to.have.lengthOf(384);
    expect(vector.every(val => typeof val === 'number' && !isNaN(val))).to.be.true;
  });

  it('should compute higher cosine similarity for semantically related texts', async () => {
    const v1 = await generateEmbedding('Vendor invoices and procurement orders');
    const v2 = await generateEmbedding('Supplier billing and purchase order receipts');
    const v3 = await generateEmbedding('Astronomical telescopes orbiting distant galaxies');

    const simRelated = cosineSimilarity(v1, v2);
    const simUnrelated = cosineSimilarity(v1, v3);

    expect(simRelated).to.be.greaterThan(simUnrelated);
    expect(simRelated).to.be.greaterThan(0.25);
    expect(simUnrelated).to.be.lessThan(0.15);
  });

  it('should correctly parse vector from arrays and buffers', () => {
    const original = [0.1, 0.2, 0.3];
    expect(parseVector(original)).to.deep.equal(original);
    expect(parseVector(JSON.stringify(original))).to.deep.equal(original);

    const f32 = new Float32Array([1.5, 2.5, 3.5]);
    const buf = Buffer.from(f32.buffer);
    const parsedBuf = parseVector(buf);
    expect(parsedBuf[0]).to.be.closeTo(1.5, 0.001);
    expect(parsedBuf[1]).to.be.closeTo(2.5, 0.001);
    expect(parsedBuf[2]).to.be.closeTo(3.5, 0.001);
  });
});
