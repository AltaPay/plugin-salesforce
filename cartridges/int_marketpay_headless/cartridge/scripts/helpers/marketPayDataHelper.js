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

function getBasicAuthHeader(clientId, clientSecret) {
    var credentials = clientId + ':' + clientSecret;
    var credentialsBytes = new Bytes(credentials);
    var encodedCredentials = Encoding.toBase64(credentialsBytes);
    return 'Basic ' + encodedCredentials;
}

function getFormattedDataForMarketPaySession(basket) {
    const Locale = require('dw/util/Locale');
    const URLUtils = require('dw/web/URLUtils');
    var currentLocale = Locale.getLocale(request.locale);

    // Initialize the order data object
    var orderData = {
        order: {
            orderId: basket.getUUID(),
            amount: {
                value: basket.getTotalGrossPrice().getValue(),
                currency: basket.currencyCode
            },
            orderLines: [],
            customer: null,
            transactionInfo: {
                ecomPlatform: "Salesforce",
                ecomPluginName: "int_marketpay_headless",
                ecomPluginVersion: "2.0.1"
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
            bodyFormat: "JSON",
            autoCapture: false,
            paymentDisplayType: "REDIRECT",
            country: null,
            language: currentLocale.language || Site.getCurrent().getDefaultLocale()
        }
    };

    // Format order lines from basket product line items
    var productLineItems = basket.getProductLineItems();
    if (productLineItems && productLineItems.length > 0) {
        for (var i = 0; i < productLineItems.length; i++) {
            var lineItem = productLineItems[i];
            orderData.order.orderLines.push({
                itemId: lineItem.getProductID(),
                description: lineItem.getProductName() || '',
                quantity: lineItem.getQuantityValue(),
                unitPrice: lineItem.getAdjustedPrice().getValue()
            });
        }
    }

    // Format customer information with validation
    var customer = basket.getCustomer();
    var billingAddress = basket.getBillingAddress();
    var defaultShipment = basket.getDefaultShipment();
    var shippingAddress = defaultShipment ? defaultShipment.getShippingAddress() : null;
    orderData.configuration.country = shippingAddress && shippingAddress.getCountryCode() ? shippingAddress.getCountryCode().getValue() : '';

    if(!billingAddress) {
        billingAddress = shippingAddress;
    }

    if (customer || billingAddress || shippingAddress) {
        orderData.order.customer = {};

        // Add customer name and email
        if (customer && customer.isRegistered()) {
            var profile = customer.getProfile();
            if (profile) {
                orderData.order.customer.firstName = profile.getFirstName() || '';
                orderData.order.customer.lastName = profile.getLastName() || '';
                orderData.order.customer.email = profile.getEmail() || '';
            }
        }

        // Fallback to billing address for customer info if customer is not registered
        if (!orderData.order.customer.email && billingAddress) {
            orderData.order.customer.firstName = billingAddress.getFirstName() || '';
            orderData.order.customer.lastName = billingAddress.getLastName() || '';
            orderData.order.customer.email = basket.getCustomerEmail() || '';
        }

        // Add billing address if available
        if (billingAddress) {
            orderData.order.customer.billingAddress = {
                street: billingAddress.getAddress1() || '',
                city: billingAddress.getCity() || '',
                country: billingAddress.getCountryCode() ? billingAddress.getCountryCode().getValue() : '',
                zipCode: billingAddress.getPostalCode() || ''
            };
        }

        // Add shipping address if available
        if (shippingAddress) {
            orderData.order.customer.shippingAddress = {
                street: shippingAddress.getAddress1() || '',
                city: shippingAddress.getCity() || '',
                country: shippingAddress.getCountryCode() ? shippingAddress.getCountryCode().getValue() : '',
                zipCode: shippingAddress.getPostalCode() || ''
            };
        }
    }

    return orderData;
}

function getDataForUpdateSession(order) {
    const Locale = require('dw/util/Locale');
    const URLUtils = require('dw/web/URLUtils');
    var currentLocale = Locale.getLocale(request.locale);

    var orderData = {
        order: {
            orderId: order.getOrderNo(),
            amount: {
                value: order.getTotalGrossPrice().getValue(),
                currency: order.currencyCode
            },
            orderLines: [],
            customer: null,
            transactionInfo: {
                ecomPlatform: "Salesforce",
                ecomPluginName: "int_marketpay_headless",
                ecomPluginVersion: "2.0.1"
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
            bodyFormat: "JSON",
            autoCapture: false,
            paymentDisplayType: "REDIRECT",
            country: null,
            language: currentLocale.language || Site.getCurrent().getDefaultLocale()
        }
    };

    // Format order lines from order product line items
    var productLineItems = order.getProductLineItems();
    if (productLineItems && productLineItems.length > 0) {
        for (var i = 0; i < productLineItems.length; i++) {
            var lineItem = productLineItems[i];
            orderData.order.orderLines.push({
                itemId: lineItem.getProductID(),
                description: lineItem.getProductName() || '',
                quantity: lineItem.getQuantityValue(),
                unitPrice: lineItem.getAdjustedPrice().getValue()
            });
        }
    }

    // Format customer information with validation
    var customer = order.getCustomer();
    var billingAddress = order.getBillingAddress();
    var defaultShipment = order.getDefaultShipment();
    var shippingAddress = defaultShipment ? defaultShipment.getShippingAddress() : null;
    orderData.configuration.country = shippingAddress && shippingAddress.getCountryCode() ? shippingAddress.getCountryCode().getValue() : '';

    if (customer || billingAddress || shippingAddress) {
        orderData.order.customer = {};

        if (customer && customer.isRegistered()) {
            var profile = customer.getProfile();
            if (profile) {
                orderData.order.customer.firstName = profile.getFirstName() || '';
                orderData.order.customer.lastName = profile.getLastName() || '';
                orderData.order.customer.email = profile.getEmail() || '';
            }
        }

        if (!orderData.order.customer.email && billingAddress) {
            orderData.order.customer.firstName = billingAddress.getFirstName() || '';
            orderData.order.customer.lastName = billingAddress.getLastName() || '';
            orderData.order.customer.email = order.getCustomerEmail() || '';
        }

        if (billingAddress) {
            orderData.order.customer.billingAddress = {
                street: billingAddress.getAddress1() || '',
                city: billingAddress.getCity() || '',
                country: billingAddress.getCountryCode() ? billingAddress.getCountryCode().getValue() : '',
                zipCode: billingAddress.getPostalCode() || ''
            };
        }

        if (shippingAddress) {
            orderData.order.customer.shippingAddress = {
                street: shippingAddress.getAddress1() || '',
                city: shippingAddress.getCity() || '',
                country: shippingAddress.getCountryCode() ? shippingAddress.getCountryCode().getValue() : '',
                zipCode: shippingAddress.getPostalCode() || ''
            };
        }
    }

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


module.exports = {
    getFormattedDataForMarketPaySession: getFormattedDataForMarketPaySession,
    getDataForUpdateSession: getDataForUpdateSession, 
    getOnInitiatePaymentURL: getOnInitiatePaymentURL,
    getBasicAuthHeader: getBasicAuthHeader
};
