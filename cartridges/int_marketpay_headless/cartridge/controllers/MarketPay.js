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
    var amount = req.form.amount;
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
    var orderNo;
    var args;

    try {
        orderNo = req.form.shop_orderid;

        var status, order = COHelpers.getOrder(orderNo);
        args = {
            Order: order,
            OrderNo: orderNo,
            CallbackParams: req.form,
            XMLString: req.form.xml,
            OrderConfirmed: true,
            LatestTnx: null
        };

        var xml_obj = new XML(args.XMLString);
        var transactions = xml_obj.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        args.LatestTnx = latestTxn;

        if (order != null) {
            if ((order.getStatus().value == dw.order.Order.ORDER_STATUS_NEW ||
                order.getStatus().value == dw.order.Order.ORDER_STATUS_OPEN) &&
                order.custom.marketPayTransactionId != latestTxn.TransactionId) {
                // Duplicate transaction — order already processed, release/refund the new payment
                COHelpers.handleDuplicatePayment(args);
            } else {
                // Payment success request is valid - Handle payment
                var status = COHelpers.handlePayments(args);
                if (status.getStatus() == Status.ERROR) {
                    throw new Error("Unable to handle payment");
                }
            }

            marketPayRedirectHelpers.onSuccessRedirect(req, res, {
                OrderNo: orderNo,
                UserLocale: order.custom.marketPayUserLocale
            });
        } else {
            Logger.error('MarketPay - Payment failed - Order with ID: ' + orderNo + ' not found in SFCC!');
            throw new Error('Order with ID: ' + orderNo + ' not found in SFCC!');
        }

    } catch (e) {
        Logger.error('MarketPay - Payment failed - General Error due to exception. Error message: ' + e.message);
        marketPayRedirectHelpers.onFailtureRedirect(req, res, {
                OrderNo: orderNo,
                UserLocale: order ? order.custom.marketPayUserLocale : marketPayDataHelper.getDefaultLocale() 
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
    const orderNo = req.form.shop_orderid;
    var order = null;

    try {
        order = COHelpers.getOrder(orderNo);
        if (!order) {
            Logger.error('MarketPay - PaymentFail - Order not found. OrderNo: ' + orderNo);
        } else if (order.getStatus().value !== dw.order.Order.ORDER_STATUS_FAILED) {
            Logger.error('MarketPay - PaymentFail - Payment failure callback received. OrderNo: ' + orderNo);
        }

        return next();

    } catch (e) {
        // Fail the order and handle error event    
        Logger.error('MarketPay - PaymentFail - General Error due to exception. Error message: ' + e.message);
    }

    marketPayRedirectHelpers.onFailtureRedirect(req, res, {
        OrderNo: orderNo,
        UserLocale: order ? order.custom.marketPayUserLocale : marketPayDataHelper.getDefaultLocale()
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
    var XMLString = req.form.xml,
        orderId = null,
        xml_obj = null,
        args = {
            CallbackParams: req.form,
            XMLString: XMLString,
            Order: null,
            LatestTnx: null
        };

    if (req.form.xml == null) {
        Logger.error("MarketPay: Order XML is Null");
        res.setStatusCode(400);
        res.json({ message: 'Order XML not found' });
        return next();
    }

    try {
        xml_obj = new XML(args.XMLString);
        orderId = encodeURIComponent(xml_obj.Body.Transactions.Transaction.ShopOrderId);

        if (!orderId) {
            throw new Error('Error processing request');
        }

        var order = COHelpers.getOrder(orderId);

        if (order == null) {
            res.setStatusCode(400);
            res.json({ message: 'Order not found in the CMS' });
        } else {
            var transactions = xml_obj.Body.Transactions.Transaction;
            var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

            if (latestTxn == null) {
                throw new Error("No transaction found");
            }

            args.LatestTnx = latestTxn;
            args.Order = order;

            if (order != null) {
                if ((order.getStatus().value == dw.order.Order.ORDER_STATUS_NEW ||
                    order.getStatus().value == dw.order.Order.ORDER_STATUS_OPEN) &&
                    order.custom.marketPayTransactionId != latestTxn.TransactionId) {
                    // Duplicate transaction — order already processed, release/refund the new payment
                    COHelpers.handleDuplicatePayment(args);
                } else {
                    // Payment success request is valid - Handle payment
                    var status = COHelpers.handlePayments(args);
                    if (status.getStatus() == Status.ERROR)
                        throw new Error("Unable to handle payment");

                }
                res.setStatusCode(200);
                res.json({ message: 'Acknowledged' });

            } else {
                Logger.error('MarketPay - PaymentSuccess - Order with ID: ' + orderId + 'not found in SFCC!');
                throw new Error('Order with ID: ' + orderId + 'not found in SFCC!');
            }
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
