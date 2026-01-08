exports.beforePOST = function (basket, paymentInstrument) {
};

exports.afterPOST = function (basket, paymentInstrument) {
};

exports.modifyPOSTResponse = function (basket, basketResponse, paymentInstrumentRequest) {
};

exports.modifyGETResponse_v2 = function (basket, paymentMethodResultResponse) {

    Logger.info('modifyGetResponse_v2 called:');
    
    
    return paymentMethodResultResponse;
};

