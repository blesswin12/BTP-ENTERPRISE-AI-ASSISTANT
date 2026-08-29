const cds = require('@sap/cds')

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'
const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || 'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2';
const { getRequestContext, logWithContext } = require('./utils/context-helper');


async function callGroq(systemPrompt, userMessage, history = []) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured')
  }

  const ctx = getRequestContext();
  logWithContext('info', `Sending AI prompt to Groq (Model: ${GROQ_MODEL})`, console);

  // if (typeof fetch !== 'function') {
  //   throw new Error('Global fetch is not available. Use Node.js 18 or newer.')
  // }

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
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'X-Correlation-ID': ctx.correlationId
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: messages,
      max_tokens: 1024,
      temperature: 0.3
    })
  })

  if (!response.ok) {
    const errorText = await response.text();
    logWithContext('error', `Groq API failed: ${errorText}`);
    throw new Error(`Groq API request failed with ${response.status}: ${errorText}`);
  }

  const data = await response.json()
  return data?.choices?.[0]?.message?.content
}


async function getRecentChangeLogs(tx, limit=50){
  const Changes = cds.entities?.['sap.changelog.Changes'] || cds.entities?.['sap.changelog.ChangeLog'];
  if(!Changes) return []

  const db = await cds.connect.to('db');
  return await db.run(
    SELECT.from(Changes)
      .columns('ID','entity','entityKey','objectID','attribute','valueChangedFrom','valueChangedTo', 'modification', 'createdBy', 'createdAt' )
      .orderBy('createdAt desc')
      .limit(limit)
  );
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
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()

    if (!result.text || !result.text.trim()) {
      throw new Error('No text extracted from PDF')
    }
    return result.text
  } catch (error) {
    logWithContext('error', `Failed to extract text from PDF: ${error.message}`, console);
    throw new Error(`Failed to extract text from PDF: ${error.message}`)
  }
}


// async function publishAlert(eventType,subject, body, severity = 'INFO') {
//   try{
//     const alertService = await cds.connect.to('alert-notification');

//     const payload = {
//       eventType: eventType,
//       eventTimestamp: Math.floor(Date.now() / 1000),
//       severity: severity,
//       category: 'ALERT',
//       subject: subject,
//       body: body,
//       resource:{
//         resourceName: 'EnterpriseAIAssistant',
//         resourceType: 'Application',
//       }
//     };

//   await alertService.send('POST','/',payload);
//   console.log(`[Alert Notification] Published event: ${eventType} with severity: ${severity}`);
// }catch(error){
//   console.error(`[Alert Notification] Failed to publish event: ${eventType}. Error: ${error.message}`);

// }
// }

