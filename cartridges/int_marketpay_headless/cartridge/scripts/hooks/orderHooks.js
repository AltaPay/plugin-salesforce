'use strict';

var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');

exports.beforeGET = function (orderNo) {
    try {
        var OrderMgr = require('dw/order/OrderMgr');
        var marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
        var order = OrderMgr.getOrder(orderNo);
        if (!order) return;
        var latestPI = marketPayDataHelper.getLatestPaymentInstrumentFromOrder(order);
        if (!latestPI || !marketPayDataHelper.isMarketPayProcessor(latestPI.paymentMethod)) {

            Logger.info("Order:beforeGET: Not Marketpay PM ");
            return;
        }

        const SCAPIService = require('*/cartridge/scripts/services/scapiService');
        var result = SCAPIService.fetchAndUpdatePaymentStatus(orderNo);

        if (!result) {
            Logger.error('MarketPay: Unable to fetch order payment status for order ' + orderNo);
            return;
        }
    } catch (e) {
        Logger.error('MarketPay: Error in updating the order payment status for order ' + orderNo + ': ' + e.message);
    }
}

exports.beforePOST = function (basket) {
    try {

        if(basket.getPaymentInstruments().length == 0)
            throw new Error("No Payment Instrument found on Basket");

        const Site = require('dw/system/Site');
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

        var paymentInstrument = marketPayDataHelper.getLatestPaymentInstrumentFromBasket(basket);
        if (!paymentInstrument || !marketPayDataHelper.isMarketPayProcessor(paymentInstrument.paymentMethod)){ 

            Logger.info("Order:beforePOST: Not Marketpay PM ");
            return;
        }

        var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', basket.customer.ID);
        var cachedMarketPayPaymentMethods = JSON.parse(marketPayDataObj.custom.paymentMethods);

        var currentLocale = request.locale;
        var currencyCode = Site.getCurrent().getDefaultCurrency();
        var marketPayTerminalsMapping = JSON.parse(Site.getCurrent().getCustomPreferenceValue('marketPayTerminals'));
        var terminalMapping = marketPayDataHelper.getTerminalMapping(marketPayTerminalsMapping, currentLocale, currencyCode, paymentInstrument.paymentMethod);

        if (terminalMapping !== null) {

            var mpPaymentMethod = marketPayDataHelper.getMarketPayDataForTerminalName(cachedMarketPayPaymentMethods, terminalMapping.name);
            if (mpPaymentMethod) {
                const Transaction = require('dw/system/Transaction');
                Transaction.wrap(function () {
                    paymentInstrument.custom.marketPayPaymentMethodID = mpPaymentMethod.id;
                });
            }
        }
    }
    catch (e) {
        Logger.error("MarketPay Place Order Error" + e.message);
        return new dw.system.Status(dw.system.Status.ERROR, 'MARKETPAY_ERROR', e.message);
    }
}

exports.afterPOST = function (order) {
    const Transaction = require('dw/system/Transaction');

    try {
        const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

        var latestPICheck = marketPayDataHelper.getLatestPaymentInstrumentFromOrder(order);
        if (!latestPICheck || !marketPayDataHelper.isMarketPayProcessor(latestPICheck.paymentMethod)) {

            Logger.info("Order:afterPOST: Not Marketpay PM ");
            return;
        }

        const marketPayService = require('*/cartridge/scripts/services/marketPay');        
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', order.customer.ID);

        if (!marketPayDataObj || !marketPayDataObj.custom.paymentMethods || !marketPayDataObj.custom.token || !marketPayDataObj.custom.sessionID) {
            Logger.error('MarketPay: No Active Payment Session found for the user');
            throw new Error('MarketPay: No Active Payment Session found for the user');
        }
        var paymentInstrument = marketPayDataHelper.getLatestPaymentInstrumentFromOrder(order);
        var isAutoCapture = marketPayDataHelper.isAutoCapture(paymentInstrument.paymentMethod);

        var marketPayToken = marketPayDataObj.custom.token;
        var marketPaySessionId = marketPayDataObj.custom.sessionID;
        var data = marketPayDataHelper.getDataForUpdateSession(order, isAutoCapture);

        marketPayService.updateSession(marketPayToken, marketPaySessionId, data);

        var onInitiatePaymentURL = marketPayDataHelper.getOnInitiatePaymentURL(
            paymentInstrument.custom.marketPayPaymentMethodID,
            marketPayDataObj.custom.paymentMethods);

        var mpPayment = marketPayService.createPayment(marketPayToken,
            marketPaySessionId,
            paymentInstrument.custom.marketPayPaymentMethodID,
            onInitiatePaymentURL);

        // clean up and set payment URL in a single transaction to avoid partial state
        Transaction.wrap(function () {
            paymentInstrument.custom.marketPayPaymentURL = mpPayment.url;
            order.custom.marketPayError = false;
            // Re-fetch inside the transaction to avoid ORMOptimisticLockingException
            // when a concurrent request (e.g. payment instrument update) has modified
            // the MarketPayData custom object between when we first read it and now.
            var freshMarketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', order.customer.ID);
            if (freshMarketPayDataObj) {
                CustomObjectMgr.remove(freshMarketPayDataObj);
            }
            order.custom.marketPayUserLocale = marketPayDataHelper.getCurrentLocal();
        });
        
    } catch (e) {
        Logger.error("MarketPay: Error updating session: " + e.message);
        Transaction.wrap(function () {
            order.custom.marketPayError = true;
            order.custom.marketPayErrorMessage = e.message;
        });
    }
};




