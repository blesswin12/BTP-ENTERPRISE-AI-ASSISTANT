namespace enterprise.ai;
using { Attachments } from '@cap-js/attachments';
entity Documents {
  key ID         : UUID;
      fileName   : String(200) not null;
      content    : LargeString;
      uploadedAt : DateTime;
      fileType   : String(50);
      attachments : Composition of many Attachments;
}

entity Embeddings {
  key ID         : UUID;
      documentID : UUID not null;
      document   : Association to Documents on document.ID = documentID;
      chunkText  : LargeString not null;
      chunkIndex : Integer not null;
      embedding  : LargeString;
}

entity ChatHistory {
  key ID           : UUID;
      conversationID : UUID;
      userQuestion : LargeString not null;
      aiResponse   : LargeString not null;
      feature      : String(50);
      timestamp    : DateTime;
}

// entity PurchaseOrders {
//   key ID            : UUID;
//       purchaseOrder : String(20) not null;
//       supplier      : String(120) not null;
//       buyer         : String(100);
//       orderDate     : Date;
//       deliveryDate  : Date;
//       status        : String(30);
//       currency      : String(3);
//       totalAmount   : Decimal(15,2);
//       items         : Composition of many PurchaseOrderItems
//                         on items.purchaseOrder = $self;
// }

entity PurchaseOrderItems {
  key ID            : UUID;
      purchaseOrder : Association to PurchaseOrders;
      itemNumber    : Integer not null;
      material      : String(80) not null;
      description   : String(200);
      quantity      : Decimal(13,3);
      unit          : String(10);
      netPrice      : Decimal(15,2);
      netAmount     : Decimal(15,2);
      plant         : String(30);
      deliveryDate  : Date;
}

entity PurchaseOrders {
  key ID            : UUID;

      @assert.format: '^.{5,20}$'
      purchaseOrder : String(20)  not null;
      supplier      : String(120) not null;
      buyer         : String(100);
      orderDate     : Date;
      deliveryDate  : Date;
      status        : POStatus    default 'Pending';
      currency      : POCurrency  default 'INR';
      totalAmount   : Decimal(15,2);
      virtual criticality   : Integer;
      items         : Composition of many PurchaseOrderItems
                        on items.purchaseOrder = $self;
}

type POStatus : String(30) enum {
  Pending;
  Ordered;
  Approved;
  Rejected;
  Cancelled;
  Completed;
  PartiallyDelivered = 'Partially Delivered';
  Draft;
}

type POCurrency : String(3) enum {
  INR;
  USD;
  EUR;
  GBP;
  SGD;
}