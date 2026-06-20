sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"enterprise/ai/purchaseorders/test/integration/pages/PurchaseOrdersList",
	"enterprise/ai/purchaseorders/test/integration/pages/PurchaseOrdersObjectPage",
	"enterprise/ai/purchaseorders/test/integration/pages/PurchaseOrderItemsObjectPage"
], function (JourneyRunner, PurchaseOrdersList, PurchaseOrdersObjectPage, PurchaseOrderItemsObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('enterprise/ai/purchaseorders') + '/test/flp.html#app-preview',
        pages: {
			onThePurchaseOrdersList: PurchaseOrdersList,
			onThePurchaseOrdersObjectPage: PurchaseOrdersObjectPage,
			onThePurchaseOrderItemsObjectPage: PurchaseOrderItemsObjectPage
        },
        async: true
    });

    return runner;
});

