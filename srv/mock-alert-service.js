const cds= require('@sap/cds')

class MockAlertService extends cds.Service{
    async init(){   
        this.on('POST','*',(req)=>{
            console.log("--- ALERT NOTIFICATION ---")
            console.log(JSON.stringify(req.data,null,2))
            console.log("--------------------------")
            return {status: 'Sent (Mocked)'}
        });
        await super.init()
    }
}

module.exports = MockAlertService;