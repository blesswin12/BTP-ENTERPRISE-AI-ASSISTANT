# Developer Implementation Manual: SAP BTP Credential Store Integration

Follow these steps to integrate and initiate the **SAP BTP Credential Store** service (`credstore`) in your SAP CAP project.

---

## Overview & NPM Note

> [!NOTE]
> There is **no `@sap/credstore` package** on npm. SAP BTP Credential Store provides a standard REST API. Access to Credential Store from Node.js applications is done using `@sap/xsenv` (to load service credentials) and `axios` / `fetch` (to invoke the REST API). Both dependencies are already installed in [`package.json`](file:///home/user/projects/enterprise-ai-assistant/package.json).

---

## Step 1: Bind Credential Store in `mta.yaml`

Declare the Credential Store service in your Multi-Target Application descriptor [`mta.yaml`](file:///home/user/projects/enterprise-ai-assistant/mta.yaml).

### Edits to [`mta.yaml`](file:///home/user/projects/enterprise-ai-assistant/mta.yaml):

1. **Add service dependency under `requires`** of `enterprise-ai-assistant-srv`:

```yaml
- name: enterprise-ai-assistant-srv
  type: nodejs
  path: gen/srv
  requires:
    - name: enterprise-ai-assistant-auth
    - name: enterprise-ai-assistant-db
    - name: enterprise-ai-assistant-destination
    - name: enterprise-ai-assistant-logging
    - name: enterprise-ai-assistant-credstore # <-- Add this requirement
```

2. **Add Credential Store service resource** under `resources`:

```yaml
resources:
  # ... existing resources ...

  - name: enterprise-ai-assistant-credstore
    type: org.cloudfoundry.managed-service
    parameters:
      service: credstore
      service-plan: proxy # Options: 'proxy' (for apps) or 'standard'
```

---

## Step 2: Ensure `@sap/xsenv` is in `package.json`

Check [`package.json`](file:///home/user/projects/enterprise-ai-assistant/package.json) to ensure `@sap/xsenv` and `axios` are listed as dependencies (they are already included in your project).

If `@sap/xsenv` needs to be added explicitly to `dependencies`:
```bash
npm install @sap/xsenv
```

---

## Step 3: Implement Credential Retrieval Code (`srv/credstore-util.js`)

Create a helper module `srv/credstore-util.js` that uses `@sap/xsenv` to locate the bound Credential Store credentials and calls the BTP REST API via `axios`.

### Create [`srv/credstore-util.js`](file:///home/user/projects/enterprise-ai-assistant/srv/credstore-util.js):

```javascript
const xsenv = require('@sap/xsenv');
const axios = require('axios');

/**
 * Fetch a password/secret from SAP BTP Credential Store REST API
 * @param {string} name - Name of the credential stored in Credential Store
 * @param {string} [namespace='default'] - Credential Store namespace
 * @returns {Promise<string>} The retrieved secret value
 */
async function getCredential(name, namespace = 'default') {
  try {
    // 1. Load environment variables (supports default-env.json locally and VCAP_SERVICES on BTP)
    xsenv.loadEnv();
    const service = xsenv.getServices({ credstore: { tag: 'credstore' } }).credstore;

    // 2. Execute GET request to Credential Store REST API
    const endpoint = `${service.credentials.url}/passwords`;
    const response = await axios.get(endpoint, {
      headers: {
        'sap-credstore-namespace': namespace
      },
      params: { name },
      auth: {
        username: service.credentials.username,
        password: service.credentials.password
      }
    });

    return response.data.value;
  } catch (error) {
    const detail = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error(`[CredStore] Failed to retrieve credential "${name}":`, detail);
    throw new Error(`Credential Store fetch failed: ${detail}`);
  }
}

module.exports = {
  getCredential
};
```

---

## Step 4: Local Testing Setup (`default-env.json`)

To test locally without deploying to BTP every time:

1. In **SAP BTP Cockpit**, go to your Credential Store service instance $\rightarrow$ **Service Keys** $\rightarrow$ **Create Service Key**.
2. Copy the credentials JSON.
3. Paste the credentials into [`default-env.json`](file:///home/user/projects/enterprise-ai-assistant/default-env.json) under `VCAP_SERVICES`:

```json
"VCAP_SERVICES": {
  "credstore": [
    {
      "name": "enterprise-ai-assistant-credstore",
      "label": "credstore",
      "tags": ["credstore"],
      "credentials": {
        "url": "https://credstore-app.cfapps.us10.hana.ondemand.com/api/v1",
        "username": "<SERVICE_KEY_USERNAME>",
        "password": "<SERVICE_KEY_PASSWORD>"
      }
    }
  ]
}
```

---

## Step 5: Manage Credentials in SAP BTP Cockpit

1. Log in to **SAP BTP Cockpit** and navigate to your Subaccount.
2. Go to **Instances and Subscriptions** $\rightarrow$ **Credential Store**.
3. Open the **Credential Store UI**.
4. Select/Create a **Namespace** (e.g. `default`).
5. Click **Create Credential**:
   * **Type**: `Password`
   * **Name**: `GROQ_API_KEY` (or key name required by your application)
   * **Value**: Paste secret value.
6. Click **Save**.
