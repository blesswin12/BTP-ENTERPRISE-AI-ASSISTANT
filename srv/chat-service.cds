using {enterprise.ai as db} from '../db/schema';

service ChatService @(path: '/chat') {
    @readonly entity ChatHistory      as projection on db.ChatHistory;
    @readonly entity Documents        as projection on db.Documents;
    entity PurchaseOrders as projection on db.PurchaseOrders;

    entity PurchaseOrderItems as projection on db.PurchaseOrderItems;

    action askAnalytics (question: String) returns String;

    action askDocument (question: String) returns String;

    action uploadDocument (filename: String, content: String) returns String;    

    action getSummary () returns String;


}

annotate ChatService.PurchaseOrders with @(
    UI.HeaderInfo:{
        TypeName: 'Purchase Order',
        TypeNamePlural: 'Purchase Orders',
        Title:{Value    : purchaseOrder},
        Description:{Value: supplier} 
    },
    UI.LineItem: [
        {Value: purchaseOrder,Label: 'Purchase Order'},
        {Value: supplier,Label: 'Supplier'},
        {Value: buyer,Label: 'Buyer'},
        {Value: orderDate,Label: 'Order Date'},
        {Value: deliveryDate,Label: 'Delivery Date'},
        {Value: status,Label: 'Status'},
        {Value: totalAmount,Label: 'Total Amount'},
        {Value: currency,Label: 'Currency'}
    ],  
    UI.FieldGroup #HeaderInfo: {
        Label: 'Header Information',
        Data: [
            {Value : purchaseOrder},
            {Value : supplier},
            {Value : buyer},
            {Value : orderDate},
            {Value : deliveryDate},
            {Value : status},
            {Value : totalAmount},
            {Value : currency}
        ]
    },
    UI.Facets:[
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'HeaderInfoFacet',
            Label : 'Items',
            Target : '@UI.FieldGroup#HeaderInfo'       
        },
        {
            $Type: 'UI.ReferenceFacet',
            ID    : 'LineItemsFacet',
            Label : 'Line Items',
            Target: 'items/@UI.LineItem'
        }
    ]   
);

annotate ChatService.PurchaseOrderItems with @(
    UI.LineItem: [
        {Value: itemNumber,Label: 'Item Number'},
        {Value: material,Label: 'Material'},
        {Value: description,Label: 'Description'},
        {Value: quantity,Label: 'Quantity'},
        {Value: unit,Label: 'Unit'},
        {Value: netPrice,Label: 'Net Price'},
        {Value: netAmount,Label: 'Net Amount'},
        {Value: plant,Label: 'Plant'},
        {Value: deliveryDate,Label: 'Delivery Date'}
    ]
);
  
