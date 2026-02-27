const RESTResponseMgr = require('dw/system/RESTResponseMgr');
const marketPay = require('*/cartridge/scripts/services/marketPay')
const Logger = require('dw/system/Logger').getLogger('MarketPay','MarketPay');
const SCAPIService = require('*/cartridge/scripts/services/scapiService');

exports.createCheckoutSession = function () {
    var customerId = request.httpParameterMap.c_customerId;
    var customerIdValue = customerId.stringValue;

    try {
        var requestBody = request.httpParameterMap.requestBodyAsString;
        var requestData = JSON.parse(requestBody);
        var result = marketPay.getTokenAndSessionId(requestData);
        var paymentMethods = marketPay.getPaymentMethods(result.token, result.sessionId);

        const Transaction = require('dw/system/Transaction');
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');

        Transaction.wrap(function () {
            var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', customerIdValue);
            if (!marketPayDataObj) {
                marketPayDataObj = CustomObjectMgr.createCustomObject('MarketPayData', customerIdValue);
            }
            marketPayDataObj.custom.sessionID = result.sessionId;
            marketPayDataObj.custom.customerID = customerIdValue;
            marketPayDataObj.custom.token = result.token;
            marketPayDataObj.custom.paymentMethods = JSON.stringify(paymentMethods);
        });        
        
        RESTResponseMgr
            .createEmptySuccess(200)
            .render();
    } catch (error) {

        Logger.error('Error creating session ' + error.message);

        RESTResponseMgr
            .createError(404, 'Session-error', 'Not created', 'please reach out the SFCC developers.')
            .render();

        
    }
};

exports.createCheckoutSession.public = true;

