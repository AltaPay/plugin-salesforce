'use strict';

/**
 * @namespace Account
 */

var server = require('server');

var COHelpers = require('~/cartridge/scripts/helpers/marketPayCheckoutHelpers');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');

/**
 * Get current order
 * @param {string} orderNo - Order no. for requested Order
 * @returns {dw.order.Order} - Order 
 */
function getOrder(orderNo) {
    var OrderMgr = require('dw/order/OrderMgr');
    return OrderMgr.getOrder(orderNo);
}

/** 
 * Handle successful and open payments.
 * @param {Object} req - request object 
 * @param {Object} res - response object
 * @param {Object} args - Object holding information trough the current request 
 * @param {string} args.OrderNo - Order No of the current order
 * @param {boolean} args.OrderConfirmed - Payment confirmed or not
 */
function onSuccessRedirect(req, res, orderNo) {
    const Site = require('dw/system/Site');

    var userAgent = req.httpHeaders.get('user-agent');
    var isMobile = /android|iphone|ipad|ipod/.test(userAgent);
    var successURL = null;

    if (isMobile)
        successURL = Site.current.getCustomPreferenceValue('marketPayPaymentSuccessAppURL');
    else 
        successURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentSuccessURL');

    res.redirect(successURL + '/' + orderNo);
}

function onFailtureRedirect(req, res, orderNo) {
    const Site = require('dw/system/Site');

    var userAgent = req.httpHeaders.get('user-agent');
    var isMobile = /android|iphone|ipad|ipod/.test(userAgent);
    var failedURL = null;

    if (isMobile)
        failedURL = Site.current.getCustomPreferenceValue('marketPayPaymentFailedAppURL');
    else 
        failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');

    res.redirect(failedURL + '/' + orderNo);
}

function handlePayment(req, res, args) {

    const Site = require('dw/system/Site');

    try {
        var status;

        // Place order
        // ===============================================================
        if (args.Order.getStatus() != dw.order.Order.ORDER_STATUS_NEW) {
            //Order status should change from CREATED to NEW.
            status = COHelpers.placeOrder(args.Order);
            if (status.getStatus() == dw.system.Status.OK) {

                // @todo update payment instruments 
                var Transaction = require('dw/system/Transaction');
                var xml_obj = new XML(args.XMLString);
                var txn = xml_obj.Body.Transactions.Transaction;
                Transaction.wrap(function () {
                    args.Order.custom.marketPayTransactionId = txn.TransactionId.toString();
                    args.Order.custom.marketPayPaymentId = txn.PaymentId.toString();
                    args.Order.custom.marketPayReservedAmount = parseFloat(txn.ReservedAmount.toString());
                    args.Order.custom.marketPayCapturedAmount = parseFloat(txn.CapturedAmount.toString());
                    args.Order.custom.marketPayRefundedAmount = parseFloat(txn.RefundedAmount.toString());
                });

            } else {
                Logger.error("MarketPay - handlePayment - General error due to exception. Error message");
                onFailtureRedirect(req, res, args.OrderNo);

                //@todo Recover the basket, so the user can try to checkout again                
                return;
            }
        }

        // Redirect to order confirmation
        // ===============================================================
        onSuccessRedirect(req, res, args.OrderNo);

        return;
    } catch (e) {

        Logger.error("MarketPay - handlePayment - General error due to exception. Error message: " + e.message);

        onFailtureRedirect(req, res, args.OrderNo);

        return;
    }
}

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
    const Site = require('dw/system/Site');
    var orderNo;
    var args;

    try {
        orderNo = req.form.shop_orderid;

        var status, order = getOrder(orderNo);
        args = {
            Order: order,
            OrderNo: orderNo,
            CallbackParams: req.form,
            XMLString: req.form.xml,
            OrderConfirmed: true
        };

        if (order != null) {

            // @todo Validate MarketPay as referrer                        
            // @todo Make sure that the order is not failed or cancelled before current request
            // @todo and stop the proces if that is the case.         

            // Payment success request is valid - Handle payment
            // =================================================================
            handlePayment(req, res, args);

        } else {
            // @todo Release payment reservation and handle error event                        

            Logger.error('MarketPay - PaymentSuccess - Order with ID: ' + orderNo + 'not found in SFCC!');

            onFailtureRedirect(req, res, orderNo);
        }

        return next();

    } catch (e) {
        // @todo Release payment reservation and handle error event 
        // @todo Recover the basket, so the user can try to checkout again

        Logger.error('MarketPay - PaymentSuccess - General Error due to exception. Error message: ' + e.message);

        onFailtureRedirect(req, res, orderNo);

        return next();
    }
});

