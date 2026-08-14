const cds= require('@sap/cds');

const Enterprise_Tenants=new Set([
    'siemens-subaccount-id',
    'bmw-subaccount-id',
    'enterprise-tenant-1'
]);

async function getDynamicHDIConnection(tenantId) {
    const db = await cds.connect.to('db');
    if(Enterprise_Tenants.has(tenantId)) {
        console.log(`[Dynamic HDI Routing] Routing to Enterprise HDI Container for tenant: ${tenantId}`);
        return db.tx({ tenant: tenantId });
    } else {
        console.log(`[Dynamic HDI Routing] Routing to Default HDI Container for tenant: ${tenantId}`);
        return db.tx({ tenant: tenantId });
    }
}

module.exports = { getDynamicHDIConnection, Enterprise_Tenants };
