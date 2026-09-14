const RESTResponseMgr = require('dw/system/RESTResponseMgr');
const marketPay = require('*/cartridge/scripts/services/marketPay');
const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
const COHelpers = require('*/cartridge/scripts/helpers/marketPayCheckoutHelpers');
const notificationHelpers = require('*/cartridge/scripts/helpers/marketPayNotificationHelpers');
const marketPayRedirectHelpers = require('*/cartridge/scripts/helpers/marketPayRedirectHelpers');
const ipHelpers = require('*/cartridge/scripts/helpers/ipHelpers');
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
        Logger.error('MarketPay - paymentNotification - Unable to parse request body: ' + error.message);
        RESTResponseMgr
            .createError(400, 'Notification-error', 'Invalid payload', 'Request body is not valid JSON.')
            .render();
        return;
    }

    // Ignore new status
    if (notificationData.status === 'new') {
        RESTResponseMgr.createEmptySuccess(200).render();
        return;
    }

    var orderID = notificationData.shop_orderid;

    if (!orderID) {
        RESTResponseMgr
            .createError(400, 'Notification-error', 'Error processing request', 'shop_orderid missing from notification payload.')
            .render();
        return;
    }

    if (!notificationData.xml) {
        Logger.error('MarketPay: Order XML is Null');
        RESTResponseMgr
            .createError(400, 'Notification-error', 'Order XML not found', 'Order XML not found in notification payload.')
            .render();
        return;
    }

    try {
        var orderXMLObject = new XML(notificationData.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error('No transaction found');
        }

        var orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        var order = COHelpers.getOrder(orderID, orderToken);

        if (order == null) {
            RESTResponseMgr
                .createError(400, 'Notification-error', 'Order not found', 'Order not found in the CMS: ' + orderID)
                .render();
            return;
        }

        notificationHelpers.storeWebhookNotification(notificationData);
        RESTResponseMgr.createEmptySuccess(200).render();
    } catch (error) {
        Logger.error('MarketPay - paymentNotification - General error due to exception. Error message: ' + error.message);
        RESTResponseMgr
            .createError(400, 'Notification-error', 'Error processing request', error.message)
            .render();
    }
            
};

exports.paymentNotification.public = true;

/**
 * Receives a payment success callback from MarketPay and finalizes the order.
 */
exports.paymentSuccess = function () {
    var successData;

    try {
        successData = JSON.parse(request.httpParameterMap.requestBodyAsString);
    } catch (error) {
        Logger.error('MarketPay - paymentSuccess - Unable to parse request body: ' + error.message);
        RESTResponseMgr
            .createError(400, 'PaymentSuccess-error', 'Invalid payload', 'Request body is not valid JSON.')
            .render();
        return;
    }

    var orderID = successData.shop_orderid;

    if (!orderID) {
        RESTResponseMgr
            .createError(400, 'PaymentSuccess-error', 'Error processing request', 'shop_orderid missing from payload.')
            .render();
        return;
    }

    if (!successData.xml) {
        Logger.error('MarketPay: Order XML is Null');
        RESTResponseMgr
            .createError(400, 'PaymentSuccess-error', 'Order XML not found', 'Order XML not found in payload.')
            .render();
        return;
    }

    try {
        var orderXMLObject = new XML(successData.xml);
        var transactions = orderXMLObject.Body.Transactions.Transaction;
        var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);

        if (latestTxn == null) {
            throw new Error('No transaction found');
        }

        var orderToken = marketPayDataHelper.getOrderToken(latestTxn);
        var order = COHelpers.getOrder(orderID, orderToken);

        if (order == null) {
            RESTResponseMgr
                .createError(400, 'PaymentSuccess-error', 'Order not found', 'Order not found in the CMS: ' + orderID)
                .render();
            return;
        }

        COHelpers.processOrder(successData.status ? successData.status : '', order, latestTxn, orderXMLObject);

        var redirectUrl = marketPayRedirectHelpers.getSuccessRedirectURL({
            orderID: orderID,
            userLocale: order.custom.marketPayUserLocale,
            isApp: marketPayDataHelper.isApp(order),
            appReturnURL: marketPayDataHelper.getAppReturnURL(order)
        });

        RESTResponseMgr.createSuccess({ redirectUrl: redirectUrl }, 200).render();
    } catch (error) {
        Logger.error('MarketPay - paymentSuccess - General error due to exception. Error message: ' + error.message);
        RESTResponseMgr
            .createError(400, 'PaymentSuccess-error', 'Error processing request', error.message)
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
        Logger.error('MarketPay - paymentFailed - Unable to parse request body: ' + error.message);
        RESTResponseMgr
            .createError(400, 'PaymentFailed-error', 'Invalid payload', 'Request body is not valid JSON.')
            .render();
        return;
    }

    var orderID = failureData.shop_orderid;

    if (!orderID) {
        RESTResponseMgr
            .createError(400, 'PaymentFailed-error', 'Error processing request', 'shop_orderid missing from payload.')
            .render();
        return;
    }

    var order = null;

    try {
        order = COHelpers.getOrder(orderID);

        if (!order) {
            Logger.error('MarketPay - paymentFailed - Order not found. orderID: ' + orderID);
        } else if (order.getStatus().value !== dw.order.Order.ORDER_STATUS_FAILED) {
            Logger.error('MarketPay - paymentFailed - Payment failure callback received. orderID: ' + orderID);
        }
    } catch (error) {
        Logger.error('MarketPay - paymentFailed - General error due to exception. Error message: ' + error.message);
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