async function publishAlert(po) {
      try {
        const notifications = await cds.connect.to('notifications');
    
        await notifications.notify('PurchaseOrderHighSpendCreated', {
          recipients: ['manager@company.com', 'blesswinsj@gmail.com'],
          data: {
            poID: po.purchaseOrder || po.ID,
            supplier: po.supplier || 'N/A',
            amount: po.totalAmount,
            currency: po.currency || 'INR'
          }
        });
    
        console.log(`[CALESI Notification] High spend alert sent for PO: ${po.purchaseOrder || po.ID}`);
      } catch (error) {
        console.error(`[CALESI Notification Error] ${error.message}`);
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
  const Embeddings = cds.entities?.['enterprise.ai.Embeddings'] || cds.model?.definitions?.['enterprise.ai.Embeddings'];

  const messaging = await cds.connect.to('messaging');

  function calculateCriticality(po) {
    if (!po) return;
    if (po.status === 'Approved' || po.status === 'Completed' || po.status === 'Ordered') {
      po.criticality = 3; // Positive (Green)
    } else if (po.status === 'Pending' || po.status === 'Partially Delivered' || po.status === 'Draft') {
      po.criticality = 2; // Critical (Orange/Yellow)
    } else if (po.status === 'Rejected' || po.status === 'Cancelled') {
      po.criticality = 1; // Negative (Red)
    } else {
      po.criticality = 0; // Neutral
    }
  }

  this.after('READ', ['PurchaseOrders', 'PurchaseOrders.drafts'], (data) => {
    if (Array.isArray(data)) {
      data.forEach(po => calculateCriticality(po));
    } else if (data) {
      calculateCriticality(data);
    }
  });

  messaging.on('enterprise/ai/po/Created', async (msg) => {
    const { purchaseOrder, supplier, totalAmount, currency, ID, buyer, status, orderDate, deliveryDate } = msg.data || {};
    if (!purchaseOrder || !supplier || !totalAmount) {
      console.warn('[Event Mesh Warning] Missing required fields in event data. Skipping processing.');
      return;
    }
    try {
      const existing = await SELECT.one.from(PurchaseOrders).where({ purchaseOrder });
      const poID = ID || (existing ? existing.ID : cds.utils.uuid());
      await UPSERT.into(PurchaseOrders).entries({
        ID: poID, 
        purchaseOrder,
        supplier, 
        buyer: buyer || (existing ? existing.buyer : null),
        totalAmount,
        currency: currency || (existing ? existing.currency : 'USD'),
        status: status || (existing ? existing.status : 'Pending'),  
        orderDate: orderDate || (existing ? existing.orderDate : new Date().toISOString().split('T')[0]),
        deliveryDate: deliveryDate || (existing ? existing.deliveryDate : new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]) 
      });
      console.log(`[Event Mesh Processing] Purchase Order ${purchaseOrder} upserted successfully.`);

    } catch (error) {  
      console.error(`[Event Mesh Error] Failed to upsert Purchase Order ${purchaseOrder}. Error: ${error.message}`);
    }
  });

  this.after(['CREATE','SAVE'], 'PurchaseOrders', async (po) => {
    if (po.totalAmount > 100000) {
      await publishAlert(po);
    } 
  });

  this.after('SAVE', 'PurchaseOrders', async (po) => {
    if (po.IsActiveEntity === false) return; // Skip if it's a draft save
    await messaging.emit('enterprise/ai/po/Created', {
      ID: po.ID,
      purchaseOrder: po.purchaseOrder || po.ID,
      supplier: po.supplier,
      buyer: po.buyer,
      totalAmount: po.totalAmount,
      currency: po.currency || 'USD',
      status: po.status || 'Pending',
      orderDate: po.orderDate,
      deliveryDate: po.deliveryDate,
      timestamp: new Date().toISOString()
    });
  });
  // this.after('UPDATE', 'PurchaseOrders', async (po) => {
  //   if(po.status === 'Rejected'){
  //     await publishAlert(
  //           'PurchaseOrder.Rejected',
  //           `Purchase Order ${po.purchaseOrder || po.ID} Rejected`,
  //           `The purchase order ${po.purchaseOrder || po.ID} has been rejected by buyer ${po.buyer || 'manager'}.`,
  //           'WARNING'
  //         );
  //       }   
  // });

  this.after('UPDATE', 'PurchaseOrders', async (po) => {
    if (po.status === 'Rejected') {
      try {
        const notifications = await cds.connect.to('notifications');
        await notifications.notify('PurchaseOrderRejected', {
          recipients: ['buyer@company.com', 'blesswinsj@gmail.com'],
          data: {
            poID: po.purchaseOrder || po.ID,
            buyer: po.buyer || 'manager'
          }
        });
        console.log(`[CALESI Notification] Rejection alert sent for PO: ${po.purchaseOrder || po.ID}`);
      } catch (error) {
        console.error(`[CALESI Notification Error] ${error.message}`);
      }
    }   
  });

        // Emit event when a Purchase Order status is updated
  this.after('UPDATE', 'PurchaseOrders', async (po) => {
    try {
      await messaging.emit('enterprise/ai/po/Updated', {
        purchaseOrder: po.purchaseOrder || po.ID,
        supplier: po.supplier,
        buyer: po.buyer,
        totalAmount: po.totalAmount,
        currency: po.currency || 'USD',
        status: po.status,
        timestamp: new Date().toISOString()
      });
      console.log(`[Event Mesh Publish] Sent 'enterprise/ai/po/Updated' for PO: ${po.purchaseOrder || po.ID}`);
    } catch (err) {
      console.error(`[Event Mesh Publish Error] ${err.message}`);
    }
  });

  this.before(['CREATE', 'UPDATE', 'NEW', 'SAVE'], ['PurchaseOrders', 'PurchaseOrders.drafts'], (req) => {
    const { purchaseOrder, orderDate, deliveryDate } = req.data;

    if (purchaseOrder && purchaseOrder.length < 5) {
      req.reject(400, 'Purchase Order number must be at least 5 characters long');
    }

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
    const tx = cds.tx(req);

    const orders = await tx.run(SELECT.from(PurchaseOrders));
    const changelogs = await getRecentChangeLogs(tx);

    let history = []
    if (conversationID) {
      history = await tx.run(SELECT.from(ChatHistory)
        .where({ conversationID })
        .orderBy('timestamp asc')
        .limit(10)
      )
    }

    const systemPrompt = `You are an expert SAP Enterprise Procurement & Audit Analytics Assistant.
    Your job is to answer user queries accurately by analyzing both CURRENT purchase order records and HISTORICAL change tracking audit logs.
    
    =========================================
    DATA CONTEXT
    =========================================m
    [CURRENT PURCHASE ORDERS]
    ${JSON.stringify(orders, null, 2)}
    
    [HISTORICAL CHANGE LOGS (sap.changelog.ChangeLog)]
    ${JSON.stringify(changelogs, null, 2)}
    
    =========================================
    REASONING & GROUNDING RULES
    =========================================
    1. CURRENT VS. HISTORICAL QUERIES:
       - If the user asks about current status, spend totals, suppliers, or line items -> Use [CURRENT PURCHASE ORDERS].
       - If the user asks about past changes, approvals, rejections, price/quantity deltas, postponements, or WHO modified a record -> Cross-
  examine [HISTORICAL CHANGE LOGS] matching the entityID or purchaseOrder.
    
    2. NO GUESSWORK (AVOID "LIKELY"):
       - When an audit record exists in [HISTORICAL CHANGE LOGS], state the exact user ('modifiedBy'), timestamp ('modifiedAt'), and
  before/after values ('oldValue' -> 'newValue') with 100% factual certainty.
       - If no change log exists for a specific historical inquiry, state clearly: "No historical modification record found in the audit log"
  rather than guessing.
    
    3. CALCULATION & DELTAS:
       - When explaining price or quantity increases/decreases, show the exact delta (e.g., "increased from 10 to 25 units (+150%) raising
  the total from $10,000 to $25,000").
    
    4. CONFIDENCE SCORING:
       - High (90-100): Direct factual match found in Current Orders and/or Historical Change Logs.
       - Medium (60-89): Current order found, but historical timeline is partially inferred.
       - Low (0-59): Incomplete data or requested order does not exist.
    
    =========================================
    STRICT OUTPUT FORMAT
    =========================================
    You MUST respond ONLY with a raw JSON object matching the schema below. 
    Do NOT include any markdown code fences (\`\`\`json or \`\`\`), introduction, or trailing text.
    
    {
      "answer": "A clear, professional markdown response detailing the answer with bold highlights, user mentions, and timestamps where
  appropriate.",
      "confidence": "High | Medium | Low",
      "confidenceScore": 95,
      "citations": [
        {
          "sourceType": "PurchaseOrders | ChangeLog",
          "documentNumber": "PO-1001 or UUID",
          "supplier": "Supplier name if applicable",
          "attributeChanged": "e.g. status, totalAmount, deliveryDate (or null for static snapshot)",
          "oldValue": "previous value or null",
          "newValue": "current/updated value",
          "modifiedBy": "user email/ID or null",
          "modifiedAt": "ISO timestamp or null",
          "reason": "Brief explanation of why this record proves the answer"
        }
      ]
    }`;


    
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






  //////////////////////////////////////////////////
  // Feature 3 — Upload Document for RAG
  // this.on('uploadDocument', async req => {
  //   const { filename, content } = req.data || {}
  //     if (!filename || !content) return req.reject(400, 'filename and content are required');

  //     const tx = cds.tx(req)
  //     const docID = cds.utils.uuid()
  //     const isPDF = filename.toLowerCase().endsWith('.pdf')

  //     // let extractedText
  //     // try {
  //     //   extractedText = await extractText(filename, content)
  //     // } catch (error) {
  //     //   console.error(`[Upload Document Error] ${error.message}`);
  //     //   return req.reject(400, `Failed to process document: ${error.message}`)
  //     // }

  //     // const cleanText = extractedText
  //     //   .replace(/\r\n/g, '\n')
  //     //   .replace(/\n{3,}/g, '\n\n')
  //     //   .trim()

  //     await tx.run(INSERT.into(Documents).entries({
  //       ID: docID,
  //       fileName: filename.trim(),
  //       content: isPDF ? 'Processing...' : content,
  //       uploadedAt: new Date().toISOString(),
  //       fileType: isPDF ? 'pdf' : 'text'
  //     }))

  //     // const chunkSize = 500
  //     // const overlap = 50
  //     // const chunks = []
  //     // for (let i = 0; i < cleanText.length; i += chunkSize - overlap) {
  //     //   const chunk = cleanText.substring(i, i + chunkSize)
  //     //   if (chunk.trim()) chunks.push(chunk)
  //     // }

  //     cds.spawn({ tenant: cds.context.tenant, user: cds.context.user }),async (bgTx) => {
  //       try {
  //         const extractedText = await extractText(filename, content);
  //         const cleanText = extractedText.replace(/\r\n/g, '\n').trim();
    
  //         // Update full extracted content
  //         await bgTx.run(UPDATE(Documents).set({ content: cleanText }).where({ ID: docID }));
    
  //         // Split into chunks and call HuggingFace/OpenAI embedding API
  //         const chunkSize = 500, overlap = 50;
  //         const chunks = [];
  //         for (let i = 0; i < cleanText.length; i += chunkSize - overlap) {
  //           const chunk = cleanText.substring(i, i + chunkSize);
  //           if (chunk.trim()) chunks.push(chunk);
  //         }
    
  //         const chunkEntries = [];
  //         for (let idx = 0; idx < chunks.length; idx++) {
  //           const vector = await generateEmbedding(chunks[idx]);
  //           chunkEntries.push({
  //             ID: cds.utils.uuid(),
  //             documentID: docID,
  //             chunkText: chunks[idx],
  //             chunkIndex: idx,
  //             embedding: JSON.stringify(vector)
  //           });
  //         }
    
  //         await bgTx.run(INSERT.into(Embeddings).entries(chunkEntries));
  //         console.log(`[Background] Embeddings generated for document: ${filename}`);
  //       } catch (err) {
  //         console.error(`[Background Embedding Failed] ${err.message}`);
  //       }
  //     });
    
  //     return `Document "${filename}" upload accepted. Embedding generation started in the background.`;
  //   });

  //     const chunkEntries=[];
  //     for(let index=0;index<chunks.length;index++){
  //       const chunkText=chunks[index]
  //       const vector =await generateEmbedding(chunkText)
  //       chunkEntries.push({
  //         ID: cds.utils.uuid(),
  //         documentID: docID,
  //         chunkText: chunkText,
  //         chunkIndex: index,
  //         embedding: JSON.stringify(vector)
  //       })
  //     }
  //     await tx.run(INSERT.into(Embeddings).entries(chunkEntries))

  //     return `Document "${filename}" uploaded successfully. ${chunks.length} chunks stored with semantic embeddings.`
  // })

this.on('uploadDocument', async req => {
      const { filename, content } = req.data || {};
      if (!filename || !content) return req.reject(400, 'filename and content are required');
    
      const docID = cds.utils.uuid();
      const tx = cds.tx(req);
      const isPDF = filename.toLowerCase().endsWith('.pdf');
    
      // 1. Store the initial Document record synchronously
      await tx.run(INSERT.into(Documents).entries({
        ID: docID,
        fileName: filename.trim(),
        content: isPDF ? 'Processing...' : content,
        uploadedAt: new Date().toISOString(),
        fileType: isPDF ? 'pdf' : 'text'
      }));
    
      // 2. Spawn the heavy embedding generation in the background
      cds.spawn({ tenant: cds.context.tenant, user: cds.context.user }, async (bgTx) => {
        try {
          const extractedText = await extractText(filename, content);
          const cleanText = extractedText.replace(/\r\n/g, '\n').trim();
    
          // Update full extracted content
          await bgTx.run(UPDATE(Documents).set({ content: cleanText }).where({ ID: docID }));
    
          // Split into chunks and call HuggingFace/OpenAI embedding API
          const chunkSize = 500, overlap = 50;
          const chunks = [];
          for (let i = 0; i < cleanText.length; i += chunkSize - overlap) {
            const chunk = cleanText.substring(i, i + chunkSize);
            if (chunk.trim()) chunks.push(chunk);
          }
    
          const chunkEntries = [];
          for (let idx = 0; idx < chunks.length; idx++) {
            const vector = await generateEmbedding(chunks[idx]);
            chunkEntries.push({
              ID: cds.utils.uuid(),
              documentID: docID,
              chunkText: chunks[idx],
              chunkIndex: idx,
              embedding: JSON.stringify(vector)
            });
          }
    
          await bgTx.run(INSERT.into(Embeddings).entries(chunkEntries));
          console.log(`[Background] Embeddings generated for document: ${filename}`);
        } catch (err) {
          console.error(`[Background Embedding Failed] ${err.message}`);
        }
      });
    
      return `Document "${filename}" upload accepted. Embedding generation started in the background.`;
    });

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

  this.on('checkOverdueOrders', async req => {
    const tx = cds.tx(req);
    const today = new Date().toISOString().split('T')[0];

    const overdueOrders = await tx.run(
      SELECT.from(PurchaseOrders)
        .where(`deliveryDate < '${today}' and status != 'Rejected'`)
    );

    console.log(`[Job Scheduler] Found ${overdueOrders.length} overdue orders.`);

    const notifications = await cds.connect.to('notifications');
    for (const po of overdueOrders) {
      await notifications.notify('PurchaseOrderOverdue', {
        recipients: ['buyer@company.com', 'blesswinsj@gmail.com'],
        data: {
          poID: po.purchaseOrder || po.ID,
          supplier: po.supplier,
          deliveryDate: po.deliveryDate
        }
      });
    }
    return `Processed ${overdueOrders.length} overdue orders successfully.`;
  });


  this.on('ingestDocument', async req => {
    const {documentText, documentName} = req.data;

    req.reply({ status: 'Accepted', message: `Document "${documentName}" ingestion started.` });

    cds.spawn({tenant: cds.context.tenant, user: cds.context.user}).run(async tx => {

      const vector = await generateEmbedding(documentText);
      await tx.run(INSERT.into(Embeddings).entries({
        ID: cds.utils.uuid(),
        documentID: cds.utils.uuid(),
        chunkText: documentText,
        chunkIndex: 0,
        embedding: JSON.stringify(vector),
        fileName: documentName
      }));
      console.log(`[Background Task] Document "${documentName}" ingested successfully.`);
  });
})


});