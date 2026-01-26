'use strict';

const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');

function getFormattedDataForMarketPaySession(basket) {

    var Locale = require('dw/util/Locale');
    var currentLocale = Locale.getLocale(request.locale);
    var countryCode = currentLocale.country;

    // Initialize the order data object
    var orderData = {
        order: {
            orderId: basket.custom.marketPayUsedOrderNo,
            amount: {
                value: basket.getTotalGrossPrice().getValue(),
                currency: basket.getCurrencyCode()
            },
            orderLines: [],
            customer: null,
            transactionInfo: {}
        },
        configuration: {
            paymentType: "PAYMENT",
            bodyFormat: "JSON",
            autoCapture: false,
            paymentDisplayType: "REDIRECT",
            // country: countryCode, @todo Get the country from basket or customer profile
            language: Site.getCurrent().getDefaultLocale().split('_')[0] || "en"
        }
    };

    // Format order lines from basket product line items
    var productLineItems = basket.getProductLineItems();
    if (productLineItems && productLineItems.length > 0) {
        for (var i = 0; i < productLineItems.length; i++) {
            var lineItem = productLineItems[i];
            orderData.order.orderLines.push({
                itemId: lineItem.getProductID() || lineItem.getUUID(),
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

    Logger.info("SessionBody: "+ JSON.stringify(orderData));

    return orderData;
}

module.exports = {
    getFormattedDataForMarketPaySession: getFormattedDataForMarketPaySession
};