/**
 * Controller for failed payments.
 */
server.post('PaymentFail', server.middleware.https, function (req, res, next) {
    const Site = require('dw/system/Site');
    var orderNo;

    try {

        orderNo = req.form.shop_orderid;

        var order = getOrder(orderNo),
            args = {
                Order: order,
                OrderNo: orderNo,
                CallbackParams: req.form,
                XMLString: req.form.xml,
                MerchantErrorMsg: req.form.merchant_error_message,
            },
            status;

        if (order != null) {

            // @todo Validate MarketPay IP as referrer            
            // @todo Update order with error information from MarketPay
            // @todo If the order is not already failed then fail the order            

            if (order.getStatus() != dw.order.Order.ORDER_STATUS_FAILED) {

                Logger.error('MarketPay - PaymentFailed - General Error due to exception.');

                onFailtureRedirect(req, res, orderNo);
            }

            // @todo Handle error event
            // @todo Recover the basket, so the user can try to checkout again            

        } else {
            // Handle error event            

            Logger.error('MarketPay - PaymentFail - Order with ID: ' + orderNo + 'not found in SFCC!');
            onFailtureRedirect(req, res, orderNo);
        }

        return next();

    } catch (e) {
        // Fail the order and handle error event    
        Logger.error('MarketPay - PaymentFail - General Error due to exception. Error message: ' + e.message);

        onFailtureRedirect(req, res, orderNo);

        //@todo Recover the basket, so the user can try to checkout again        
        return next();
    }
});

/**
 * This controller is for asynchronous payments, when the aquier returns an answer for payment request.
 */
server.post('PaymentNotification', server.middleware.https, function (req, res, next) {

    var OrderMgr = require('dw/order/OrderMgr'),
        XMLString = req.form.xml,
        orderId = null,
        xml_obj = null,
        args = {
            CallbackParams: req.form,
            XMLString: XMLString
        };

    // @todo Find order ID from MarketPay request body    

    if (req.form.xml == null) {
        Logger.error("MarketPay: Order XML is Null");
        res.setStatusCode(200);
        res.json({ message: 'Acknowledged' });
    }

    try {
        xml_obj = new XML(args.XMLString);
        orderId = encodeURIComponent(xml_obj.Body.Transactions.Transaction.ShopOrderId);

        if (!orderId) {
            throw new Error('Error processing request');
        }

    } catch (e) {
        Logger.error('MarketPay - findOrder - General error due to exception. Error message: {0}.', e.message);

        res.setStatusCode(400);
        res.json({ message: 'Error processing request' });
        return next();
    }

    var order = OrderMgr.getOrder(orderId);

    if (order == null) {
        res.setStatusCode(400);
        res.json({ message: 'Order not found in the CMS' });
    }
    else {
        var Transaction = require('dw/system/Transaction');
        var txn = xml_obj.Body.Transactions.Transaction;
        Transaction.wrap(function () {
            order.custom.marketPayTransactionId = txn.TransactionId.toString();
            order.custom.marketPayPaymentId = txn.PaymentId.toString();
            order.custom.marketPayReservedAmount = parseFloat(txn.ReservedAmount.toString());
            order.custom.marketPayCapturedAmount = parseFloat(txn.CapturedAmount.toString());
            order.custom.marketPayRefundedAmount = parseFloat(txn.RefundedAmount.toString());
        });
        res.setStatusCode(200);
        res.json({ message: 'Acknowledged' });
    }

    return next();
});

module.exports = server.exports();
