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
                // @todo update order attributes

            } else {
                Logger.error("MarketPay - handlePayment - General error due to exception. Error message");
                var failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');
                res.redirect(failedURL + '?orderno=' + args.OrderNo);

                //@todo Recover the basket, so the user can try to checkout again                
                return;
            }
        }

        // Redirect to order confirmation
        // ===============================================================
        var successURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentSuccessURL');
        res.redirect(successURL + '?orderno=' + args.OrderNo);

        return;
    } catch (e) {

        Logger.error("MarketPay - handlePayment - General error due to exception. Error message: " + e.message);

        // @todo Recover the basket, so the user can try to checkout again        

        var failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');
        res.redirect(failedURL + '?orderno=' + args.OrderNo);

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
 * Validate payment success response from Valitor and handle payment
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

            var failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');
            res.redirect(failedURL + '?orderno=' + orderNo);
        }

        return next();

    } catch (e) {
        // @todo Release payment reservation and handle error event 
        // @todo Recover the basket, so the user can try to checkout again

        Logger.error('MarketPay - PaymentSuccess - General Error due to exception. Error message: ' + e.message);

        var failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');
        res.redirect(failedURL + '?orderno=' + orderNo);

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
            // @todo Update order with error information from Valitor
            // @todo If the order is not already failed then fail the order            

            if (order.getStatus() != dw.order.Order.ORDER_STATUS_FAILED) {

                Logger.error('MarketPay - PaymentFailed - General Error due to exception.');

                var failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');
                res.redirect(failedURL + '?orderno=' + orderNo);
            }

            // @todo Handle error event
            // @todo Recover the basket, so the user can try to checkout again            

        } else {
            // Handle error event            

            Logger.error('MarketPay - PaymentFail - Order with ID: ' + orderNo + 'not found in SFCC!');

            var failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');
            res.redirect(failedURL + '?orderno=' + orderNo);
        }

        return next();

    } catch (e) {
        // Fail the order and handle error event    
        Logger.error('MarketPay - PaymentFail - General Error due to exception. Error message: ' + e.message);

        var failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');
        res.redirect(failedURL + '?orderno=' + orderNo);

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
        args = {
            CallbackParams: req.form,
            XMLString: XMLString
        };

    // @todo Find order ID from Valitor request body    

    try {
        var xml_obj = new XML(args.XMLString);
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
        res.setStatusCode(200);
        res.json({ message: 'Acknowledged' });
    }

    return next();
});

module.exports = server.exports();
