const cds = require('@sap/cds')

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

async function callGroq(systemPrompt, userMessage) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 18 or newer.')
  }

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  }
      ],
      max_tokens: 1024,
      temperature: 0.3
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq API request failed with ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const answer = data?.choices?.[0]?.message?.content
  if (!answer) {
    throw new Error('Groq API response did not contain an answer')
  }

  r
function getQuestion(req) {
  const question = req.data?.question
  if (!question || typeof question !== 'string' || !question.trim()) {
    req.reject(400, 'Question is required')
  }
  return question.trim()
}

function toTimestamp() {
  return new Date().toISOString()
}

module.exports = cds.service.impl(async function () {
  const { PurchaseOrders, ChatHistory, Documents } = this.entities
  const { Embeddings } = cds.entities('enterprise.ai')

  // Feature 1 — Analytics Chat (queries PurchaseOrders)
  this.on('askAnalytics', async req => {
    const question = getQuestion(req)
    const tx = cds.tx(req)
    const orders = await tx.run(SELECT.from(PurchaseOrders))
    const dataContext = JSON.stringify(orders, null, 2)

    const systemPrompt = `You are a procurement analytics assistant.
You have access to the following purchase order data:
${dataContext}

Answer the user's question using only this data.
Be concise, use numbers, and mention percentages where relevant.
Format your answer in plain text.`

    const answer = await callGroq(systemPrompt, question)

    await tx.run(INSERT.into(ChatHistory).entries({
      ID           : cds.utils.uuid(),
      userQuestion : question,
      aiResponse   : answer,
      feature      : 'Analytics',
      timestamp    : toTimestamp()
    }))

    return answer
  })

  // Feature 2 — RAG Document Search
  this.on('askDocument', async req => {
    const question = getQuestion(req)
    const tx = cds.tx(req)
    const searchTerm = question.split(/\s+/).find(Boolean)

    const query = SELECT.from(Embeddings).limit(5)
    if (searchTerm) {
      query.where({ chunkText: { like: `%${searchTerm}%` } })
    }

    const chunks = await tx.run(query)
    if (!chunks.length) {
      return "Sorry, I couldn't find any relevant information in the documents."
    }

    const context = chunks.map(chunk => chunk.chunkText).join('\n\n')

    const systemPrompt = `You are a document assistant.
Answer the user's question using only the following document excerpts:

${context}

If the answer is not in the excerpts, say "I could not find this in the uploaded documents."`

    const answer = await callGroq(systemPrompt, question)

    await tx.run(INSERT.into(ChatHistory).entries({
      ID           : cds.utils.uuid(),
      userQuestion : question,
      aiResponse   : answer,
      feature      : 'rag',
      timestamp    : toTimestamp()
    }))

    return answer
  })

  // Feature 3 — Upload Document for RAG
  this.on('uploadDocument', async req => {
    const { filename, content } = req.data || {}
    if (!filename || typeof filename !== 'string' || !filename.trim()) {
      req.reject(400, 'filename is required')
    }
    if (!content || typeof content !== 'string') {
      req.reject(400, 'content is required')
    }

    const tx = cds.tx(req)
    const docID   = cds.utils.uuid()
    const fileName = filename.trim()

    await tx.run(INSERT.into(Documents).entries({
      ID         : docID,
      fileName,
      content,
      uploadedAt : toTimestamp(),
      fileType   : 'text'
    }))

    const chunkSize = 500
    const chunks = []
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.substring(i, i + chunkSize))
    }

    await tx.run(INSERT.into(Embeddings).entries(
      chunks.map((chunk, index) => ({
        ID         : cds.utils.uuid(),
        documentID : docID,
        chunkText  : chunk,
        chunkIndex : index,
        embedding  : '[]'
      }))
    ))

    return `Document "${fileName}" uploaded successfully. ${chunks.length} chunks stored.`
  })

  // Feature 4 — Executive Summary (queries PurchaseOrders)
  this.on('getSummary', async req => {
    const tx = cds.tx(req)
    const orders = await tx.run(SELECT.from(PurchaseOrders))
    const dataContext = JSON.stringify(orders, null, 2)

    const systemPrompt = `You are a procurement intelligence assistant.
Analyze the following purchase order data and generate a concise executive summary:
${dataContext}

Include:
- Total procurement spend
- Number of approved, pending, rejected orders
- Top supplier by order value
- Key observations
- 2-3 recommendations

Keep it under 200 words. Use bullet points.`

    const answer = await callGroq(systemPrompt, 'Generate Executive Summary')

    await tx.run(INSERT.into(ChatHistory).entries({
      ID           : cds.utils.uuid(),
      userQuestion : 'Generate Executive Summary',
      aiResponse   : answer,
      feature      : 'Summary',
      timestamp    : toTimestamp()
    }))

    return answer
  })
})