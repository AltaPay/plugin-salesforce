'use strict';

/**
 * @namespace Account
 */

var server = require('server');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var PaymentTransaction = require('dw/order/PaymentTransaction');

/**
 * Get current order
 * @param {string} orderNo - Order no. for requested Order
 * @returns {dw.order.Order} - Order 
 */
function getOrder(orderNo) {
    var OrderMgr = require('dw/order/OrderMgr');
    return OrderMgr.getOrder(orderNo);
}

function placeOrder(args) {
    try {
        const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
        Transaction.begin();
        var placeOrderStatus = OrderMgr.placeOrder(args.Order);

        if (placeOrderStatus === Status.ERROR) {
            Transaction.rollback();
            Logger.error('PlaceOrder failed for orderNo: {0}', args.Order.orderNo);
            return new Status(Status.ERROR);
        }

        var xml_obj = new XML(args.XMLString);
        var txn = xml_obj.Body.Transactions.Transaction;

        args.Order.custom.marketPayTransactionId = txn.TransactionId.toString();
        args.Order.custom.marketPayPaymentId = txn.PaymentId.toString();
        args.Order.custom.marketPayReservedAmount = parseFloat(txn.ReservedAmount.toString()) || 0;
        args.Order.custom.marketPayCapturedAmount = parseFloat(txn.CapturedAmount.toString()) || 0;;
        args.Order.custom.marketPayRefundedAmount = parseFloat(txn.RefundedAmount.toString()) || 0;

        var paymentInstrument = marketPayDataHelper.getLatestPaymentInstrument(args.Order);

        paymentInstrument.paymentTransaction.transactionID = txn.TransactionId.toString();
        paymentInstrument.paymentTransaction.type = args.Order.custom.marketPayCapturedAmount == args.Order.totalGrossPrice.value ? PaymentTransaction.TYPE_CAPTURE : PaymentTransaction.TYPE_AUTH;

        Transaction.commit();
    } catch (e) {
        try {
            Transaction.rollback();
        } catch (rollbackErr) {
            // Transaction was already rolled back by SFCC (e.g. ORMOptimisticLockingException)
            Logger.warn('PlaceOrder rollback skipped for orderNo: {0} — already rolled back: {1}', args.Order.orderNo, rollbackErr.message);
        }
        return new Status(Status.ERROR);
    }

    return new Status(Status.OK);
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

function handlePayment(req, res, args, isJSONResponse) {
    try {
        var status;

        // Place order
        // ===============================================================
        if (args.Order.getStatus().value == dw.order.Order.ORDER_STATUS_CREATED) {
            //Order status should change from CREATED to NEW.
            status = placeOrder(args);
            // Re-read order status — a concurrent request (PaymentSuccess/PaymentNotification race)
            // may have already placed the order, causing an optimistic locking failure here.
            if (status.getStatus() != dw.system.Status.OK &&
                args.Order.getStatus().value == dw.order.Order.ORDER_STATUS_CREATED) {
                onFailtureRedirect(req, res, args.OrderNo);
                return;
            }
        }

        // Redirect to order confirmation
        // ===============================================================
        if (isJSONResponse) {
            res.setStatusCode(200);
            res.json({ message: 'Acknowledged' });
        }
        else {
            onSuccessRedirect(req, res, args.OrderNo);
        }

        return;
    } catch (e) {

        Logger.error("MarketPay - handlePayment - General error due to exception. Error message: " + e.message);

        if (isJSONResponse) {
            res.setStatusCode(400);
            res.json({ message: "MarketPay - handlePayment - General error due to exception. Error message: " + e.message });
        }
        else {
            onFailtureRedirect(req, res, args.OrderNo);
        }

        return;
    }
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

function handleDuplicatePayment(req, res, args, isJSONResponse) {

    var marketPay = require('*/cartridge/scripts/services/marketPay');
    var latestTxn = args.LatestTnx;

    if (latestTxn != null) {
        var transactionStatus = latestTxn.TransactionStatus.toString();
        var transactionId = latestTxn.TransactionId.toString();
        var released;
        if (transactionStatus === 'captured' || transactionStatus === 'bank_payment_finalized') {
            released = marketPay.refundCapturedReservation(transactionId);
        } else {
            released = marketPay.releaseReservation(transactionId);
        }
        if (!released) {
            Logger.error('MarketPay - PaymentSuccess - Could not release/refund duplicate reservation for transactionId: ' + transactionId);
        }
    }

    if (isJSONResponse) {
        res.setStatusCode(200);
        res.json({ message: 'Acknowledged' });
    }
    else {
        onSuccessRedirect(req, res, args.OrderNo);
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
            OrderConfirmed: true,
            LatestTnx: null
        };

        var xml_obj = new XML(args.XMLString);
        var transactions = xml_obj.Body.Transactions.Transaction;
        var latestTxn = getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        args.LatestTnx = latestTxn;

        if (order != null) {

            if ((order.getStatus().value == dw.order.Order.ORDER_STATUS_NEW ||
                order.getStatus().value == dw.order.Order.ORDER_STATUS_OPEN) &&
                order.custom.marketPayTransactionId != latestTxn.TransactionId) {

                // Duplicate transaction — order already processed, release/refund the new payment
                handleDuplicatePayment(req, res, args, false);
            }
            else {
                // Payment success request is valid - Handle payment
                handlePayment(req, res, args, false);
            }

        } else {
            Logger.error('MarketPay - PaymentSuccess - Order with ID: ' + orderNo + 'not found in SFCC!');
            onFailtureRedirect(req, res, orderNo);
        }

        return next();

    } catch (e) {

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

            if (order.getStatus().value != dw.order.Order.ORDER_STATUS_FAILED) {

                Logger.error('MarketPay - PaymentFailed - General Error due to exception.');
                onFailtureRedirect(req, res, orderNo);
            }

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
            XMLString: XMLString,
            Order: null,
            LatestTnx: null
        };

    if (req.form.xml == null) {
        Logger.error("MarketPay: Order XML is Null");
        res.setStatusCode(400);
        res.json({ message: 'Order XML not found'});
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
        var transactions = xml_obj.Body.Transactions.Transaction;
        var latestTxn = getLatestTransaction(transactions);

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
                handleDuplicatePayment(req, res, args, true);
            } else {
                // Payment success request is valid - Handle payment
                handlePayment(req, res, args, true);
            }
        } else {
            Logger.error('MarketPay - PaymentSuccess - Order with ID: ' + orderId + 'not found in SFCC!');
            
            res.setStatusCode(400);
            res.json({ message: 'Order with ID: ' + orderId + 'not found in SFCC!'});
        }
    }

    return next();
});

module.exports = server.exports();
