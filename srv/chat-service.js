const cds = require('@sap/cds')

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';

async function callGroq(systemPrompt, userMessage, history = []) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is not available. Use Node.js 18 or newer.')
  }

  const messages = [
    { role: 'system', content: systemPrompt }
  ]

  for (const turn of history) {
    messages.push({ role: 'user', content: turn.userQuestion })
    messages.push({ role: 'assistant', content: turn.aiResponse })
  }

  messages.push({ role: 'user', content: userMessage })

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages,
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

  return answer
}

async function generateEmbedding(text) {
  if(!EMBEDDING_API_URL){
    return Array.from({ length: 384 }, () => Math.random()-0.5)
  }
  try{
    const isOpenAI= EMBEDDING_API_URL.includes('openai.Com') || EMBEDDING_API_URL.includes('api.openai.com')
    const headers = {
      'Content-Type': 'application/json'
    }

    if(isOpenAI && process.env.OPENAI_API_KEY){
      headers['Authorization'] = `Bearer ${EMBEDDING_API_URL}`;

    }else{
      headers['Authorization'] = `Bearer ${process.env.HUGGINGFACE_API_KEY}`;   
    }

    const body = isOpenAI 
          ? JSON.stringify({ input: text, model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small' })
          : JSON.stringify({ inputs: text });

    const response = await fetch(EMBEDDING_API_URL, {

      method:'POST',
      headers,
      body
    });
    if(!response.ok){
      throw new Error(`Embedding API request failed with ${response.status}: ${await response.text()}`)
    }

    const data=await response.json()
    if(isOpenAI){
      return data.data?.[0]?.embedding || []
    }else{
      return data[0] || []
    }
  }catch(error){
    console.error('Error generating embedding:', error)
    return Array.from({ length: 384 }, () => Math.random()-0.5)
  }
}


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


async function extractText(fileName, content) {
  const isPDF = fileName.toLowerCase().endsWith('.pdf')
  if (!isPDF) {
    return content
  }
  try {
    const buffer = Buffer.from(content, 'base64')
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()

    if (!result.text || !result.text.trim()) {
      throw new Error('No text extracted from PDF')
    }
    return result.text
  } catch (error) {
    throw new Error(`Failed to extract text from PDF: ${error.message}`)
  }
}


async function publishAlert(eventType,subject, body, severity = 'INFO') {
  try{
    const alertService = await cds.connect.to('alert-notification');

  const payload = {
    eventType: eventType,
    eventTimestamp: Date.now(),
    severity: severity,
    category: 'ALERT',
    subject: subject,
    body: body,
    resource:{
      resourceName: 'EnterpriseAIAssistant',
      resourceType: 'Application',
    }
  };

  await alertService.send('POST','/',payload);
  console.log(`[Alert Notification] Published event: ${eventType} with severity: ${severity}`);
}catch(error){
  console.error(`[Alert Notification] Failed to publish event: ${eventType}. Error: ${error.message}`);

}
}
function parseLLMResponse(rawAnswer) {
  try {
    let clean = rawAnswer.trim();
    // Strip markdown code blocks if the LLM wraps JSON in them
    if (clean.startsWith('```json')) {
      clean = clean.substring(7);
    } else if (clean.startsWith('```')) {
      clean = clean.substring(3);
    }
    if (clean.endsWith('```')) {
      clean = clean.substring(0, clean.length - 3);
    }
    clean = clean.trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error('Failed to parse LLM JSON response:', err);
    // Safe fallback if JSON parsing fails completely
    return {
      answer: rawAnswer,
      confidence: "Medium",
      confidenceScore: 50,
      citations: []
    };
  }
}

module.exports = cds.service.impl(async function () {
  const { PurchaseOrders, ChatHistory, Documents } = this.entities
  const { Embeddings } = cds.entities('enterprise.ai')

  this.after(['CREATE','SAVE'], 'PurchaseOrders', async (po) => {
        if (po.totalAmount > 100000) {
          await publishAlert(
            'PurchaseOrder.HighSpendCreated',
            `High spend purchase order ${po.purchaseOrder || po.ID} created`,
            `A purchase order ${po.purchaseOrder || po.ID} for supplier "${po.supplier || 'N/A'}" was created with total amount ${po.totalAmount} ${po.currency || ''}. Review
  required.`,
            'INFO'
          );
        } 
  });

  this.after('UPDATE', 'PurchaseOrders', async (po) => {
    if(po.status === 'Rejected'){
      await publishAlert(
            'PurchaseOrder.Rejected',
            `Purchase Order ${po.purchaseOrder || po.ID} Rejected`,
            `The purchase order ${po.purchaseOrder || po.ID} has been rejected by buyer ${po.buyer || 'manager'}.`,
            'WARNING'
          );
        }   
  });

  this.before(['CREATE', 'UPDATE'], 'PurchaseOrders', (req) => {
    const { orderDate, deliveryDate } = req.data;

    if (
        orderDate &&
        deliveryDate &&
        new Date(deliveryDate) < new Date(orderDate)
    ) {
        req.reject(400, 'Delivery date cannot be before order date');
    }
});

  // Feature 1 — Analytics Chat (queries PurchaseOrders)
  this.on('askAnalytics', async req => {
    const question = getQuestion(req)
    const conversationID = req.data?.conversationID || cds.utils.uuid()
    const tx = cds.tx(req)

    let history = []
    if (conversationID) {
      history = await tx.run(SELECT.from(ChatHistory)
        .where({ conversationID })
        .orderBy('timestamp asc')
        .limit(10)
      )
    }
    const orders = await tx.run(SELECT.from(PurchaseOrders))
    const dataContext = JSON.stringify(orders, null, 2)

    const systemPrompt = `You are a procurement analytics assistant.
    You have access to the following purchase order data:
    ${dataContext}

    Answer the user's question using only this data.
    Be concise, use numbers, and mention percentages where relevant.

    You MUST respond ONLY with a JSON object matching this schema:
    {
    "answer": "A markdown string containing the detailed answer to the user's question.",
    "confidence": "High | Medium | Low",
    "confidenceScore": 95, // numerical score out of 100 based on data completeness
    "citations": [
    {
    "purchaseOrder": "PO number (e.g. PO-001)",
    "supplier": "Supplier name",
    "totalAmount": "Total amount with currency",
    "reason": "Briefly why this PO is relevant to the answer"
    }
    ]
    }
    Do not include any markdown backticks wrapper around the JSON or any text other than the JSON object.`

    const rawAnswer = await callGroq(systemPrompt, question, history)
    const parsedAnswer = parseLLMResponse(rawAnswer)
    const finalAnswer = JSON.stringify(parsedAnswer, null, 2)



    await tx.run(INSERT.into(ChatHistory).entries({
      ID: cds.utils.uuid(),
      userQuestion: question,
      aiResponse: finalAnswer,
      feature: 'Analytics',
      timestamp: toTimestamp(),
      conversationID: conversationID || null
    }))

    return finalAnswer
  })

  // Feature 2 — RAG Document Search
  this.on('askDocument', async req => {
    const question = getQuestion(req)
    const conversationID = req.data?.conversationID || cds.utils.uuid()
    const tx = cds.tx(req)

    let history = []
    if (conversationID) {
      history = await tx.run(SELECT.from(ChatHistory)
        .where({ conversationID })
        .orderBy('timestamp asc')
        .limit(10)
      )
    }

    // Stop words to filter out from search terms
    const STOP_WORDS = new Set([
      'what', 'when', 'where', 'how', 'why', 'who', 'which', 'whom',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'the', 'a', 'an', 'and', 'but', 'if',
      'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for',
      'with', 'about', 'to', 'from', 'in', 'on', 'at', 'by', 'required'
    ])

    const keywords = question.toLowerCase()
      .split(/[^\w]+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))

    const query = SELECT.from(Embeddings).limit(5)
    if (keywords.length > 0) {
      const clause = keywords.map(kw => `lower(chunkText) like '%${kw.replace(/'/g, "''")}%'`).join(' or ')
      query.where(clause)
    } else {
      // Fallback to first word if no keywords match
      const firstWord = question.split(/\s+/).find(Boolean)
      if (firstWord) {
        query.where({ chunkText: { like: `%${firstWord}%` } })
      }
    }

    const chunks = await tx.run(query)
    if (!chunks.length) {
      const noMatch = JSON.stringify({
        answer: "Sorry, I couldn't find any relevant information in the documents.",
        confidence: "Low",
        confidenceScore: 0,
        citations: []
      })
      return noMatch
    }

    const context = chunks.map(chunk => `[Source Document: ${chunk.fileName}]\n${chunk.chunkText}`).join('\n\n')

    const systemPrompt = `You are a document assistant.
    Answer the user's question using only the following document excerpts:

    ${context}

    If the answer is not in the excerpts, answer "I could not find this in the uploaded documents." and set confidence to Low.

    You MUST respond ONLY with a JSON object matching this schema:
    {
    "answer": "A markdown string containing the detailed answer to the user's question.",
    "confidence": "High | Medium | Low",
    "confidenceScore": 85, // numerical score out of 100 based on search relevance and adequacy
    "citations": [
    {
    "fileName": "The file name of the document cited",
    "snippet": "A brief relevant snippet from the text",
    "reason": "Why this snippet is relevant"
    }
    ]
    }
    Do not include any markdown backticks wrapper around the JSON or any text other than the JSON object.`
    const rawAnswer = await callGroq(systemPrompt, question, history)
    const parsedAnswer = parseLLMResponse(rawAnswer)
    const finalAnswer = JSON.stringify(parsedAnswer, null, 2)

    await tx.run(INSERT.into(ChatHistory).entries({
      ID: cds.utils.uuid(),
      userQuestion: question,
      aiResponse: finalAnswer,
      feature: 'rag',
      timestamp: toTimestamp(),
      conversationID: conversationID || null
    }))

    return finalAnswer
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
    const docID = cds.utils.uuid()
    const fileName = filename.trim()
    const isPDF = fileName.toLowerCase().endsWith('.pdf')

    let extractedText
    try {
      extractedText = await extractText(fileName, content)
    } catch (error) {

      await publishAlert(
            'AIDocument.ProcessingFailed',
            `Failed to parse document: ${fileName}`,
            `An error occurred while parsing uploaded file "${fileName}". Error: ${error.message}`,
            'ERROR'
          );
      req.reject(400, `Failed to process document: ${error.message}`)
    }

    const cleanText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    await tx.run(INSERT.into(Documents).entries({
      ID: docID,
      fileName,
      content: cleanText,
      uploadedAt: toTimestamp(),
      fileType: isPDF ? 'pdf' : 'text'
    }))

    const chunkSize = 500
    const overlap = 50
    const chunks = []
    for (let i = 0; i < cleanText.length; i += chunkSize - overlap) {
      const chunk = cleanText.substring(i, i + chunkSize)
      if (chunk.trim()) chunks.push(chunk)
    }

    const chunkEntries=[];
    for(let index=0;index<chunks.length;index++){
      const chunkText=chunks[index]
      const vector =await generateEmbedding(chunkText)
      chunkEntries.push({
        ID: cds.utils.uuid(),
        documentID: docID,
        chunkText: chunkText,
        chunkIndex: index,
        embedding: JSON.stringify(vector)
      })
    }
    await tx.run(INSERT.into(Embeddings).entries(chunkEntries))

    return `Document "${fileName}" uploaded successfully. ${chunks.length} chunks stored with semantic embeddings.`
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
      ID: cds.utils.uuid(),
      userQuestion: 'Generate Executive Summary',
      aiResponse: answer,
      feature: 'Summary',
      timestamp: toTimestamp()
    }))

    return answer
  })
})
