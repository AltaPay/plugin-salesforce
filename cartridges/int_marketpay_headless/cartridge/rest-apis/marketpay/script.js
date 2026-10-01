const RESTResponseMgr = require('dw/system/RESTResponseMgr');
const marketPay = require('*/cartridge/scripts/services/marketPay');
const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
const COHelpers = require('*/cartridge/scripts/helpers/marketPayCheckoutHelpers');
const notificationHelpers = require('*/cartridge/scripts/helpers/marketPayNotificationHelpers');
const marketPayRedirectHelpers = require('*/cartridge/scripts/helpers/marketPayRedirectHelpers');
const Logger = require('dw/system/Logger').getLogger('MarketPay','MarketPay');

exports.createCheckoutSession = function () {
    try {
        var customerId = request.httpParameterMap.c_customerId.stringValue;
        var requestData = JSON.parse(request.httpParameterMap.requestBodyAsString);
        var result = marketPay.getTokenAndSessionId(requestData);
        var paymentMethods = marketPay.getPaymentMethods(result.token, result.sessionId);

        if(!paymentMethods || paymentMethods.methods.length == 0) {
            throw new Error("MarketPay Didn't return payment methods");
        }

        const Transaction = require('dw/system/Transaction');
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');

        Transaction.wrap(function () {
            var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', customerId);
            if (!marketPayDataObj) {
                marketPayDataObj = CustomObjectMgr.createCustomObject('MarketPayData', customerId);
            }
            marketPayDataObj.custom.sessionID = result.sessionId;
            marketPayDataObj.custom.customerID = customerId;
            marketPayDataObj.custom.token = result.token;
            marketPayDataObj.custom.paymentMethods = JSON.stringify(paymentMethods);
        });        
        
        RESTResponseMgr
            .createEmptySuccess(200)
            .render();
    } catch (error) {
        Logger.error('Error creating session ' + error.message);
        RESTResponseMgr
            .createError(404, 'Session-error', 'Not created', 'please reach out the SFCC developers.')
            .render();
    }
};

exports.createCheckoutSession.public = true;

exports.paymentStatus = function () {
    var orderId = request.httpParameterMap.c_orderId.stringValue;
    try {
        var marketPayOrderTransaction = marketPay.getPaymentDetail(orderId);

        if (marketPayOrderTransaction.Body.Transactions.Transaction.length() === 0) {
            RESTResponseMgr
                .createError(404, 'Payment-not-found', 'No transaction found for order', orderId)
                .render();
            return;
        }

        var txn = marketPayDataHelper.getLatestTransaction(marketPayOrderTransaction.Body.Transactions.Transaction);
        var transactionId = txn.TransactionId.toString();
        var paymentId = txn.PaymentId.toString();
        var reservedAmount = parseFloat(txn.ReservedAmount.toString());
        var capturedAmount = parseFloat(txn.CapturedAmount.toString());
        var refundedAmount = parseFloat(txn.RefundedAmount.toString());

        var OrderMgr = require('dw/order/OrderMgr');
        var Transaction = require('dw/system/Transaction');

        var order = OrderMgr.getOrder(orderId);
        if (order == null) {
            throw new Error('Order ' + orderId + ' not found');
        }

        Transaction.wrap(function () {
            order.custom.marketPayTransactionId = transactionId;
            order.custom.marketPayPaymentId = paymentId;
            order.custom.marketPayReservedAmount = reservedAmount;
            order.custom.marketPayCapturedAmount = capturedAmount;
            order.custom.marketPayRefundedAmount = refundedAmount;
        });
        RESTResponseMgr.createEmptySuccess(200).render();

    } catch (error) {
        Logger.error('Error retrieving payment status: ' + error.message);
        RESTResponseMgr
            .createError(404, 'Status-error', 'Not retrieved', error.message)
            .render();
    }
};

exports.paymentStatus.public = true;

/**
 * Receives asynchronous payment notifications from MarketPay.
 */
