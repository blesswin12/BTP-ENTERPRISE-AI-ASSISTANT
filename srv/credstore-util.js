const xsenv = require('@sap/xsenv');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const jose = require('jose');
const path = require('path');
const fs = require('fs');

// In-memory credential cache with 10-minute TTL to reduce HTTP overhead
const credentialCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Normalizes PEM string formatting (cert / key blocks)
 */
function formatPem(pemStr) {
    if (!pemStr) return pemStr;
    let formatted = pemStr.replace(/\\n/g, '\n');
    formatted = formatted.replace(/-+BEGIN/g, '-----BEGIN');
    formatted = formatted.replace(/-+END/g, '-----END');
    formatted = formatted.replace(/(BEGIN [A-Z0-9 ]+)-+/g, '$1-----');
    formatted = formatted.replace(/(END [A-Z0-9 ]+)-+/g, '$1-----');

    if (!formatted.endsWith('\n')) {
        formatted += '\n';
    }
    return formatted;
}

/**
 * Normalizes client private key for payload decryption into PKCS#8 PEM format
 * Handles both raw base64 and existing PEM-wrapped keys.
 */
function formatPrivateKey(rawKey) {
    if (!rawKey) return null;
    const clean = rawKey
        .replace(/-----BEGIN[^-]+-----/g, '')
        .replace(/-----END[^-]+-----/g, '')
        .replace(/\s+/g, '');
    const chunked = clean.match(/.{1,64}/g) || [];
    return `-----BEGIN PRIVATE KEY-----\n${chunked.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

/**
 * Helper to locate Credential Store service credentials from environment or default-env.json
 */
function getCredStoreService() {
    const defaultEnvPath = path.join(__dirname, '../default-env.json');
    if (fs.existsSync(defaultEnvPath)) {
        try {
            const rawEnv = JSON.parse(fs.readFileSync(defaultEnvPath, 'utf8'));
            if (rawEnv.VCAP_SERVICES) {
                process.env.VCAP_SERVICES = typeof rawEnv.VCAP_SERVICES === 'string'
                    ? rawEnv.VCAP_SERVICES
                    : JSON.stringify(rawEnv.VCAP_SERVICES);
            }
        } catch (e) {}
    }

    xsenv.loadEnv();

    const filters = [
        { credstore: { tag: 'credstore' } },
        { credstore: { label: 'credstore' } },
        { credstore: { name: 'enterprise-ai-assistant-credstore' } },
        { credstore: { name: 'Cred-Store' } }
    ];

    for (const filter of filters) {
        try {
            const services = xsenv.getServices(filter);
            if (services && services.credstore && services.credstore.credentials) {
                return services.credstore;
            }
        } catch (e) {}
    }

    if (process.env.VCAP_SERVICES) {
        try {
            const vcap = typeof process.env.VCAP_SERVICES === 'string'
                ? JSON.parse(process.env.VCAP_SERVICES)
                : process.env.VCAP_SERVICES;
            for (const key of Object.keys(vcap)) {
                if (key.toLowerCase().includes('credstore')) {
                    const list = vcap[key];
                    if (Array.isArray(list) && list.length > 0 && list[0].credentials) {
                        return list[0];
                    }
                }
            }
        } catch (e) {}
    }

    throw new Error("Credential Store service binding ('credstore') was not found in VCAP_SERVICES or default-env.json.");
}

/**
 * Fetch and decrypt a credential from SAP BTP Credential Store REST API
 * Supports both mTLS and basic auth, as well as encrypted (JWE) and plaintext payloads.
 *
 * @param {string} name - Name of the credential stored in Credential Store
 * @param {string} [namespace='default'] - Credential Store namespace
 * @param {string} [type='password'] - Credential type ('password', 'key', 'keyring')
 * @param {boolean} [bypassCache=false] - Whether to bypass in-memory cache
 * @returns {Promise<string>} The retrieved secret value
 */
async function getCredential(name, namespace = 'default', type = 'password', bypassCache = false) {
    const cacheKey = `${namespace}:${type}:${name}`;
    const cached = credentialCache.get(cacheKey);
    if (!bypassCache && cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }

    const service = getCredStoreService();
    const creds = service.credentials;

    // Normalize base URL to ensure it ends with /credentials
    let baseUrl = creds.url || 'https://credstore.cfapps.us10.hana.ondemand.com/api/v1';
    if (!baseUrl.endsWith('/credentials')) {
        baseUrl = baseUrl.replace(/\/+$/, '') + '/credentials';
    }
    const endpoint = `${baseUrl}/${type}`;

    const requestConfig = {
        headers: {
            'sapcp-credstore-namespace': namespace
        },
        params: { name },
        timeout: 10000
    };

    // Configure mTLS or Basic authentication
    if (creds.certificate && creds.key) {
        requestConfig.httpsAgent = new https.Agent({
            cert: formatPem(creds.certificate),
            key: formatPem(creds.key),
            rejectUnauthorized: false
        });
    } else if (creds.username && creds.password) {
        requestConfig.auth = {
            username: creds.username,
            password: creds.password
        };
    }

    try {
        const response = await axios.get(endpoint, requestConfig);
        let payload = response.data;

        // If payload encryption is enabled, SAP Credential Store returns a compact JWE string
        if (typeof payload === 'string' && payload.startsWith('ey')) {
            const rawPrivKey = creds.encryption?.client_private_key;
            if (!rawPrivKey) {
                throw new Error('Encrypted payload (JWE) received, but encryption.client_private_key is not configured in service credentials.');
            }
            const pem = formatPrivateKey(rawPrivKey);
            const privKey = crypto.createPrivateKey(pem);
            const decrypted = await jose.compactDecrypt(payload, privKey);
            const decryptedText = new TextDecoder().decode(decrypted.plaintext);
            try {
                payload = JSON.parse(decryptedText);
            } catch (e) {
                payload = decryptedText;
            }
        }

        let result;
        if (payload && typeof payload === 'object' && payload.value !== undefined) {
            result = payload.value;
        } else {
            result = payload;
        }

        credentialCache.set(cacheKey, {
            value: result,
            expiresAt: Date.now() + CACHE_TTL_MS
        });

        return result;
    } catch (error) {
        const detail = error.response
            ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}`
            : error.message;
        console.error(`[CredStore] Failed to retrieve credential "${name}" from ${endpoint}:`, detail);
        throw new Error(`Credential Store fetch failed (${endpoint}): ${detail}`);
    }
}

/**
 * Convenient helper to fetch a password
 */
async function getPassword(name, namespace = 'default') {
    return getCredential(name, namespace, 'password');
}

/**
 * Convenient helper to fetch a key
 */
async function getKey(name, namespace = 'default') {
    return getCredential(name, namespace, 'key');
}

/**
 * Clears the credential cache
 */
function clearCredentialCache() {
    credentialCache.clear();
}

module.exports = {
    getCredential,
    getPassword,
    getKey,
    clearCredentialCache,
    getCredStoreService
};
