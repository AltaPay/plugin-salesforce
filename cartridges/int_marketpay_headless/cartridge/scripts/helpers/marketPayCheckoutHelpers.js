'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var PaymentTransaction = require('dw/order/PaymentTransaction');
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

        var paymentInstrument = marketPayDataHelper.getLatestPaymentInstrumentFromOrder(args.Order);

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

function handlePayments(args) {
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
                return new Status(Status.ERROR);
            }
        }

        return new Status(Status.OK);

    } catch (e) {

        Logger.error("MarketPay - handlePayment - General error due to exception. Error message: " + e.message);
        return new Status(Status.ERROR);
    }
}

function handleDuplicatePayment(args) {

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
            Logger.error('MarketPay - Could not release/refund duplicate reservation for transactionId: ' + transactionId);
        }
    }
}


module.exports = {
    handleDuplicatePayment: handleDuplicatePayment,
    handlePayments: handlePayments, 
    getOrder: getOrder, 
    placeOrder: placeOrder
};

