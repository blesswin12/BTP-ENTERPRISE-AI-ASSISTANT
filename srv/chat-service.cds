using from '@sap/cds-mtxs/db/extensions';
using from '@sap/cds-mtxs/srv/bootstrap';

using {enterprise.ai as db} from '../db/schema';

service ChatService @(path: '/chat') {
    @readonly entity ChatHistory      as projection on db.ChatHistory;
    @readonly entity Documents        as projection on db.Documents;

    @odata.draft.enabled
    @odata.draft.bypass
    entity PurchaseOrders     as projection on db.PurchaseOrders;
    entity PurchaseOrderItems as projection on db.PurchaseOrderItems;

    action askAnalytics   (question : String, conversationID : UUID) returns String;
    action askDocument    (question : String, conversationID : UUID) returns String;
    action uploadDocument (filename : String, content : String) returns String;
    action getSummary     () returns String;
    action checkOverdueOrders() returns String;
}

annotate ChatService.PurchaseOrders with {
    purchaseOrder @mandatory;
    supplier      @mandatory;
    buyer         @mandatory;
    orderDate     @mandatory;
    deliveryDate  @mandatory;

    status @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'PurchaseOrders',
            Parameters     : [{
                $Type             : 'Common.ValueListParameterOut',
                LocalDataProperty : status,
                ValueListProperty : 'status'
            }]
        }
    );

    currency @(
        Common.ValueListWithFixedValues : true,
        Common.ValueList : {
            CollectionPath : 'PurchaseOrders',
            Parameters     : [{
                $Type             : 'Common.ValueListParameterOut',
                LocalDataProperty : currency,
                ValueListProperty : 'currency'
            }]
        }
    );
}

annotate ChatService.PurchaseOrders with @(
    UI.HeaderInfo:{
        TypeName       : 'Purchase Order',
        TypeNamePlural : 'Purchase Orders',
        Title          : { $Type : 'UI.DataField', Value : purchaseOrder },
        Description    : { $Type : 'UI.DataField', Value : supplier} 
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : purchaseOrder, Label : 'Purchase Order' },
        { $Type : 'UI.DataField', Value : supplier,      Label : 'Supplier'       },
        { $Type : 'UI.DataField', Value : buyer,         Label : 'Buyer'          },
        { $Type : 'UI.DataField', Value : orderDate,     Label : 'Order Date'     },
        { $Type : 'UI.DataField', Value : deliveryDate,  Label : 'Delivery Date'  },
        {
            $Type       : 'UI.DataFieldForAnnotation',
            Target      : '@UI.DataPoint#StatusCriticality',
            Label       : 'Status'
        },
        { $Type : 'UI.DataField', Value : totalAmount,   Label : 'Total Amount'   },
        { $Type : 'UI.DataField', Value : currency,      Label : 'Currency'       }
    ],
    UI.DataPoint #StatusCriticality : {
        Value       : status,
        Criticality : criticality,
        Title       : 'Status'
    },

    UI.FieldGroup #HeaderInfo : {
        Label : 'Header Information',
        Data  : [
            { $Type : 'UI.DataField', Value : purchaseOrder, Label : 'Purchase Order' },
            { $Type : 'UI.DataField', Value : supplier,      Label : 'Supplier'       },
            { $Type : 'UI.DataField', Value : buyer,         Label : 'Buyer'          },
            { $Type : 'UI.DataField', Value : orderDate,     Label : 'Order Date'     },
            { $Type : 'UI.DataField', Value : deliveryDate,  Label : 'Delivery Date'  },
            {
                $Type  : 'UI.DataFieldForAnnotation',
                Target : '@UI.DataPoint#StatusCriticality',
                Label  : 'Status'
            },
            { $Type : 'UI.DataField', Value : totalAmount,   Label : 'Total Amount'   },
            { $Type : 'UI.DataField', Value : currency,      Label : 'Currency'       }
        ]
    },
    UI.Facets : [
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'HeaderInfoFacet',
            Label  : 'Header Information',
            Target : '@UI.FieldGroup#HeaderInfo'
        },
        {
            $Type  : 'UI.ReferenceFacet',
            ID     : 'LineItemsFacet',
            Label  : 'Line Items',
            Target : 'items/@UI.LineItem'
        }
    ],
    UI.SelectionFields : [
        purchaseOrder,
        supplier,
        status,
        orderDate
    ]
);
annotate ChatService.PurchaseOrderItems with @(
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : itemNumber,   Label : 'Item Number'   },
        { $Type : 'UI.DataField', Value : material,     Label : 'Material'      },
        { $Type : 'UI.DataField', Value : description,  Label : 'Description'   },
        { $Type : 'UI.DataField', Value : quantity,     Label : 'Quantity'      },
        { $Type : 'UI.DataField', Value : unit,         Label : 'Unit'          },
        { $Type : 'UI.DataField', Value : netPrice,     Label : 'Net Price'     },
        { $Type : 'UI.DataField', Value : netAmount,    Label : 'Net Amount'    },
        { $Type : 'UI.DataField', Value : plant,        Label : 'Plant'         },
        { $Type : 'UI.DataField', Value : deliveryDate, Label : 'Delivery Date' }
    ]
);
