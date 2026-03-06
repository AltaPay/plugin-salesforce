'use strict';

var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
const SCAPIService = require('*/cartridge/scripts/services/scapiService');

exports.beforeGET = function (orderNo) {
    try {
        var result = SCAPIService.fetchAndUpdatePaymentStatus(orderNo);

        if (!result) {
            Logger.error('MarketPay: Unable to fetch order payment status for order ' + orderNo);
            return;
        }
    } catch (e) {
        Logger.error('MarketPay: Error in updating the order payment status for order ' + orderNo + ': ' + e.message);
    }
}

exports.afterPOST = function (order) {

    Logger.info("AfterPost order ");

    try {
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', order.customer.ID);

        if (!marketPayDataObj.custom.paymentMethods || !marketPayDataObj.custom.token || !marketPayDataObj.custom.sessionID) {
            Logger.error('MarketPay: No Active Payment Session found for the user');
            return;
        }

        var marketPayToken = marketPayDataObj.custom.token;
        var marketPaySessionId = marketPayDataObj.custom.sessionID;

        const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
        const marketPayService = require('*/cartridge/scripts/services/marketPay');
        var data = marketPayDataHelper.getDataForUpdateSession(order);

        marketPayService.updateSession(marketPayToken, marketPaySessionId, data);
        var paymentInstrument = order.getPaymentInstruments()[0];

        var onInitiatePaymentURL = marketPayDataHelper.getOnInitiatePaymentURL(
            paymentInstrument.custom.marketPayPaymentMethodID,
            marketPayDataObj.custom.paymentMethods);

        var mpPayment = marketPayService.createPayment(marketPayToken,
            marketPaySessionId,
            paymentInstrument.custom.marketPayPaymentMethodID,
            onInitiatePaymentURL);

        const Transaction = require('dw/system/Transaction');

        Transaction.wrap(function () {
            paymentInstrument.custom.marketPayPaymentURL = mpPayment.url;
        });

        // clean up 
        Transaction.wrap(function () {
            CustomObjectMgr.remove(marketPayDataObj);
        });
        
    } catch (e) {
        Logger.error("MarketPay: Error updating session: " + e.message);
    }
};




