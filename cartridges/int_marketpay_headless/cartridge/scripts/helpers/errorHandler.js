'use strict';
var Logger 	    = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
var Transaction = require('dw/system/Transaction');

/**
 * Fail current order
 * @param {Object} order - current order that must be failed 
 */
exports.failOrder = function(order) {
	var OrderMgr = require('dw/order/OrderMgr');
	try {
		if(order) {
			Transaction.wrap(function() {
				OrderMgr.failOrder(order);
			})
		}
	} catch (e) {
		Logger.error('Valitor - errorHandler.js - Error when trying to fail order! Error message: ' + e.message);
	}
}

/**
 * Release payment reservation for current transaction
 * @param {Object} args - arguments used to process current request
 */
exports.releasePaymentReservation = function(args) {
	var API = require('~/cartridge/scripts/valitor/api/valitorAPI.js');
	try {
		var xml_obj = new XML(args.XMLString),
			transactionID = encodeURIComponent(xml_obj.Body.Transactions.Transaction.TransactionId),
			result = API.releaseReservation(transactionID);

		if(result.error) {
			Logger.error('Valitor - Error Handler - Error releasing the payment reservation for transaction: ' + transactionID);
		} else {
			if(args.Order != null) {
				Transaction.wrap (function () {
					args.Order.addNote('Payment Reservation Released', '');
				});
			}
		}
	} catch (e) {
		Logger.error('Valitor - Error Handler - Error releasing the payment reservation for transaction: ' + transactionID + '. Error Message: ' + e.message);
	}
}