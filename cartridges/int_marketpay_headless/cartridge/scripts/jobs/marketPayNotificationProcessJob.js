'use strict';

var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
var Transaction = require('dw/system/Transaction');
var Status = require('dw/system/Status');
var COHelpers = require('*/cartridge/scripts/helpers/marketPayCheckoutHelpers');
var marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
var notificationHelpers = require('*/cartridge/scripts/helpers/marketPayNotificationHelpers');

/**
 * Marks a notification's processed flag within its own transaction.
 *
 * @param {dw.object.CustomObject} notification
 * @param {boolean} value
 */
function setProcessed(notification, value, error, errorMessage) {
    Transaction.wrap(function () {
        notification.custom.processed = value;
        if(error) {        
            notification.custom.error = true; 
            notification.custom.errorMessage = errorMessage;
        }
    });
}

/**
 * Job step: processes all unprocessed MarketPayWebhookNotification custom objects.
 * For each notification, retrieves the corresponding order and processes the payment.
 * Sets processed = true on success, false if the order is not found or an error occurs.
 *
 * @returns {dw.system.Status}
 */
function execute() {
    var notifications = notificationHelpers.getUnprocessedNotifications();
    var hasFailure = false;

    try {
        while (notifications.hasNext()) {
            var notification = notifications.next();
            var orderID = notification.custom.shopOrderID;
            var orderStatus = notification.custom.status;

            try {
                var orderXMLObject = new XML(notification.custom.webhookData);
                var transactions = orderXMLObject.Body.Transactions.Transaction;
                var latestTxn = marketPayDataHelper.getLatestTransaction(transactions);
                var orderToken = marketPayDataHelper.getOrderToken(latestTxn);

                var order = COHelpers.getOrder(orderID, orderToken);

                if (order != null) {
                    COHelpers.processOrder(orderStatus, order, latestTxn, orderXMLObject);
                    setProcessed(notification, true, false, null);
                } else {
                    Logger.warn('MarketPay - marketPayNotificationProcessJob - Order not found for orderID: {0}', orderID);
                    setProcessed(notification, false, true, 'Order not found for orderID: ' + orderID);
                    hasFailure = true;
                }
            } catch (e) {
                Logger.error('MarketPay - marketPayNotificationProcessJob - Error processing notification for orderID: {0}. Error: {1}', orderID, e.message);
                setProcessed(notification, false, true, 'Error processing notification for orderID: ' + orderID + '. Error: ' + e.message);
                hasFailure = true;
            }
        }
    } finally {
        notifications.close();
    }

    return hasFailure ? new Status(Status.ERROR) : new Status(Status.OK);
}

module.exports = {
    execute: execute
};
