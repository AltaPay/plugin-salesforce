'use strict';

/**
 * @namespace Account
 */

var server = require('server');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
var Status = require('dw/system/Status');
var COHelpers = require('*/cartridge/scripts/helpers/marketPayCheckoutHelpers');
var ipHelpers = require('*/cartridge/scripts/helpers/ipHelpers');

server.post('CallbackForm', server.middleware.https, function (req, res, next) {
    var languageCode = req.form.language;
    var formTemplateClass = req.form.form_template;

    res.render('marketPay/callbackform', {
        languageCode: languageCode,
        title: "Payment Form Title",
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

    try {
        orderID = req.form.shop_orderid;
        orderToken = req.form['transaction_info[orderToken]'];
        var orderXMLObject = new XML(req.form.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        var order = COHelpers.getOrder(orderID, orderToken);

        if (order != null) {
            if ((order.getStatus().value == dw.order.Order.ORDER_STATUS_NEW ||
                order.getStatus().value == dw.order.Order.ORDER_STATUS_OPEN) &&
                order.custom.marketPayTransactionId != latestTxn.TransactionId) {
                // Duplicate transaction — order already processed, release/refund the new payment
                COHelpers.handleDuplicatePayment(latestTxn);
            } else {
                var status = req.form.status;
                var result = orderXMLObject.Body.Result.toString();
                var reservedAmount = parseFloat(orderXMLObject.Body.Transactions.Transaction.ReservedAmount.toString());
                // check order status and the transaction result
                if (status.equals('succeeded') || result.toLowerCase().equals('success') || reservedAmount > 0) {
                    // Payment success request is valid - Handle payment
                    var orderStatus = COHelpers.handlePayments(order, orderXMLObject);
                    if (orderStatus.getStatus() == Status.ERROR) {
                        throw new Error("Unable to handle payment");
                    }
                }
            }

            marketPayRedirectHelpers.onSuccessRedirect(req, res, {
                orderID: orderID,
                userLocale: order.custom.marketPayUserLocale
            });
        } else {
            Logger.error('MarketPay - Payment failed - Order with ID: ' + orderID + ' not found in SFCC!');
            throw new Error('Order with ID: ' + orderID + ' not found in SFCC!');
        }

    } catch (e) {
        Logger.error('MarketPay - Payment failed - General Error due to exception. Error message: ' + e.message);
        marketPayRedirectHelpers.onFailtureRedirect(req, res, {
                orderID: orderID,
                userLocale: order ? order.custom.marketPayUserLocale : marketPayDataHelper.getDefaultLocale() 
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
    const orderToken = req.form['transaction_info[orderToken]'];
    var order = null;

    try {
        var orderXMLObject = new XML(req.form.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);
        
        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

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

    marketPayRedirectHelpers.onFailtureRedirect(req, res, {
                orderID: orderID,
                userLocale: order ? order.custom.marketPayUserLocale : marketPayDataHelper.getDefaultLocale() 
            });

    return next();
});

/**
 * This controller is for asynchronous payments, when the aquier returns an answer for payment request.
 */
server.post('PaymentNotification', server.middleware.https, function (req, res, next) {
    if (ipHelpers.isKnownIPProtectionEnabled() && !ipHelpers.isRequestFromKnownIP(req)) {
        res.setStatusCode(400);
        res.json({ message: 'Invalid callback request' });

        return next();
    }

    const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
    var orderXMLObject = null;
    const orderID = req.form.shop_orderid;
    const orderToken = req.form['transaction_info[orderToken]'];

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

        orderXMLObject = new XML(req.form.xml);

        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);
        
        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        var order = COHelpers.getOrder(orderID, orderToken);

        if (order != null) {
            if ((order.getStatus().value == dw.order.Order.ORDER_STATUS_NEW ||
                order.getStatus().value == dw.order.Order.ORDER_STATUS_OPEN) &&
                order.custom.marketPayTransactionId != latestTxn.TransactionId) {
                // Duplicate transaction — order already processed, release/refund the new payment
                COHelpers.handleDuplicatePayment(latestTxn);
            } else {
                // Payment success request is valid - Handle payment
                var status = req.form.status;
                var result = orderXMLObject.Body.Result.toString();
                var reservedAmount = parseFloat(orderXMLObject.Body.Transactions.Transaction.ReservedAmount.toString());
                // check order status and the transaction result
                if(status.equals('succeeded') || result.toLowerCase() === 'success' || reservedAmount > 0) {                    
                        var orderStatus = COHelpers.handlePayments(order, orderXMLObject);
                        if (orderStatus.getStatus() == Status.ERROR)
                        throw new Error("Unable to handle payment");
                }
            }
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
