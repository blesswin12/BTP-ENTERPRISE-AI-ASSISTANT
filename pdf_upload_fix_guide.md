# Step-by-Step Guide: Fixing PDF Upload Handling

This guide details the modifications needed to fix the PDF file upload corruption. 

---

## The Problem
In the frontend [app.js](file:///home/user/projects/enterprise-ai-assistant/app/chat/app.js) file, all files are currently read using `FileReader.readAsText(file)`.
While this works perfectly for plain-text documents (`.txt`, `.md`), reading a binary PDF file as a text string corrupts the binary format. When the backend receives this corrupted string, it fails to parse the PDF structure, resulting in text extraction failures.

---

## The Solution
We must update the frontend to read files conditionally:
1. **Plain Text (`.txt`, `.md`):** Keep using `readAsText(file)`.
2. **PDF Files (`.pdf`):** Use `readAsDataURL(file)` to get a Base64-encoded Data URL, and strip the Data URL header prefix (`data:application/pdf;base64,`) before sending it to the backend.

The backend [chat-service.js](file:///home/user/projects/enterprise-ai-assistant/srv/chat-service.js) is already configured to process Base64 strings for PDFs:
```javascript
const buffer = Buffer.from(content, 'base64')
const { PDFParse } = require('pdf-parse')
```

---

## Code Modifications Required

### 1. Update Frontend File Reading in [app.js](file:///home/user/projects/enterprise-ai-assistant/app/chat/app.js)

Locate the `handleFileUpload` function in [app.js](file:///home/user/projects/enterprise-ai-assistant/app/chat/app.js#L140-L216) and change it as follows:

```diff
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
-     const fileText = event.target.result;
+     let fileText = event.target.result;
+     
+     // For PDF files, extract only the Base64 portion from the Data URL
+     if (file.name.toLowerCase().endsWith('.pdf')) {
+       const commaIndex = fileText.indexOf(',');
+       if (commaIndex !== -1) {
+         fileText = fileText.substring(commaIndex + 1);
+       }
+     }
      
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

-   // If PDF, we warn that text extraction is client-side mock here, or read it as binary
-   // In our scope, let's read as Text since the action expects content: String
-   reader.readAsText(file);
+   // Read PDF files as Base64 Data URL, text files as plain text
+   if (file.name.toLowerCase().endsWith('.pdf')) {
+     reader.readAsDataURL(file);
+   } else {
+     reader.readAsText(file);
+   }
  }
```

---

## How to Test

1. **Apply the Changes** to [app.js](file:///home/user/projects/enterprise-ai-assistant/app/chat/app.js).
2. **Start the Services**:
   - Run the CAP Server: `cds watch`
   - Run the MCP Server: `PORT=3005 npm run mcp:start`
3. **Upload a PDF**:
   - Open the ProcureAI frontend in your browser.
   - Drag and drop a valid PDF document into the **Document RAG Upload** zone.
   - Verify that it successfully shifts state to **Ready** and displays the success toast.
   - Toggle to **Document Q&A** mode and test querying information from that PDF.
