namespace enterprise.ai;

using { cuid, managed, Currency, sap.common.CodeList } from '@sap/cds/common';
using from './ai-models';


entity OrderStatuses : CodeList {
  key code        : String(20);
      criticality : Integer default 0;
}

entity BusinessPartners : cuid, managed {
  partnerNumber : String(10) @title: 'Partner ID';
  name          : String(120);
  role          : String(20); // 'Supplier', 'Buyer'
  email         : String(100);
  phone         : String(30);
  country       : String(3);
}
entity Products : cuid, managed {
  productID   : String(40) @title: 'Product ID';
  name        : String(100);
  category    : String(50);
  baseUnit    : String(10);
  price       : Decimal(15, 2);
  currency    : Currency;
}

entity PurchaseOrders {
  key ID            : UUID;

      @assert.format: '^.{5,20}$'
      purchaseOrder : String(20)  not null;
      supplier      : Association to BusinessPartners not null;
      buyer         : Association to BusinessPartners;
      orderDate     : Date;
      deliveryDate  : Date;
      status        : POStatus    default 'Pending';
      currency      : POCurrency  default 'INR';
      totalAmount   : Decimal(15,2);
      virtual criticality : Integer;

      items         : Composition of many PurchaseOrderItems
                        on items.purchaseOrder = $self;
}

entity PurchaseOrderItems {
  key ID            : UUID;
      purchaseOrder : Association to PurchaseOrders;
      itemNumber    : Integer not null;
      material      : String(80) not null; // Preserves test & CSV compatibility
      product       : Association to Products;
      description   : String(200);

      @assert.range: [1, _]
      quantity      : Decimal(13,3);
      unit          : String(10);
      netPrice      : Decimal(15,2);
      netAmount     : Decimal(15,2);
      plant         : String(30);
      deliveryDate  : Date;
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