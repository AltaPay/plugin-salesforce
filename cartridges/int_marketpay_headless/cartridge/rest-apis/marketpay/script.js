const RESTResponseMgr = require('dw/system/RESTResponseMgr');
const marketPay = require('*/cartridge/scripts/services/marketPay')
const Logger = require('dw/system/Logger').getLogger('MarketPay','MarketPay');
const SCAPIService = require('*/cartridge/scripts/services/scapiService');

exports.createCheckoutSession = function () {
    var customerId = request.httpParameterMap.c_customerId;
    var customerIdValue = customerId.stringValue;

    try {
        var requestBody = request.httpParameterMap.requestBodyAsString;
        var requestData = JSON.parse(requestBody);
        var result = marketPay.getTokenAndSessionId(requestData);
        var paymentMethods = marketPay.getPaymentMethods(result.token, result.sessionId);

        if(!paymentMethods || paymentMethods.methods.length == 0) {
            throw new Error("MarketPay Didn't return payment methods");
        }

        const Transaction = require('dw/system/Transaction');
        var CustomObjectMgr = require('dw/object/CustomObjectMgr');

        Transaction.wrap(function () {
            var marketPayDataObj = CustomObjectMgr.getCustomObject('MarketPayData', customerIdValue);
            if (!marketPayDataObj) {
                marketPayDataObj = CustomObjectMgr.createCustomObject('MarketPayData', customerIdValue);
            }
            marketPayDataObj.custom.sessionID = result.sessionId;
            marketPayDataObj.custom.customerID = customerIdValue;
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
        var marketPayOrderTransaction = marketPay.getPaymentStatus(orderId);

        if (marketPayOrderTransaction.Body.Transactions.Transaction.length() === 0) {
            RESTResponseMgr
                .createError(404, 'Payment-not-found', 'No transaction found for order', orderId)
                .render();
            return;
        }

        var txn = marketPayOrderTransaction.Body.Transactions.Transaction;
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

