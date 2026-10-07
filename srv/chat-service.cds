using {enterprise.ai as db} from '../db/schema';
using from '@cap-js/data-privacy';

service ChatService @(path: '/chat') {
    @readonly entity ChatHistory      as projection on db.ChatHistory;
    @readonly entity Documents        as projection on db.Documents;

    @odata.draft.enabled
    @odata.draft.bypass
    entity PurchaseOrders     as projection on db.PurchaseOrders;
    entity PurchaseOrderItems as projection on db.PurchaseOrderItems;

    @readonly entity Products as projection on db.Products;
    @readonly entity BusinessPartners as projection on db.BusinessPartners;
    @readonly entity OrderStatuses as projection on db.OrderStatuses;

    action askAnalytics   (question : String, conversationID : UUID) returns String;
    action askDocument    (question : String, conversationID : UUID) returns String;
    action uploadDocument (filename : String, content : String) returns String;
    action getSummary     () returns String;
    action checkOverdueOrders() returns String;
    action exportDataSubjectInformation(subjectId : String) returns String;
    action anonymizeDataSubject(subjectId : String) returns String;
}

annotate db.PurchaseOrders with @changelog: [
    purchaseOrder,
    status
]{
    supplier @changelog: [name];
    buyer    @changelog: [name];
    orderDate @changelog;   
    deliveryDate @changelog;
    status @changelog;
    totalAmount @changelog;
    currency @changelog;
};

annotate db.PurchaseOrderItems with @changelog: [
    itemNumber,
    material
]{
    quantity   @changelog;
    netPrice   @changelog;
    netAmount  @changelog;
    plant      @changelog;
    deliveryDate @changelog;
};  

annotate ChatService.PurchaseOrders with @PersonalData : {
    EntitySemantics : 'DataSubjectDetails',
    DataSubjectRole : 'Buyer'
} {
    buyer    @PersonalData.FieldSemantics  : 'DataSubjectID';
    supplier @PersonalData.IsPotentiallySensitive;
    totalAmount @PersonalData.IsPotentiallySensitive;
};

annotate ChatService.BusinessPartners with @PersonalData : {
    EntitySemantics : 'DataSubject',
    DataSubjectRole : 'Buyer'
} {
    ID    @PersonalData.FieldSemantics : 'DataSubjectID';
    email @PersonalData.IsPotentiallyPersonal;
    phone @PersonalData.IsPotentiallyPersonal;
};

annotate ChatService.PurchaseOrderItems with @PersonalData : { 
    EntitySemantics : 'DataSubjectDetails',
    DataSubjectRole : 'Buyer'
 } {
    itemNumber @PersonalData.FieldSemantics : 'DataSubjectID';
    material @PersonalData.IsPotentiallyPersonal;
    netAmount @PersonalData.IsPotentiallySensitive;
 };

 annotate ChatService.ChatHistory with @PersonalData : { 
    EntitySemantics : 'DataSubject',
    DataSubjectRole : 'Employee'
  }{
    ID @PersonalData.FieldSemantics : 'DataSubjectID';
    conversationID @PersonalData.IsPotentiallyPersonal;
    userQuestion @PersonalData.IsPotentiallyPersonal;
    aiResponse @PersonalData.IsPotentiallyPersonal;
    timestamp @PersonalData.IsPotentiallyPersonal;
  }

annotate ChatService.Documents with @PersonalData : { 
    EntitySemantics : 'Other',
    DataSubjectRole : 'Employee',
 } {
    ID @PersonalData.FieldSemantics : 'DataSubjectID';
    fileName @PersonalData.IsPotentiallyPersonal;
    content @PersonalData.IsPotentiallyPersonal;
    uploadedAt @PersonalData.IsPotentiallyPersonal;
 } ;

annotate ChatService.PurchaseOrders with @(
    AuditLog.Operation : {
        Insert : true,
        Update : true,
        Delete : true,
        Read : true
    }
);


annotate ChatService.PurchaseOrders with {
    purchaseOrder @mandatory;
    supplier      @(
        mandatory,
        Common.Text            : supplier.name,
        Common.TextArrangement : #TextFirst,
        Common.ValueList       : {
            Label          : 'Suppliers',
            CollectionPath : 'BusinessPartners',
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : supplier_ID, ValueListProperty : 'ID' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'partnerNumber' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'name' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'email' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'phone' }
            ]
        }
    );
    buyer         @(
        mandatory,
        Common.Text            : buyer.name,
        Common.TextArrangement : #TextFirst,
        Common.ValueList       : {
            Label          : 'Buyers',
            CollectionPath : 'BusinessPartners',
            Parameters     : [
                { $Type : 'Common.ValueListParameterInOut', LocalDataProperty : buyer_ID, ValueListProperty : 'ID' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'partnerNumber' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'name' },
                { $Type : 'Common.ValueListParameterDisplayOnly', ValueListProperty : 'email' }
            ]
        }
    );
    orderDate     @mandatory;
    deliveryDate  @mandatory;

    status   @Common.ValueListWithFixedValues: true;
    currency @Common.ValueListWithFixedValues: true;
}

annotate ChatService.BusinessPartners with @(
    Communication.Contact : {
        fn    : name,
        role  : role,
        email : [
            { type : #work, address : email }
        ],
        tel   : [
            { type : #work, uri : phone }
        ]
    }
);

annotate ChatService.PurchaseOrders with @(
    UI.HeaderInfo:{
        TypeName       : 'Purchase Order',
        TypeNamePlural : 'Purchase Orders',
        Title          : { $Type : 'UI.DataField', Value : purchaseOrder },
        Description    : { $Type : 'UI.DataField', Value : supplier.name } 
    },
    UI.LineItem : [
        { $Type : 'UI.DataField', Value : purchaseOrder, Label : 'Purchase Order' },
        { $Type : 'UI.DataField', Value : supplier_ID,   Label : 'Supplier'       },
        { $Type : 'UI.DataField', Value : buyer_ID,      Label : 'Buyer'          },
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
            { $Type : 'UI.DataField', Value : supplier_ID,   Label : 'Supplier'       },
            { $Type : 'UI.DataField', Value : buyer_ID,      Label : 'Buyer'          },
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
        supplier_ID,
        status,
        orderDate
    ]
);
annotate ChatService.PurchaseOrderItems with @(
    Common.SideEffects #ItemChanged : {
        SourceProperties : [ quantity, netPrice, product_ID ],
        TargetProperties : [
                netAmount,
                netPrice,
                unit,
                description,
                material,
                'purchaseOrder/totalAmount'
            ],
        TargetEntities   : [ purchaseOrder ]
      },
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

