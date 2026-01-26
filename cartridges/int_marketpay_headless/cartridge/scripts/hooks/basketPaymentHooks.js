'use strict';

const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
const BasketMgr = require('dw/order/BasketMgr');

exports.afterPOST = function (basketId) {

    Logger.info("basket afterPost Called ");

    var HookMgr = require('dw/system/HookMgr');

    if (HookMgr.hasHook('dw.order.createOrderNo')) {
        var orderNo = HookMgr.callHook('dw.order.createOrderNo', 'createOrderNo');
        Logger.info("MarketPayOrderNo Created via hook: " + orderNo);
    } else {
        Logger.error("dw.order.createOrderNo hook not found");
    }
}

exports.modifyGETResponse_v2 = function (basket, paymentMethodResultResponse) {

    try {

        const marketPayService = require('*/cartridge/scripts/services/marketPay');
        const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');        

        var marketPayTokenAndSession = marketPayService.getTokenAndSessionId(marketPayDataHelper.getFormattedDataForMarketPaySession(basket));
        var marketPayPaymentMethods = marketPayService.getPaymentMethods(marketPayTokenAndSession.token, marketPayTokenAndSession.sessionId);

        const site = require('*/cartridge/scripts/helpers/site.js');
        var marketPayTerminalsMapping = site.getCustomPreference('marketpayTerminals');
        var paymentMethods = paymentMethodResultResponse.applicablePaymentMethods;
        var currentLocale = Site.getCurrent().defaultLocale;
        var currencyCode = Site.getCurrent().getDefaultCurrency();
                
        // Parse JSON if it's a string
        if (typeof marketPayTerminalsMapping === 'string') {
            marketPayTerminalsMapping = JSON.parse(marketPayTerminalsMapping);
        }            

        // MarketPay specific payment method IDs to validate
        var marketPayMethods = [
            'MARKETPAY_CREDITCARD',
            'MARKETPAY_MOBILEPAY',
            'MARKETPAY_VIPPS',
            'MARKETPAY_KLARNA',
            'MARKETPAY_IDEAL',
            'MARKETPAY_VIABILL',
            'MARKETPAY_SWISH',
            'MARKETPAY_BANCONTACT',
            'MARKETPAY_BANKPAYMENT',
            'MARKETPAY_TWINT',
            'MARKETPAY_TRUSTLY',
            'MARKETPAY_PRZELEWY24',
            'MARKETPAY_PAYPAL',
        ];

        // Check if marketPayTerminalsMapping is valid
        if (!marketPayTerminalsMapping || !marketPayTerminalsMapping.terminals) {
            Logger.warn("MarketPay terminals mapping not found or invalid");
            return;
        }

        // Convert ArrayList to JavaScript array, then filter
        var filteredMethods = paymentMethods.toArray().filter(function (method) {

        // Only process MarketPay payment methods
        if (marketPayMethods.indexOf(method.id) === -1) {
            return false;
        }

        // Check if terminals exist for the default currency
        if (!marketPayTerminalsMapping.terminals[currencyCode]) {
            return false;
        }

        // Get terminals for the current currency
        var currencyTerminals = marketPayTerminalsMapping.terminals[currencyCode];

        // Find if there's a terminal mapping for this payment method with matching locale
        var terminalMapping = null;
        for (var i = 0; i < currencyTerminals.length; i++) {
            var terminal = currencyTerminals[i];
            if (terminal.id === method.id && terminal.allowedlocales.indexOf(currentLocale) !== -1) {
                terminalMapping = terminal;
                break;
            }
        }

        // If mapping exists, add terminal info to the method
        if (terminalMapping !== null) {

            // Match terminalMapping.name with marketPayPaymentMethods metadata.terminalName
            if (marketPayPaymentMethods && marketPayPaymentMethods.methods && marketPayPaymentMethods.methods.length > 0) {
                for (var k = 0; k < marketPayPaymentMethods.methods.length; k++) {
                    var paymentMethod = marketPayPaymentMethods.methods[k];
                    if (paymentMethod.metadata && paymentMethod.metadata.terminalName === terminalMapping.name) {
                        // Include the matched payment method
                        method.c_marketPay = {
                            access_token: marketPayTokenAndSession.token,
                            sessionId: marketPayTokenAndSession.sessionId,
                            paymentMethod: paymentMethod
                        }                        
                        break;
                    }
                }
            }
            return true;
        }
        return false;
    });

        paymentMethodResultResponse.applicablePaymentMethods = filteredMethods;        

    } catch (e) {
        Logger.error("Error in modifyGETResponse_v2: " + e.message);
        Logger.error("Stack trace: " + e.stack);
        // Return original payment methods on error
        return;
    }
};

exports.modifyPOSTResponse = function(basket, basketResponse, paymentInstrumentRequest ) {

    Logger.info("MarketPay: payment instrument modifyPOSTREsponse ");

    const marketPayService = require('*/cartridge/scripts/services/marketPay');
    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

    if (paymentInstrumentRequest.c_marketpayPaymentMethodID &&
        paymentInstrumentRequest.c_marketPayToken &&
        paymentInstrumentRequest.c_marketPaySessionID) {

        Logger.info("c_marketpayPaymentMethodID: " + paymentInstrumentRequest.c_marketpayPaymentMethodID);

        // Token and sessionId should be sent from PWA in the request body
        Logger.info("beforePost token: " + paymentInstrumentRequest.c_marketPayToken);
        Logger.info("beforePost sessionID: " + paymentInstrumentRequest.c_marketPaySessionID);

        // Token and sessionId should be sent from PWA in the request body
        var mpPayment = marketPayService.createPayment(paymentInstrumentRequest.c_marketPayToken,
            paymentInstrumentRequest.c_marketPaySessionID,
            paymentInstrumentRequest.c_marketpayPaymentMethodID);
        basketResponse.c_marketPay = mpPayment;
    } else {
        var missingFields = [];
        if (!paymentInstrumentRequest.c_marketpayPaymentMethodID) {
            missingFields.push('c_marketpayPaymentMethodID');
        }
        if (!paymentInstrumentRequest.c_marketPayToken) {
            missingFields.push('c_marketPayToken');
        }
        if (!paymentInstrumentRequest.c_marketPaySessionID) {
            missingFields.push('c_marketPaySessionID');
        }

        Logger.error("MarketPay: Missing required fields: " + missingFields.join(', '));
        basketResponse.c_marketPayError = {
            error: true,
            message: "Missing required MarketPay fields: " + missingFields.join(', ')
        };

        return;
    }
};
