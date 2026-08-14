# Developer Implementation Manual: SAP BTP Alert Notification Service Integration

Follow these steps to implement the SAP BTP Alert Notification service in your CAP project.

---

## Step 1: Bind the Service in `mta.yaml`

To allow your CAP server to authenticate and talk to the Alert Notification service on SAP BTP, you must declare it as a dependency in your multi-target application descriptor [mta.yaml](file:///home/user/projects/enterprise-ai-assistant/mta.yaml).

### Edits to [mta.yaml](file:///home/user/projects/enterprise-ai-assistant/mta.yaml):

1. **Add the service binding under the `requires` section** of `enterprise-ai-assistant-srv` (around line 9-16):
   ```yaml
   - name: enterprise-ai-assistant-srv
     type: nodejs
     path: gen/srv
     requires:
       - name: enterprise-ai-assistant-auth
       - name: enterprise-ai-assistant-db
       - name: enterprise-ai-assistant-destination
       - name: enterprise-ai-assistant-logging
       - name: enterprise-ai-assistant-alert-notification # <-- Add this line
   ```

2. **Add the resource definition** under the `resources` section at the end of the file:
   ```yaml
   resources:
     # ... (existing resources like enterprise-ai-assistant-logging) ...
     
     - name: enterprise-ai-assistant-alert-notification
       type: org.cloudfoundry.managed-service
       parameters:
         service: alert-notification
         service-plan: standard
   ```

---

## Step 2: Register the Service in `package.json`

Register the Alert Notification service as a REST dependency under `cds.requires` in [package.json](file:///home/user/projects/enterprise-ai-assistant/package.json). This allows CAP's `cds.connect.to()` to resolve the credentials automatically.

### Edits to [package.json](file:///home/user/projects/enterprise-ai-assistant/package.json):

Under the `"cds": { "requires": { ... } }` section (around line 61-64), add:

```json
      "html5-repo": true,
      "alert-notification": {
        "kind": "rest",
        "credentials": {
          "forwardAuthToken": false
        }
      }
```

---

## Step 3: Implement Code in `srv/chat-service.js`

Add the implementation helper and register lifecycle hooks/event handlers to publish alerts automatically.

### 1. Alert Helper Function
Add this helper function to [chat-service.js](file:///home/user/projects/enterprise-ai-assistant/srv/chat-service.js) outside the service implementation block (or inside the closure):

```javascript
/**
 * Publishes an event to SAP BTP Alert Notification Service
 * @param {string} eventType Unique identifier of the event class (e.g. 'PurchaseOrder.LateDelivery')
 * @param {string} subject A short summary of the alert
 * @param {string} body Detailed description / description context
 * @param {'INFO'|'WARNING'|'ERROR'} severity Severity of the alert
 */
async function publishAlert(eventType, subject, body, severity = 'INFO') {
  try {
    const alertService = await cds.connect.to('alert-notification');
    
    const payload = {
      eventType: eventType,
      eventTimestamp: Date.now(),
      severity: severity,
      category: 'ALERT',
      subject: subject,
      body: body,
      resource: {
        resourceName: 'EnterpriseAIAssistant',
        resourceType: 'Application'
      }
    };
    
    // Sends a POST request to the bound REST service endpoint '/'
    await alertService.send('POST', '/', payload);
    console.log(`[Alert Notification] Published event: ${eventType}`);
  } catch (error) {
    console.error('[Alert Notification] Error publishing event:', error);
  }
}
```

### 2. Register hooks to monitor Purchase Order updates
Insert hooks within `cds.service.impl(async function () { ... })` in [chat-service.js](file:///home/user/projects/enterprise-ai-assistant/srv/chat-service.js):

```javascript
  // Trigger alert on high value spend
  this.after('CREATE', 'PurchaseOrders', async (po) => {
    if (po.totalAmount > 100000) {
      await publishAlert(
        'PurchaseOrder.HighSpendCreated',
        `High spend purchase order ${po.purchaseOrder} created`,
        `A purchase order ${po.purchaseOrder} for supplier "${po.supplier}" was created with a total amount of ${po.totalAmount} ${po.currency}. Review required.`,
        'INFO'
      );
    }
  });

  // Trigger alert on PO rejection
  this.after('UPDATE', 'PurchaseOrders', async (po) => {
    if (po.status === 'Rejected') {
      await publishAlert(
        'PurchaseOrder.Rejected',
        `Purchase Order ${po.purchaseOrder} Rejected`,
        `The purchase order ${po.purchaseOrder} has been rejected by buyer ${po.buyer || 'manager'}.`,
        'WARNING'
      );
    }
  });
```

### 3. Register hooks to monitor RAG upload failures
Modify [chat-service.js:uploadDocument](file:///home/user/projects/enterprise-ai-assistant/srv/chat-service.js#L324) to catch errors and alert:

```javascript
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
      // Publish Alert to Alert Notification service
      await publishAlert(
        'AIDocument.ProcessingFailed',
        `Failed to parse document: ${fileName}`,
        `An error occurred while parsing uploaded file "${fileName}". Error: ${error.message}`,
        'ERROR'
      );
      req.reject(400, `Failed to process document: ${error.message}`)
    }
    // ... rest of upload logic ...
```

---

## Step 4: Local Testing Setup (Without BTP Deployments)

For local development, you don't need to deploy to SAP BTP to test the integration. Choose one of two options:

### Option A: Local Mocking (Recommended for quick testing)
You can configure a mock implementation locally in [package.json](file:///home/user/projects/enterprise-ai-assistant/package.json) under `"alert-notification"`:

```json
"alert-notification": {
  "kind": "rest",
  "[development]": {
    "impl": "./srv/mock-alert-notification.js"
  }
}
```

Create the file `/home/user/projects/enterprise-ai-assistant/srv/mock-alert-notification.js`:
```javascript
const cds = require('@sap/cds');

class MockAlertNotification extends cds.Service {
  async init() {
    this.on('POST', '*', (req) => {
      console.log('--- LOCAL MOCK ALERT RECEIVED ---');
      console.log(JSON.stringify(req.data, null, 2));
      console.log('---------------------------------');
      return { status: 'Sent (Mocked)' };
    });
    await super.init();
  }
}
module.exports = MockAlertNotification;
```

### Option B: Use BTP Service Key (For integration testing)
1. Go to your **SAP BTP Cockpit** -> **Alert Notification** Service Instance.
2. Click **Service Keys** -> **Create**.
3. Copy the JSON credentials structure (which includes `url`, `clientid`, `clientsecret`, `oauthurl`).
4. Paste it into your [default-env.json](file:///home/user/projects/enterprise-ai-assistant/default-env.json) under `VCAP_SERVICES.alert-notification`:
   ```json
   "VCAP_SERVICES": {
     "alert-notification": [
       {
         "name": "enterprise-ai-assistant-alert-notification",
         "label": "alert-notification",
         "credentials": {
           "url": "<YOUR_SERVICE_KEY_URL>",
           "clientid": "<YOUR_CLIENT_ID>",
           "clientsecret": "<YOUR_CLIENT_SECRET>",
           "oauthurl": "<YOUR_OAUTH_URL>"
         }
       }
     ]
   }
   ```

---

## Step 5: Configure Subscriptions in SAP BTP Cockpit

To ensure notifications actually reach your email or Slack, you must configure the subscription logic on SAP BTP:

1. **Open SAP BTP Cockpit** and navigate to your subaccount.
2. Under **Instances and Subscriptions**, select **Alert Notification** to open its dashboard.
3. **Create Action:**
   - Go to **Actions** -> **Create**.
   - Select **Email** (or **Slack**, **Microsoft Teams**, **Webhook**).
   - Enter your email address and verify it.
4. **Create Condition:**
   - Go to **Conditions** -> **Create**.
   - Name it `OnlyProcurementAlerts`.
   - Set the property condition: `resource.resourceName` EQUALS `EnterpriseAIAssistant` (or `eventType` CONTAINS `PurchaseOrder`).
5. **Create Subscription:**
   - Go to **Subscriptions** -> **Create**.
   - Bind your **Condition** (`OnlyProcurementAlerts`) to your **Action** (Email/Slack).
