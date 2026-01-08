var RESTResponseMgr = require('dw/system/RESTResponseMgr');
var marketPay = require('*/cartridge/scripts/services/marketPay')

exports.createCheckoutSession = function () {
    var requestBody = request.httpParameterMap.requestBodyAsString;
    var requestData = JSON.parse(requestBody);
    var result = marketPay.getTokenAndSessionId(requestData);
    try {
        RESTResponseMgr
            .createSuccess(result)
            .render();
    } catch (error) {
        RESTResponseMgr
            .createError(404, 'Session-error', 'Not created', 'please reach out the SFCC developers.')
            .render();
    }
};

exports.getNextOrderId = function () {
};

exports.getPaymentMethodConfigration = function () {
};

exports.createCheckoutSession.public = true;
exports.getPaymentMethodConfigration.public = true;
exports.getNextOrderId.public = true;

