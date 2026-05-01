'use strict';

const Site = require('dw/system/Site');
const Encoding = require('dw/crypto/Encoding');
const Bytes = require('dw/util/Bytes');
const CALLBACK_TYPE = { URL: 'URL', FUNCTION: 'FUNCTION' };
const ROUTES = {
    CALLBACK_FORM: 'MarketPay-CallbackForm',
    SUCCESS: 'MarketPay-PaymentSuccess',
    FAILURE: 'MarketPay-PaymentFail',
    REDIRECT: 'MarketPay-Redirect',
    NOTIFICATION: 'MarketPay-PaymentNotification'
};
const MARKETPAY_IP_ADDRESS_SET = ["185.206.120.0/24", "2a10:a200::/29", '185.203.232.129', '185.203.233.129'];

function orderLinesDiff(orderLines, total) {
    var orderLinesTotal = 0;
    orderLines.forEach(function (orderLine) {
        var orderLinePriceWithTax =
            (orderLine.unitPrice * orderLine.quantity) + orderLine.taxAmount;
        orderLinesTotal += orderLinePriceWithTax;
    });

    return (Math.round(total * 100) - Math.round(orderLinesTotal * 100)) / 100;
}

function isMarketPayProcessor(paymentMethodId) {
    var PaymentMgr = require('dw/order/PaymentMgr');
    var pm = PaymentMgr.getPaymentMethod(paymentMethodId);
    return pm && pm.paymentProcessor && pm.paymentProcessor.ID === 'MARKETPAY';
}

/**
 * 
 * @param {*} marketPayTerminalsMapping 
 * @param {*} currentLocale 
 * @param {*} currencyCode 
 * @param {*} paymentMethodId 
 * @returns 
 * terminals for the current currency, locale and paymentMethod id                    
 */
function getTerminalMapping(marketPayTerminalsMapping, currentLocale, currencyCode, paymentMethodId) {
    var currencyTerminals = marketPayTerminalsMapping.terminals[currencyCode];

    if(!currencyTerminals)
        return null;

    // Find if there's a terminal mapping for this payment method with matching locale
    var terminalMapping = null;
    for (var i = 0; i < currencyTerminals.length; i++) {
        var terminal = currencyTerminals[i];
        if (terminal.id === paymentMethodId && terminal.allowedlocales.indexOf(currentLocale) !== -1) {
            terminalMapping = terminal;
            break;
        }
    }

    return terminalMapping;
}

function getMarketPayDataForTerminalName(marketPayPaymentMethods, terminalName) {

    if (marketPayPaymentMethods && marketPayPaymentMethods.methods && marketPayPaymentMethods.methods.length > 0) {
        for (var k = 0; k < marketPayPaymentMethods.methods.length; k++) {
            var paymentMethod = marketPayPaymentMethods.methods[k];
            if (paymentMethod.metadata && paymentMethod.metadata.terminalName === terminalName) {
                return {
                    id: paymentMethod.id
                };
            }
        }
    }

    return null;
}

function getLatestPaymentInstrumentFromBasket(basket) {

    if(basket.getPaymentInstruments().length == 0)
        return null;

    var paymentInstruments = basket.getPaymentInstruments();
    var latest = paymentInstruments[0];

    for (var i = 1; i < paymentInstruments.length; i++) {
        var pi = paymentInstruments[i];
        if (pi.creationDate > latest.creationDate) {
            latest = pi;
        }
    }
    return latest;
}

function getLatestPaymentInstrumentFromOrder(order) {

    if(order.getPaymentInstruments().length == 0)
        return null;

    var paymentInstruments = order.getPaymentInstruments();

    var latest = paymentInstruments[0];
    for (var i = 1; i < paymentInstruments.length; i++) {
        var pi = paymentInstruments[i];
        if (pi.creationDate > latest.creationDate) {
            latest = pi;
        }
    }
    return latest;
}

function getBasicAuthHeader(clientId, clientSecret) {
    var credentials = clientId + ':' + clientSecret;
    var credentialsBytes = new Bytes(credentials);
    var encodedCredentials = Encoding.toBase64(credentialsBytes);
    return 'Basic ' + encodedCredentials;
}

function populateOrderData(marketPayOrderData, orderId, orderTotal, currencyCode) {
    marketPayOrderData.order.orderId = orderId;
    marketPayOrderData.order.amount.value = orderTotal;
    marketPayOrderData.order.amount.currency = currencyCode;
}

function populateOrderlineItems(marketPayOrderData, productLineItems) {
    if (productLineItems && productLineItems.length > 0) {
        for (var i = 0; i < productLineItems.length; i++) {
            var lineItem = productLineItems[i];
            var qty = lineItem.getQuantityValue();
            if (qty <= 0) continue;
            
            var description = lineItem.getProductName() || '';
            if (description.length > 50) {
                description = description.substring(0, 50);
            }
            marketPayOrderData.order.orderLines.push({
                itemId: lineItem.getProductID(),
                description: description,
                quantity: qty,
                unitPrice: Math.round((lineItem.getAdjustedNetPrice().getValue() / qty) * 100) / 100,
                taxAmount: lineItem.getAdjustedTax().getValue(),
                goodsType: 'item'
            });
        }
    }
}

