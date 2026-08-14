const xsenv = require('@sap/xsenv');
const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');

/**
 * Helper to locate Credential Store service credentials from environment
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

    try {
        const services = xsenv.getServices({ credstore: { tag: 'credstore' } });
        if (services && services.credstore && services.credstore.credentials) {
            return services.credstore;
        }
    } catch (e) {}

    try {
        const services = xsenv.getServices({ credstore: { label: 'credstore' } });
        if (services && services.credstore && services.credstore.credentials) {
            return services.credstore;
        }
    } catch (e) {}

    if (process.env.VCAP_SERVICES) {
        try {
            const vcap = typeof process.env.VCAP_SERVICES === 'string'
                ? JSON.parse(process.env.VCAP_SERVICES)
                : process.env.VCAP_SERVICES;
            const list = vcap.credstore || vcap['sap-credstore'] || [];
            if (list.length > 0 && list[0].credentials) {
                return list[0];
            }
        } catch (e) {}
    }

    throw new Error("Credential Store service binding ('credstore') was not found in VCAP_SERVICES or default-env.json.");
}

/**
 * Format PEM blocks
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
 * Fetch a password/credential from SAP BTP Credential Store REST API
 * @param {string} name - Name of the credential stored in Credential Store
 * @param {string} [namespace='default'] - Credential Store namespace
 * @returns {Promise<string>} The retrieved secret value
 */
async function getCredential(name, namespace = 'default') {
    const service = getCredStoreService();
    const creds = service.credentials;

    let baseUrl = creds.url || 'https://credstore.cfapps.us10.hana.ondemand.com/api/v1';
    if (baseUrl.endsWith('/credentials')) {
        baseUrl = baseUrl.slice(0, -'/credentials'.length);
    }
    if (baseUrl.endsWith('/')) {
        baseUrl = baseUrl.slice(0, -1);
    }

    const requestConfig = {
        headers: {
            'sap-credstore-namespace': namespace
        },
        params: { name }
    };

    if (creds.username && creds.password) {
        requestConfig.auth = {
            username: creds.username,
            password: creds.password
        };
    } else if (creds.key && creds.certificate) {
        if (baseUrl.includes('.cfapps.') && !baseUrl.includes('.cert.cfapps.')) {
            baseUrl = baseUrl.replace('.cfapps.', '.cert.cfapps.');
        }

        if (creds.username) {
            requestConfig.auth = {
                username: creds.username,
                password: ''
            };
        }

        const fullChain = formatPem(creds.certificate);
        requestConfig.httpsAgent = new https.Agent({
            cert: fullChain,
            key: formatPem(creds.key),
            rejectUnauthorized: false
        });
    }

    const endpoint = `${baseUrl}/passwords`;

    try {
        const response = await axios.get(endpoint, requestConfig);
        if (response.data && response.data.value !== undefined) {
            return response.data.value;
        }
        return response.data;
    } catch (error) {
        const detail = error.response 
            ? `Status ${error.response.status}: ${JSON.stringify(error.response.data)}` 
            : error.message;
        console.error(`[CredStore] Failed to retrieve credential "${name}":`, detail);
        throw new Error(`Credential Store fetch failed (${endpoint}): ${detail}`);
    }
}


module.exports = {
    getCredential
};