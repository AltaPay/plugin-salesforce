'use strict';

const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');


exports.modifyGETResponse_v2 = function (basket, paymentMethodResultResponse) {

    try {

        const marketPay = require('*/cartridge/scripts/services/marketPay');
        const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');        
    
        var marketPayTokenAndSession = marketPay.getTokenAndSessionId(marketPayDataHelper.getFormattedDataForMarketPaySession(basket));
        var marketPayPaymentMethods = marketPay.getPaymentMethods(marketPayTokenAndSession.token, marketPayTokenAndSession.sessionId);

        const site = require('*/cartridge/scripts/helpers/site.js');
        var marketPayTerminalsMapping = site.getCustomPreference('marketpayTerminals');
        
        session.privacy.marketPayTokenAndSession = JSON.stringify(marketPayTokenAndSession);
                
        // Parse JSON if it's a string
        if (typeof marketPayTerminalsMapping === 'string') {
            marketPayTerminalsMapping = JSON.parse(marketPayTerminalsMapping);
        }
        
        var paymentMethods = paymentMethodResultResponse.applicablePaymentMethods;

        // Get current locale from basket or request    
        var currentLocale = Site.getCurrent().defaultLocale;        
        var currencyCode = Site.getCurrent().getDefaultCurrency();

        Logger.info("CurrentLocale: " + currentLocale);
        Logger.info("currencyCode: "+ currencyCode);

    // MarketPay specific payment method IDs to validate
    var marketPayMethods = [
        'MARKETPAY_CREDITCARDS',
        'MARKETPAY_IDEAL',
        'MARKETPAY_INVOICE',
        'MARKETPAY_KLARNA_ACCOUNT',
        'MARKETPAY_KLARNA_INVOICE',
        'MARKETPAY_MOBILEPAY',
        'MARKETPAY_PAYPAL',
        'MARKETPAY_SOFORT',
        'MARKETPAY_VIABILL'
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

        Logger.info("modifyGetResponse called");

    } catch (e) {
        Logger.error("Error in modifyGETResponse_v2: " + e.message);
        Logger.error("Stack trace: " + e.stack);
        // Return original payment methods on error
        return;
    }
};