function populateShippingPrice(marketPayOrderData, shipment, shippingTotalGrossPrice) {
    marketPayOrderData.order.orderLines.push({
            itemId: shipment.ID,
            description: shipment.shippingMethod.displayName,
            quantity: 1,
            unitPrice: shippingTotalGrossPrice,
            taxAmount: 0,
            goodsType: 'shipment'
        });
}

function populateRoundingDiff(marketPayOrderData, totalAmount) {

    var roundingDiff = orderLinesDiff(marketPayOrderData.order.orderLines, totalAmount)

    if (roundingDiff !== 0) {
        marketPayOrderData.order.orderLines.push({
            itemId: 'comp-amount',
            description: 'Compensation Amount',
            quantity: 1,
            unitPrice: roundingDiff,
            goodsType: 'handling',
            taxAmount: 0
        });
    }
}

function populateCustomerAndAddresses(marketPayOrderData, customer, customerEmail, billingAddress, defaultShipment) {
    var shippingAddress = defaultShipment ? defaultShipment.getShippingAddress() : null;
    if (!billingAddress) {
        billingAddress = shippingAddress;
    }

    if (customer || billingAddress || shippingAddress) {
        marketPayOrderData.order.customer = {};
        // Add customer name and email
        if (customer && customer.isRegistered()) {
            var profile = customer.getProfile();
            if (profile) {
                marketPayOrderData.order.customer.firstName = profile.getFirstName() || '';
                marketPayOrderData.order.customer.lastName = profile.getLastName() || '';
                marketPayOrderData.order.customer.email = profile.getEmail() || '';
            }
        }

        // Fallback to billing address for customer info if customer is not registered
        if (!marketPayOrderData.order.customer.email && billingAddress) {
            marketPayOrderData.order.customer.firstName = billingAddress.getFirstName() || '';
            marketPayOrderData.order.customer.lastName = billingAddress.getLastName() || '';
            marketPayOrderData.order.customer.email = customerEmail || '';
        }

        // Add billing address if available
        if (billingAddress) {
            marketPayOrderData.order.customer.billingAddress = {
                street: billingAddress.getAddress1() || '',
                city: billingAddress.getCity() || '',
                country: billingAddress.getCountryCode() ? billingAddress.getCountryCode().getValue() : '',
                zipCode: billingAddress.getPostalCode() || ''
            };
        }

        // Add shipping address if available
        if (shippingAddress) {
            marketPayOrderData.order.customer.shippingAddress = {
                street: shippingAddress.getAddress1() || '',
                city: shippingAddress.getCity() || '',
                country: shippingAddress.getCountryCode() ? shippingAddress.getCountryCode().getValue() : '',
                zipCode: shippingAddress.getPostalCode() || ''
            };
        }

        var addrForCountry = billingAddress || shippingAddress;
        if (addrForCountry && addrForCountry.getCountryCode()) {
            var countryVal = addrForCountry.getCountryCode().getValue();
            if (countryVal) {
                marketPayOrderData.configuration.country = countryVal;
            }
        }
    }
}

function populateConfiguration(marketPayOrderData, isAutoCapture) {
    marketPayOrderData.configuration.autoCapture = isAutoCapture;
}

function populateTransactionInfo(marketPayOrderData, orderToken, platform) {
    marketPayOrderData.order.transactionInfo.orderToken = orderToken;
    marketPayOrderData.order.transactionInfo.platform = platform;
}

function getSessionDataModel() {
    const Locale = require('dw/util/Locale');
    const URLUtils = require('dw/web/URLUtils');
    var currentLocale = Locale.getLocale(request.locale);

    var orderData = {
        order: {
            orderId: '',
            amount: {
                value: 0,
                currency: ''
            },
            orderLines: [],
            customer: null,
            transactionInfo: {
                ecomPlatform: "Salesforce",
                ecomPluginName: "int_marketpay_headless",
                ecomPluginVersion: "2.0.8"
            }
        },
        callbacks: {
            formStyling: URLUtils.https(ROUTES.CALLBACK_FORM).toString(),
            success: { type: CALLBACK_TYPE.URL, value: URLUtils.https(ROUTES.SUCCESS).toString() },
            failure: { type: CALLBACK_TYPE.URL, value: URLUtils.https(ROUTES.FAILURE).toString() },
            redirect: URLUtils.https(ROUTES.REDIRECT).toString(),
            notification: URLUtils.https(ROUTES.NOTIFICATION).toString()
        },
        configuration: {
            paymentType: "PAYMENT",            
            autoCapture: false,
            paymentDisplayType: "REDIRECT",
            country: null,
            language: currentLocale.language || Site.getCurrent().getDefaultLocale()
        }
    };

    return orderData;
}

