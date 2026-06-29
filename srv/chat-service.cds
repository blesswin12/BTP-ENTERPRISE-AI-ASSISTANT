using {enterprise.ai as db} from '../db/schema';

service ChatService @(path: '/chat') {
    @readonly entity ChatHistory      as projection on db.ChatHistory;
    @readonly entity Documents        as projection on db.Documents;

    @odata.draft.enabled
    entity PurchaseOrders     as projection on db.PurchaseOrders;
    entity PurchaseOrderItems as projection on db.PurchaseOrderItems;

    action askAnalytics   (question : String) returns String;
    action askDocument    (question : String) returns String;
    action uploadDocument (filename : String, content : String) returns String;
    action getSummary     () returns String;
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
        { $Type : 'UI.DataField', Value : status,        Label : 'Status'         },
        { $Type : 'UI.DataField', Value : totalAmount,   Label : 'Total Amount'   },
        { $Type : 'UI.DataField', Value : currency,      Label : 'Currency'       }
    ],
    UI.FieldGroup #HeaderInfo : {
        Label : 'Header Information',
        Data  : [
            { $Type : 'UI.DataField', Value : purchaseOrder, Label : 'Purchase Order' },
            { $Type : 'UI.DataField', Value : supplier,      Label : 'Supplier'       },
            { $Type : 'UI.DataField', Value : buyer,         Label : 'Buyer'          },
            { $Type : 'UI.DataField', Value : orderDate,     Label : 'Order Date'     },
            { $Type : 'UI.DataField', Value : deliveryDate,  Label : 'Delivery Date'  },
            { $Type : 'UI.DataField', Value : status,        Label : 'Status'         },
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
