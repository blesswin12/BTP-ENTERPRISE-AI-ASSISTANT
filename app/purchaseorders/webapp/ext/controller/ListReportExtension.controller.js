sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension"
], function (ControllerExtension) {
    "use strict";

    return ControllerExtension.extend("enterprise.ai.purchaseorders.ext.controller.ListReportExtension",{
        override: {
            onInit: function () {}
        },

        onOpenChat: function (oEvent) {
            var sChatUrl = "/chat/index.html";
            var oWindow = window.open(sChatUrl, "_blank");
            if(!oWindow || oWindow.closed || typeof oWindow.closed === "undefined") {
                window.location.href = sChatUrl;
            }
        }
    });
});