function getFormattedDataForMarketPaySession(basket) {
    var orderData = getSessionDataModel();
    populateOrderData(orderData, basket.getUUID(), basket.getTotalGrossPrice().getValue(), basket.currencyCode);
    populateOrderlineItems(orderData, basket.getProductLineItems());
    populateShippingPrice(orderData, basket.defaultShipment, basket.getShippingTotalGrossPrice().getValue());
    populateRoundingDiff(orderData, basket.getTotalGrossPrice().getValue());
    populateCustomerAndAddresses(orderData, basket.getCustomer(), basket.getCustomerEmail(), basket.getBillingAddress(), basket.getDefaultShipment());

    return orderData;
}

function getDataForUpdateSession(order, isAutoCapture) {
    var orderData = getSessionDataModel();
    var latestPI = getLatestPaymentInstrumentFromOrder(order);
    populateOrderData(orderData, order.getOrderNo(), order.getTotalGrossPrice().getValue(), order.currencyCode);
    populateOrderlineItems(orderData, order.getProductLineItems());
    populateShippingPrice(orderData, order.defaultShipment, order.getShippingTotalGrossPrice().getValue());
    populateRoundingDiff(orderData, order.getTotalGrossPrice().getValue());
    populateCustomerAndAddresses(orderData, order.getCustomer(), order.getCustomerEmail(), order.getBillingAddress(), order.getDefaultShipment());
    populateConfiguration(orderData, isAutoCapture)
    populateTransactionInfo(orderData, order.orderToken, latestPI.custom.marketPayPlatform.value);    

    return orderData;
}

function getOnInitiatePaymentURL(selectedPaymentMethod, marketPayPaymentMethods) {
    marketPayPaymentMethods = JSON.parse(marketPayPaymentMethods);

    if (!selectedPaymentMethod || !marketPayPaymentMethods || !marketPayPaymentMethods.methods) {
        return null;
    }

    for (var i = 0; i < marketPayPaymentMethods.methods.length; i++) {
        var method = marketPayPaymentMethods.methods[i];
        if (method.id === selectedPaymentMethod) {
            return method.onInitiatePayment && method.onInitiatePayment.value ? method.onInitiatePayment.value : null;
        }
    }

    return null;
}

function isAutoCapture(paymentMethodID) {
    var marketPayTerminalsRaw = Site.getCurrent().getCustomPreferenceValue('marketPayTerminals');
    if (!marketPayTerminalsRaw) {
        return false;
    }

    var marketPayTerminalsMapping = typeof marketPayTerminalsRaw === 'string'
        ? JSON.parse(marketPayTerminalsRaw)
        : marketPayTerminalsRaw;

    var currentLocale = request.locale;
    var currencyCode = Site.getCurrent().getDefaultCurrency();

    var terminalMapping = getTerminalMapping(marketPayTerminalsMapping, currentLocale, currencyCode, paymentMethodID);

    return terminalMapping ? terminalMapping.autoCapture === true : false;
}

function getLatestTransaction(transactions) {
    var latestDate = '';
    var latestTransaction = null;

    for (var i = 0; i < transactions.length(); i++) {
        var value = transactions[i];
        var createdDate = value.CreatedDate.toString();
        var isLatest = (createdDate > latestDate);

        if (isLatest) {
            latestDate = createdDate;
            latestTransaction = value;
        }
    }

    return latestTransaction;
}

function getCurrentLocale() {
    const Locale = require('dw/util/Locale');
    var currentLocale = Locale.getLocale(request.locale);

    return currentLocale.language;
}

function getDefaultLocale() {
    const Locale = require('dw/util/Locale');
    var defaultLocale = Site.getCurrent().getDefaultLocale();

    return Locale.getLocale(defaultLocale).language;
}

function getOrderToken(transaction) {
    var orderToken = null;
    var paymentInfos = transaction.PaymentInfos.PaymentInfo;
    for (var pi = 0; pi < paymentInfos.length(); pi++) {
        if (String(paymentInfos[pi].attribute('name')) === 'orderToken') {
            orderToken = paymentInfos[pi].toString();
            break;
        }
    }
 
    return orderToken;
}

function isApp(order){
    var latestPI = getLatestPaymentInstrumentFromOrder(order);
    return latestPI && latestPI.custom.marketPayPlatform.value === 'app';
}

module.exports = {
    getFormattedDataForMarketPaySession: getFormattedDataForMarketPaySession,
    getDataForUpdateSession: getDataForUpdateSession,
    getOnInitiatePaymentURL: getOnInitiatePaymentURL,
    getBasicAuthHeader: getBasicAuthHeader,
    MARKETPAY_IP_ADDRESS_SET: MARKETPAY_IP_ADDRESS_SET,
    getTerminalMapping: getTerminalMapping,
    getMarketPayDataForTerminalName: getMarketPayDataForTerminalName,
    getLatestPaymentInstrumentFromOrder: getLatestPaymentInstrumentFromOrder,
    getLatestPaymentInstrumentFromBasket: getLatestPaymentInstrumentFromBasket,
    isMarketPayProcessor: isMarketPayProcessor,
    isAutoCapture: isAutoCapture,
    getLatestTransaction: getLatestTransaction,
    getCurrentLocale: getCurrentLocale,
    getDefaultLocale: getDefaultLocale, 
    getOrderToken: getOrderToken,
    isApp: isApp
};
