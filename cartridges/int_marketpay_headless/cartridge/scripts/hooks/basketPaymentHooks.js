'use strict';

const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
const Transaction = require('dw/system/Transaction');
const SCAPIService = require('*/cartridge/scripts/services/scapiService');


exports.modifyGETResponse_v2 = function (basket, paymentMethodResultResponse) {
    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

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

    try {
        var result = SCAPIService.createMarketPaySession(basket.customer.ID, marketPayDataHelper.getFormattedDataForMarketPaySession(basket));

        if (!result) {
            throw new Error('MarketPay: Unable to create Payment Session');
        }

        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', basket.customer.ID);
        var marketPayPaymentMethods = JSON.parse(marketPayDataObj.custom.paymentMethods);

        var marketPayTerminalsMapping = Site.getCurrent().getCustomPreferenceValue('marketPayTerminals');
        var paymentMethods = paymentMethodResultResponse.applicablePaymentMethods;
        var currencyCode = Site.getCurrent().getDefaultCurrency();

        // Parse JSON if it's a string
        if (typeof marketPayTerminalsMapping === 'string') {
            marketPayTerminalsMapping = JSON.parse(marketPayTerminalsMapping);
        }

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

            var terminalMapping = marketPayDataHelper.getTerminalMapping(marketPayTerminalsMapping, request.locale, currencyCode, method.id);
            if (terminalMapping !== null) {
                var paymentMethod = marketPayDataHelper.getMarketPayDataForTerminalName(marketPayPaymentMethods, terminalMapping.name);
                if (paymentMethod) {
                    method.c_marketPay = {
                        paymentMethod: paymentMethod
                    }
                    return true;
                }
            }
            return false;
        });

        paymentMethodResultResponse.applicablePaymentMethods = filteredMethods;

    } catch (e) {
        Logger.error("MarketPay error in modifyGETResponse_v2: " + e.message);
        Logger.error("Stack trace: " + e.stack);

        // Filter out MarketPay methods on error.
        var allMethods = paymentMethodResultResponse.applicablePaymentMethods;
        if (allMethods) {
            paymentMethodResultResponse.applicablePaymentMethods = allMethods.toArray().filter(function (method) {
                return marketPayMethods.indexOf(method.id) === -1;
            });
        }
    }
};

exports.beforePOST = function (basket, paymentInstrument) {
    var Status = require('dw/system/Status');
    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

    if (marketPayDataHelper.isMarketPayProcessor(paymentInstrument.paymentMethodId) &&
        !paymentInstrument.c_marketPayPaymentMethodID) {

        Logger.error('MarketPay: c_marketPayPaymentMethodID is required for MARKETPAY payment processor');
        return new Status(Status.ERROR, 'MISSING_MARKETPAY_METHOD_ID', 'c_marketPayPaymentMethodID is required for MarketPay payment methods');
    }
};

exports.afterPOST = function (basket, paymentInstrument) {
    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

    if (
        paymentInstrument &&
        marketPayDataHelper.isMarketPayProcessor(paymentInstrument.paymentMethodId) &&
        paymentInstrument.c_marketPayPaymentMethodID
    ) {
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');
        var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', basket.customer.ID);
        var marketPaySessionId = marketPayDataObj ? marketPayDataObj.custom.sessionID : null;
        var marketPayPaymentMethods = marketPayDataObj ? marketPayDataObj.custom.paymentMethods : null;
        var marketPayPaymentMethodID = paymentInstrument.c_marketPayPaymentMethodID;
        var marketPayPlatform = paymentInstrument.c_marketPayPlatform ? paymentInstrument.c_marketPayPlatform : "web";
        var marketPayAppReturnURL = paymentInstrument.c_marketPayAppReturnURL || null;

        // c_marketPayAppReturnURL is shopper-supplied — only trust values matching the merchant's
        // configured allowlist, otherwise silently drop it (checkout still proceeds, just without
        // Native App Flow) to avoid it being used as an open redirect.
        if (marketPayAppReturnURL && !marketPayDataHelper.isAllowedAppReturnURL(marketPayAppReturnURL)) {
            Logger.warn('MarketPay: Rejected c_marketPayAppReturnURL not present in marketPayAppReturnURLAllowlist: ' + marketPayAppReturnURL);
            marketPayAppReturnURL = null;
        }
        var paymentMethodId = paymentInstrument.paymentMethodId;
        var onInitiatePaymentURL = marketPayDataHelper.getOnInitiatePaymentURL(
            marketPayPaymentMethodID,
            marketPayPaymentMethods
        );

        if (!marketPayDataObj || !marketPaySessionId || !marketPayPaymentMethods || !onInitiatePaymentURL) {
            Logger.error('MarketPay: No active payment session found for user ' + basket.customer.ID);
            return new dw.system.Status(dw.system.Status.ERROR, 'No active MarketPay payment session found');
        }

        var paymentInstruments = basket.paymentInstruments;

        if (paymentInstruments && paymentInstruments.length) {
            for (var i = 0; i < paymentInstruments.length; i++) {
                var currentPaymentInstrument = paymentInstruments[i];

                if (currentPaymentInstrument.paymentMethod !== paymentMethodId) {
                    continue;
                }

                Transaction.wrap(function () {
                    currentPaymentInstrument.custom.marketPayPaymentMethodID = marketPayPaymentMethodID;
                    currentPaymentInstrument.custom.marketPayPlatform = marketPayPlatform;
                    currentPaymentInstrument.custom.marketPayAppReturnURL = marketPayAppReturnURL || null;
                });
                break;
            }
        }
    }
};