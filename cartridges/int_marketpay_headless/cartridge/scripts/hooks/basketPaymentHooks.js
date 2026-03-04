'use strict';

const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
const Transaction = require('dw/system/Transaction');
const SCAPIService = require('*/cartridge/scripts/services/scapiService');


exports.modifyGETResponse_v2 = function (basket, paymentMethodResultResponse) {

    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
    const site = require('*/cartridge/scripts/helpers/site.js');

    var result = SCAPIService.createMarketPaySession(basket.customer.ID, marketPayDataHelper.getFormattedDataForMarketPaySession(basket));

    if (!result) {

        return new dw.system.Status(dw.system.Status.ERROR, 'MarketPay: Unable to create Payment Session');
    }

    try {
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', basket.customer.ID);
        var marketPayPaymentMethods = JSON.parse(marketPayDataObj.custom.paymentMethods);

        var marketPayTerminalsMapping = site.getCustomPreference('marketPayTerminals');
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

            // Only process MarketPay payment methods, pass through all others
            if (marketPayMethods.indexOf(method.id) === -1) {
                return true;
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

                var returnVal = false;
                // Match terminalMapping.name with marketPayPaymentMethods metadata.terminalName
                if (marketPayPaymentMethods && marketPayPaymentMethods.methods && marketPayPaymentMethods.methods.length > 0) {
                    for (var k = 0; k < marketPayPaymentMethods.methods.length; k++) {
                        var paymentMethod = marketPayPaymentMethods.methods[k];
                        if (paymentMethod.metadata && paymentMethod.metadata.terminalName === terminalMapping.name) {
                            // Include the matched payment method
                            delete paymentMethod.onInitiatePayment;

                            method.c_marketPay = {
                                paymentMethod: paymentMethod
                            }
                            returnVal = true;
                            break;
                        }
                    }
                }
                return returnVal;
            }
            return false;
        });

        paymentMethodResultResponse.applicablePaymentMethods = filteredMethods;

    } catch (e) {
        Logger.error("Error in modifyGETResponse_v2: " + e.message);
        Logger.error("Stack trace: " + e.stack);

        return new dw.system.Status(dw.system.Status.ERROR, 'MarketPay Error:' + e.message);
        // Return original payment methods on error
    }
};


exports.afterPOST = function (basket, paymentInstrument) {

    var paymentInstrumentRequest = paymentInstrument;
    var basketResponse = basket;
    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

    if (paymentInstrumentRequest.c_marketPayPaymentMethodID) {

        // Get sessionId from Custom Object MarketPayData for this user
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', basket.customer.ID);
        var marketPaySessionId = marketPayDataObj ? marketPayDataObj.custom.sessionID : null;
        var marketPayPaymentMethods = marketPayDataObj ? marketPayDataObj.custom.paymentMethods : null;
        var onInitiatePaymentURL = marketPayDataHelper.getOnInitiatePaymentURL(paymentInstrumentRequest.c_marketPayPaymentMethodID, marketPayPaymentMethods);

        if (!marketPayDataObj || !marketPaySessionId || !marketPayPaymentMethods || !onInitiatePaymentURL) {
            Logger.error('MarketPay: No Active Payment Session found for the user');
            return new dw.system.Status(dw.system.Status.ERROR, 'MarketPay: No Active Payment Session found for the user');
        }

        if (basketResponse.paymentInstruments && basketResponse.paymentInstruments.length > 0) {
            for (var i = 0; i < basketResponse.paymentInstruments.length; i++) {
                var paymentInstrument = basketResponse.paymentInstruments[i];
                if (paymentInstrument.paymentMethod === paymentInstrumentRequest.paymentMethodId) {
                    Transaction.wrap(function () {
                        paymentInstrument.custom.marketPayPaymentMethodID = paymentInstrumentRequest.c_marketPayPaymentMethodID;                        
                    });
                    break;
                }
            }
        }

    } else {
        var missingFields = [];
        if (!paymentInstrumentRequest.c_marketPayPaymentMethodID) {
            missingFields.push('c_marketPayPaymentMethodID');
        }

        Logger.error("MarketPay: Missing required fields: " + missingFields.join(', '));
        return new dw.system.Status(dw.system.Status.ERROR, 'MarketPay: Missing required fields:' + missingFields.join(', '));
    }
};