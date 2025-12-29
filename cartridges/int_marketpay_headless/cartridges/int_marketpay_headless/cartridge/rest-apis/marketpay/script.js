const RESTResponseMgr = require('dw/system/RESTResponseMgr');
const marketPay = require('*/cartridge/scripts/services/marketPay')

exports.createCheckoutSession = function () {
    const result = marketPay.getTokenAndSessionId();
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

