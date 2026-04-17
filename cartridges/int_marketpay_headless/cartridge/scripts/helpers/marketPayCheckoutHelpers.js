'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var PaymentTransaction = require('dw/order/PaymentTransaction');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');

/**
 * Get current order
 * @param {string} orderNo - Order no. for requested Order
 * @param {string} orderToken 
 * @returns {dw.order.Order} - Order 
 */
function getOrder(orderNo, orderToken) {
    return OrderMgr.getOrder(orderNo, orderToken);
}

function placeOrder(order, marketPayOrderXML) {
    try {
        const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
        Transaction.begin();
        var placeOrderStatus = OrderMgr.placeOrder(order);

        if (placeOrderStatus.getStatus() === Status.ERROR) {
            Transaction.rollback();
            Logger.error('PlaceOrder failed for orderNo: {0}', order.orderNo);
            return new Status(Status.ERROR);
        }

        var txn = marketPayOrderXML.Body.Transactions.Transaction;

        order.custom.marketPayTransactionId = txn.TransactionId.toString();
        order.custom.marketPayPaymentId = txn.PaymentId.toString();
        order.custom.marketPayReservedAmount = parseFloat(txn.ReservedAmount.toString()) || 0;
        order.custom.marketPayCapturedAmount = parseFloat(txn.CapturedAmount.toString()) || 0;
        order.custom.marketPayRefundedAmount = parseFloat(txn.RefundedAmount.toString()) || 0;
        order.setPaymentStatus(dw.order.Order.PAYMENT_STATUS_PAID);

        var paymentInstrument = marketPayDataHelper.getLatestPaymentInstrumentFromOrder(order);

        paymentInstrument.paymentTransaction.transactionID = txn.TransactionId.toString();
        paymentInstrument.paymentTransaction.type = order.custom.marketPayCapturedAmount == order.totalGrossPrice.value ? PaymentTransaction.TYPE_CAPTURE : PaymentTransaction.TYPE_AUTH;
        paymentInstrument.paymentTransaction.setAmount(new dw.value.Money(order.custom.marketPayReservedAmount, order.getCurrencyCode()));

        Transaction.commit();
    } catch (e) {
        try {
            Transaction.rollback();
        } catch (rollbackErr) {
            // Transaction was already rolled back by SFCC (e.g. ORMOptimisticLockingException)
            Logger.info('Transaction was already rolled back by SFCC: {0} — already rolled back: {1}', order.orderNo, rollbackErr.message);
        }
        return new Status(Status.ERROR);
    }

    return new Status(Status.OK);
}

function handlePayments(order, marketPayOrderXML) {
    try {
        var status;

        // Place order
        // ===============================================================
        if (order.getStatus().value == dw.order.Order.ORDER_STATUS_CREATED) {
            //Order status should change from CREATED to NEW.
            status = placeOrder(order, marketPayOrderXML);
            // Re-read order status — a concurrent request (PaymentSuccess/PaymentNotification race)
            // may have already placed the order, causing an optimistic locking failure here.
            if (status.getStatus() != dw.system.Status.OK &&
                order.getStatus().value == dw.order.Order.ORDER_STATUS_CREATED) {                
                return new Status(Status.ERROR);
            }
        }
        return new Status(Status.OK);
    } catch (e) {

        Logger.error("MarketPay - handlePayment - General error due to exception. Error message: " + e.message);
        return new Status(Status.ERROR);
    }
}

function handleDuplicatePayment(latestTxn) {
    var marketPay = require('*/cartridge/scripts/services/marketPay');

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
            Logger.error('MarketPay - Could not release/refund duplicate reservation for transactionId: ' + transactionId);
        }
    }
}

function processOrder(status, order, latestTxn, orderXMLObject) {
    if ((order.getStatus().value == dw.order.Order.ORDER_STATUS_NEW ||
        order.getStatus().value == dw.order.Order.ORDER_STATUS_OPEN) &&
        order.custom.marketPayTransactionId != latestTxn.TransactionId) {
        // Duplicate transaction — order already processed, release/refund the new payment
        handleDuplicatePayment(latestTxn);
    } else {
        var result = orderXMLObject.Body.Result.toString();
        var reservedAmount = parseFloat(orderXMLObject.Body.Transactions.Transaction.ReservedAmount.toString());
        // check order status and the transaction result
        if ((status && status.toLowerCase() === 'succeeded') || (result && result.toLowerCase() === 'success') || reservedAmount > 0) {
            // Payment success request is valid - Handle payment
            var orderStatus = handlePayments(order, orderXMLObject);
            if (orderStatus.getStatus() == Status.ERROR) {
                throw new Error("Unable to handle payment");
            }
        }
    }
}

module.exports = {
    handleDuplicatePayment: handleDuplicatePayment,
    handlePayments: handlePayments, 
    getOrder: getOrder, 
    placeOrder: placeOrder, 
    processOrder: processOrder
};

