'use strict';

var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');

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

        var onInitiatePaymentURL = marketPayDataHelper.getOnInitiatePaymentURL(
            order.paymentInstrument.custom.marketPayPaymentMethodID,
            marketPayDataObj.custom.paymentMethods);

        var mpPayment = marketPayService.createPayment(marketPayToken,
            marketPaySessionId,
            order.paymentInstrument.custom.marketPayPaymentMethodID,
            onInitiatePaymentURL);

        const Transaction = require('dw/system/Transaction');


        Transaction.wrap(function () {
            order.paymentInstrument.custom.marketPayPaymentURL = mpPayment.url;
        });

        // clean up 

        Transaction.wrap(function () {
            CustomObjectMgr.remove(marketPayDataObj);
        });

        Logger.info('MarketPay: Successfully cleaned up MarketPayData custom object for customer ' + order.customer.ID);
        
    } catch (e) {
        Logger.error("MarketPay: Error updating session: " + e.message);
    }
};




