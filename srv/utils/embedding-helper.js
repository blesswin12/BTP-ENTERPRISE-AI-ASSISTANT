/**
 * Embedding & Vector Similarity Helper
 * Powered by @xenova/transformers (all-MiniLM-L6-v2, 384 dimensions)
 * Works locally (offline) and in SAP BTP Cloud Foundry for SAP HANA Cloud Vector Engine.
 */

let extractorPromise = null;

/**
 * Returns a cached transformer feature extraction pipeline
 */
async function getExtractor() {
  if (!extractorPromise) {
    const { pipeline } = await import('@xenova/transformers');
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true
    });
  }
  return extractorPromise;
}

/**
 * Generates a normalized 384-dimensional vector embedding for the given text.
 * @param {string} text
 * @returns {Promise<number[]>} 384-element float array
 */
async function generateEmbedding(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return Array.from({ length: 384 }, () => 0.0);
  }

  // 1. If an external embedding URL is explicitly configured, use it
  const embeddingUrl = process.env.EMBEDDING_API_URL;
  if (embeddingUrl) {
    try {
      const isOpenAI = embeddingUrl.toLowerCase().includes('openai.com');
      const headers = { 'Content-Type': 'application/json' };
      if (isOpenAI && process.env.OPENAI_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY}`;
      }
      const body = isOpenAI
        ? JSON.stringify({ input: text, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small', dimensions: 384 })
        : JSON.stringify({ inputs: text });

      const response = await fetch(embeddingUrl, { method: 'POST', headers, body });
      if (response.ok) {
        const data = await response.json();
        return isOpenAI ? data.data?.[0]?.embedding || [] : data[0] || [];
      }
    } catch (err) {
      console.warn(`[Embedding] External API call failed: ${err.message}. Falling back to local model.`);
    }
  }

  // 2. Default: In-process local transformer model (Zero cost, high accuracy)
  try {
    const extractor = await getExtractor();
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  } catch (err) {
    console.error(`[Embedding] Local model extraction error: ${err.message}`);
    return Array.from({ length: 384 }, () => 0.0);
  }
}

/**
 * Computes cosine similarity between two numerical vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Value between -1.0 and 1.0
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

/**
 * Parses raw vector representations from database (Buffer, JSON string, or Array)
 * @param {any} raw
 * @returns {number[]}
 */
function parseVector(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Could be "[0.1, 0.2, ...]" format
      const cleaned = raw.replace(/[\[\]]/g, '').split(',').map(Number);
      if (!cleaned.some(isNaN)) return cleaned;
    }
  }
  if (Buffer.isBuffer(raw)) {
    // Float32Array buffer
    const floats = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    return Array.from(floats);
  }
  return [];
}

module.exports = {
  generateEmbedding,
  cosineSimilarity,
  parseVector
};
