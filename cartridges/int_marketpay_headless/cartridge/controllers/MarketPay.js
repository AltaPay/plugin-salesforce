'use strict';

/**
 * @namespace Account
 */

var server = require('server');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
var COHelpers = require('*/cartridge/scripts/helpers/marketPayCheckoutHelpers');
var ipHelpers = require('*/cartridge/scripts/helpers/ipHelpers');
var notificationHelpers = require('*/cartridge/scripts/helpers/marketPayNotificationHelpers');

server.post('CallbackForm', server.middleware.https, function (req, res, next) {
    var languageCode = req.form.language;
    var formTemplateClass = req.form.form_template;

    res.render('marketPay/callbackform', {
        languageCode: languageCode,
        title: "Payment",
        formTemplateClass: formTemplateClass
    });

    return next();
});

/**
 * Validate payment success response from MarketPay and handle payment
 */
server.post('PaymentSuccess', server.middleware.https, function (req, res, next) {
    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
    const marketPayRedirectHelpers = require('*/cartridge/scripts/helpers/marketPayRedirectHelpers');
    var orderID;
    var orderToken;
    var order = null;

    try {
        orderID = req.form.shop_orderid;
        var orderXMLObject = new XML(req.form.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        order = COHelpers.getOrder(orderID, orderToken);

        if (order != null) {
            COHelpers.processOrder(req.form.status ? req.form.status : '', order, latestTxn, orderXMLObject);

            marketPayRedirectHelpers.onSuccessRedirect(req, res, {
                orderID: orderID,
                userLocale: order.custom.marketPayUserLocale,
                isApp: marketPayDataHelper.isApp(order)
            });
        } else {
            Logger.error('MarketPay - Payment failed - Order with ID: ' + orderID + ' not found in SFCC!');
            throw new Error('Order with ID: ' + orderID + ' not found in SFCC!');
        }

    } catch (e) {
        Logger.error('MarketPay - Payment failed - General Error due to exception. Error message: ' + e.message);
        marketPayRedirectHelpers.onFailureRedirect(req, res, {
            orderID: orderID,
            userLocale: order ? order.custom.marketPayUserLocale : marketPayDataHelper.getDefaultLocale(),
            isApp: marketPayDataHelper.isApp(order)
        });
    }

    return next();
});

/**
 * Controller for failed payments.
 */
server.post('PaymentFail', server.middleware.https, function (req, res, next) {
    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
    const marketPayRedirectHelpers = require('*/cartridge/scripts/helpers/marketPayRedirectHelpers');
    const orderID = req.form.shop_orderid;
    var order = null;

    try {
        var orderXMLObject = new XML(req.form.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        const orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        order = COHelpers.getOrder(orderID, orderToken);
        if (!order) {
            Logger.error('MarketPay - PaymentFail - Order not found. orderID: ' + orderID);
        } else if (order.getStatus().value !== dw.order.Order.ORDER_STATUS_FAILED) {
            Logger.error('MarketPay - PaymentFail - Payment failure callback received. orderID: ' + orderID);
        }

    } catch (e) {
        // Fail the order and handle error event    
        Logger.error('MarketPay - PaymentFail - General Error due to exception. Error message: ' + e.message);
    }

    marketPayRedirectHelpers.onFailureRedirect(req, res, {
        orderID: orderID,
        userLocale: order ? order.custom.marketPayUserLocale : marketPayDataHelper.getDefaultLocale(),
        isApp: marketPayDataHelper.isApp(order)
    });

    return next();
});

/**
 * This controller is for asynchronous payments, when the acquirer returns an answer for payment request.
 */
server.post('PaymentNotification', server.middleware.https, function (req, res, next) {
    // Ignore new status
    if (req.form.status === 'new') {
        res.setStatusCode(200);
        res.json({ message: 'Acknowledged' });

        return next();
    }

    if (ipHelpers.isKnownIPProtectionEnabled() && !ipHelpers.isRequestFromKnownIP(req)) {
        res.setStatusCode(400);
        res.json({ message: 'Invalid callback request' });

        return next();
    }

    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
    const orderID = req.form.shop_orderid;

    if (req.form.xml == null) {
        Logger.error("MarketPay: Order XML is Null");
        res.setStatusCode(400);
        res.json({ message: 'Order XML not found' });
        return next();
    }

    try {
        if (!orderID) {
            throw new Error('Error processing request');
        }

        var orderXMLObject = new XML(req.form.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        const orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        var order = COHelpers.getOrder(orderID, orderToken);

        if (order != null) {
            notificationHelpers.storeWebhookNotification(req.form);
            res.setStatusCode(200);
            res.json({ message: 'Acknowledged' });
        } else {
            res.setStatusCode(400);
            res.json({ message: 'Order not found in the CMS' });
        }

    } catch (e) {
        Logger.error('MarketPay - findOrder - General error due to exception. Error message: {0}.', e.message);

        res.setStatusCode(400);
        res.json({ message: 'Error processing request' });
        return next();
    }

    return next();
});

module.exports = server.exports();