exports.paymentNotification = function () {
    var notificationData;

    try {
        notificationData = JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (error) {
        RESTResponseMgr
            .createError(400, 'Notification-error', 'Invalid request.', 'Invalid request.')
            .render();
        return;
    }

    // Ignore new status
    if (notificationData.status === 'new') {
        RESTResponseMgr.createSuccess({ message: 'Acknowledged' }, 200).render();
        return;
    }

    var orderID = notificationData.shop_orderid;

    if (notificationData.xml == null) {
        Logger.error("MarketPay: Order XML is Null");
        RESTResponseMgr
            .createError(400, 'Notification-error', 'Order XML not found', 'Order XML not found')
            .render();
        return;
    }

    try {
        if (!orderID) {
            throw new Error('Error processing request');
        }
        var orderXMLObject = new XML(notificationData.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error("No transaction found");
        }

        var orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        var order = COHelpers.getOrder(orderID, orderToken);

        if (order != null) {
            notificationHelpers.storeWebhookNotification(notificationData);
            RESTResponseMgr.createSuccess({ message: 'Acknowledged' }, 200).render();
        } else {
            RESTResponseMgr
                .createError(400, 'Notification-error', 'Order not found in the CMS', 'Order not found in the CMS')
                .render();
        }
    } catch (error) {
        Logger.error('MarketPay - findOrder - General error due to exception. Error message: {0}.', error.message);
        RESTResponseMgr
            .createError(400, 'Notification-error', 'Error processing request', 'Error processing request')
            .render();
    }
};

exports.paymentNotification.public = true;

/**
 * Receives a payment success callback from MarketPay and finalizes the order.
 */
exports.paymentSuccess = function () {
    var successData;
    var orderID;
    var order = null;

    try {
        successData = JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (error) {
        RESTResponseMgr
            .createError(400, 'PaymentSuccess-error', 'Invalid request.', 'Invalid request.')
            .render();
        return;
    }

    try {
        orderID = successData.shop_orderid;
        var orderXMLObject = new XML(successData.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error('No transaction found');
        }

        var orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        order = COHelpers.getOrder(orderID, orderToken);

        if (order != null) {
            COHelpers.processOrder(successData.status ? successData.status : '', order, latestTxn, orderXMLObject);

            var redirectUrl = marketPayRedirectHelpers.getSuccessRedirectURL({
                orderID: orderID,
                userLocale: order.custom.marketPayUserLocale,
                isApp: marketPayDataHelper.isApp(order),
                appReturnURL: marketPayDataHelper.getAppReturnURL(order)
            });

            RESTResponseMgr.createSuccess({ redirectUrl: redirectUrl }, 200).render();
        } else {
            Logger.error('MarketPay - Payment failed - Order with ID: ' + orderID + ' not found in SFCC!');
            throw new Error('Order with ID: ' + orderID + ' not found in SFCC!');
        }
    } catch (error) {
        Logger.error('MarketPay - Payment failed - General Error due to exception. Error message: ' + error.message);
        RESTResponseMgr
            .createError(400, 'PaymentSuccess-error', 'Error processing request', 'Error processing request')
            .render();
    }
};

exports.paymentSuccess.public = true;

/**
 * Receives a payment failure callback from MarketPay for a placed order.
 */
exports.paymentFailed = function () {
    var failureData;

    try {
        failureData = JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (error) {
        RESTResponseMgr
            .createError(400, 'PaymentFailed-error', 'Invalid request.', 'Invalid request.')
            .render();
        return;
    }

    var orderID = failureData.shop_orderid;
    var order = null;

    try {
        var orderXMLObject = new XML(failureData.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error('No transaction found');
        }

        var orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        order = COHelpers.getOrder(orderID, orderToken);

        if (!order) {
            Logger.error('MarketPay - PaymentFail - Order not found. orderID: ' + orderID);
        } else if (order.getStatus().value !== dw.order.Order.ORDER_STATUS_FAILED) {
            Logger.error('MarketPay - PaymentFail - Payment failure callback received. orderID: ' + orderID);
        }
    } catch (error) {
        Logger.error('MarketPay - PaymentFail - General Error due to exception. Error message: ' + error.message);
    }

    var redirectUrl = marketPayRedirectHelpers.getFailureRedirectURL({
        orderID: orderID,
        userLocale: order ? order.custom.marketPayUserLocale : marketPayDataHelper.getDefaultLocale(),
        isApp: marketPayDataHelper.isApp(order),
        appReturnURL: marketPayDataHelper.getAppReturnURL(order)
    });

    RESTResponseMgr.createSuccess({ redirectUrl: redirectUrl }, 200).render();
};

exports.paymentFailed.public = true;

