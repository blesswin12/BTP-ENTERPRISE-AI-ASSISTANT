@cds.external : true
@m.IsDefaultEntityContainer : 'true'
@OData.schema.version : '2.0'
service API_BUSINESS_PARTNER {
    // @cds.persistence.skip : 'always'
    @Common.Label : 'Business Partner'
    entity A_BusinessPartner {
    @Common.Label : 'Business Partner'
    key BusinessPartner : String(10);
    @Common.Label : 'Customer'
    Customer : String(10);
    @Common.Label : 'Supplier'
    Supplier : String(10);
    @Common.Label : 'Category'
    BusinessPartnerCategory : String(1);
    @Common.Label : 'Full Name'
    BusinessPartnerFullName : String(81);
    @Common.Label : 'Is Blocked'
    BusinessPartnerIsBlocked : Boolean;
    @Common.Label : 'Search Term'
    SearchTerm1 : String(20);
    @Common.Label : 'Authorization Group'
    AuthorizationGroup : String(4);
    };
}