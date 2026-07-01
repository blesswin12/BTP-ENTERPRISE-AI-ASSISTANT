/**
 * ProcureAI - Enterprise AI Assistant Application Logic
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');
  
  const modeAnalyticsBtn = document.getElementById('mode-analytics');
  const modeDocumentBtn = document.getElementById('mode-document');
  const chatModeSubtitle = document.getElementById('chat-mode-subtitle');
  
  const btnSummary = document.getElementById('btn-summary');
  
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const uploadedFilesList = document.getElementById('uploaded-files-list');
  const toastContainer = document.getElementById('toast-container');

  // Application State
  let currentMode = 'analytics'; // 'analytics' | 'document'
  let isThinking = false;

  // Configure Markdown Parser (Marked)
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });

  // Suggestion chips handler
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (isThinking) return;
      chatInput.value = chip.textContent;
      chatInput.focus();
      adjustTextareaHeight();
    });
  });

  // Form textarea auto-grow
  chatInput.addEventListener('input', adjustTextareaHeight);
  
  function adjustTextareaHeight() {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
  }

  // Toggle Mode Selection
  modeAnalyticsBtn.addEventListener('click', () => switchMode('analytics'));
  modeDocumentBtn.addEventListener('click', () => switchMode('document'));

  function switchMode(mode) {
    if (currentMode === mode || isThinking) return;
    
    currentMode = mode;
    
    if (mode === 'analytics') {
      modeAnalyticsBtn.classList.add('active');
      modeDocumentBtn.classList.remove('active');
      chatModeSubtitle.textContent = 'Mode: Purchase Order Analytics';
      chatInput.placeholder = 'Ask a question about your purchase orders...';
      
      showToast('Switched to Analytics Mode', 'info');
      addSystemMessage('Switched to Purchase Order Analytics. You can ask queries regarding totals, dates, vendors, and status.');
    } else {
      modeDocumentBtn.classList.add('active');
      modeAnalyticsBtn.classList.remove('active');
      chatModeSubtitle.textContent = 'Mode: Document Q&A';
      chatInput.placeholder = 'Ask questions based on uploaded documents...';
      
      showToast('Switched to Document Q&A Mode', 'info');
      addSystemMessage('Switched to Document Q&A. Ask questions about procurement policies, guidelines, or uploaded docs.');
    }
  }

  // Quick Action: Executive Spend Summary
  btnSummary.addEventListener('click', async () => {
    if (isThinking) return;
    
    showToast('Requesting Executive Summary...', 'info');
    addMessage('user', 'Generate Executive Spend Summary');
    
    const loaderId = showThinkingIndicator();
    
    try {
      const response = await fetch('/chat/getSummary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (!response.ok) {
        throw new Error(`Failed to generate summary: ${response.statusText}`);
      }
      
      const data = await response.json();
      removeThinkingIndicator(loaderId);
      addMessage('bot', data.value);
    } catch (err) {
      removeThinkingIndicator(loaderId);
      addMessage('bot', `⚠️ Error generating executive summary: ${err.message}`);
      showToast('Failed to generate summary', 'error');
    }
  });

  // Drag and Drop File Upload Event Handlers
  dropZone.addEventListener('click', () => fileInput.click());
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  // Handle Document Upload File Reading and API submission
  async function handleFileUpload(file) {
    const validTypes = ['text/plain', 'application/pdf', 'text/markdown'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    
    const isTxt = file.name.endsWith('.txt') || file.name.endsWith('.md');
    // Simple verification
    if (!isTxt && file.type !== 'application/pdf') {
      showToast('Invalid file format. Please upload text or PDF files.', 'error');
      return;
    }
    
    if (file.size > maxSizeBytes) {
      showToast('File is too large. Max size is 5MB.', 'error');
      return;
    }

    // Create item in side list
    const fileId = 'file-' + Date.now();
    const fileItemHtml = `
      <div class="file-item" id="${fileId}">
        <div class="file-info">
          <i class="fa-solid fa-file-arrow-up"></i>
          <span class="file-name" title="${file.name}">${file.name}</span>
        </div>
        <span class="file-status uploading">Reading...</span>
      </div>
    `;
    uploadedFilesList.insertAdjacentHTML('beforeend', fileItemHtml);
    
    const fileItemElement = document.getElementById(fileId);
    const statusBadge = fileItemElement.querySelector('.file-status');

    const reader = new FileReader();
    reader.onload = async (event) => {
      statusBadge.textContent = 'Uploading...';
      const fileText = event.target.result;
      
      try {
        const response = await fetch('/chat/uploadDocument', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filename: file.name,
            content: fileText
          })
        });

        if (!response.ok) {
          throw new Error(`Upload action rejected: ${response.statusText}`);
        }

        const data = await response.json();
        
        statusBadge.textContent = 'Ready';
        statusBadge.className = 'file-status success';
        showToast(`Successfully processed: ${file.name}`, 'success');
        
        addSystemMessage(`📄 Document processed successfully: **${file.name}** is now indexed. You can switch to **Document Q&A** mode to ask questions regarding its contents.`);
      } catch (err) {
        statusBadge.textContent = 'Failed';
        statusBadge.className = 'file-status error';
        showToast(`Upload failed: ${err.message}`, 'error');
      }
    };

    reader.onerror = () => {
      statusBadge.textContent = 'Failed';
      statusBadge.className = 'file-status error';
      showToast('Failed to read file content.', 'error');
    };

    // If PDF, we warn that text extraction is client-side mock here, or read it as binary
    // In our scope, let's read as Text since the action expects content: String
    reader.readAsText(file);
  }

  // Handle Form Submission
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const text = chatInput.value.trim();
    if (!text || isThinking) return;

    // Reset input box
    chatInput.value = '';
    chatInput.style.height = 'auto';
    
    // Add user message
    addMessage('user', text);
    
    // Show loading state
    isThinking = true;
    btnSend.disabled = true;
    const loaderId = showThinkingIndicator();
    
    const endpoint = currentMode === 'analytics' ? '/chat/askAnalytics' : '/chat/askDocument';
    //if currentMode === 'document' else if currentMode === 'analytics' else error
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned code ${response.status}: ${errorText || response.statusText}`);
      }

      const resData = await response.json();
      removeThinkingIndicator(loaderId);
      addMessage('bot', resData.value);
    } catch (err) {
      removeThinkingIndicator(loaderId);
      addMessage('bot', `⚠️ Request failed: ${err.message}`);
      showToast('Query failed', 'error');
    } finally {
      isThinking = false;
      btnSend.disabled = false;
      chatInput.focus();
    }
  });

  // Add standard message bubbles
  function addMessage(sender, text) {
    const isUser = sender === 'user';
    const avatarIcon = isUser ? 'fa-user' : 'fa-robot';
    const htmlText = isUser ? escapeHTML(text) : marked.parse(text);

    const messageHtml = `
      <div class="message ${sender}">
        <div class="message-avatar">
          <i class="fa-solid ${avatarIcon}"></i>
        </div>
        <div class="message-bubble">
          ${htmlText}
        </div>
      </div>
    `;
    
    chatMessages.insertAdjacentHTML('beforeend', messageHtml);
    scrollToBottom();
  }

  // Add system notifications
  function addSystemMessage(text) {
    const messageHtml = `
      <div class="message system">
        <div class="message-avatar">
          <i class="fa-solid fa-circle-info"></i>
        </div>
        <div class="message-bubble">
          ${marked.parse(text)}
        </div>
      </div>
    `;
    chatMessages.insertAdjacentHTML('beforeend', messageHtml);
    scrollToBottom();
  }

  // Thinking Loader Indicators
  function showThinkingIndicator() {
    const loaderId = 'loader-' + Date.now();
    const loaderHtml = `
      <div class="message bot thinking-loader" id="${loaderId}">
        <div class="message-avatar">
          <i class="fa-solid fa-robot"></i>
        </div>
        <div class="message-bubble">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    `;
    chatMessages.insertAdjacentHTML('beforeend', loaderHtml);
    scrollToBottom();
    return loaderId;
  }

  function removeThinkingIndicator(id) {
    const loaderElement = document.getElementById(id);
    if (loaderElement) {
      loaderElement.remove();
    }
  }

  // UI Utilities
  function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }

  // Toast Notification popup
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fa-solid ${icon}"></i>
      <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.4s ease forwards';
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }
});
