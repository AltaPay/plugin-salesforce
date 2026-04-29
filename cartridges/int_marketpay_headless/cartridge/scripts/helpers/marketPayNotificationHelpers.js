'use strict';

var CustomObjectMgr = require('dw/object/CustomObjectMgr');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');

/**
 * Stores webhook notification parameters in a MarketPayWebhookNotification custom object.
 * transactionID is the key attribute; an existing record is updated if one already exists.
 *
 * @param {Object} form - req.form from the PaymentNotification request
 */
function storeWebhookNotification(form) {
    Transaction.wrap(function () {
        var transactionID = form.transaction_id;
        var notification = CustomObjectMgr.getCustomObject('MarketPayWebhookNotification', transactionID);

        if (notification == null) {
            notification = CustomObjectMgr.createCustomObject('MarketPayWebhookNotification', transactionID);
        }

        notification.custom.shopOrderID = form.shop_orderid;
        notification.custom.currency =  form.currency;
        notification.custom.amount = form.amount ? Number(form.amount) : 0;
        notification.custom.status = form.status;
        notification.custom.webhookData = form.xml;
        notification.custom.processed = false;
        notification.custom.error = false;        
    });
}

/**
 * Returns a SeekableIterator of all MarketPayWebhookNotification custom objects
 * that have not yet been processed (processed = false).
 * Caller is responsible for closing the iterator after use.
 *
 * @returns {dw.util.SeekableIterator} unprocessed webhook notifications
 */
function getUnprocessedNotifications() {
    return CustomObjectMgr.queryCustomObjects(
        'MarketPayWebhookNotification',
        'custom.processed = false',
        null
    );
}

module.exports = {
    storeWebhookNotification: storeWebhookNotification,
    getUnprocessedNotifications: getUnprocessedNotifications
};
