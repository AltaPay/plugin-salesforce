'use strict';
var Logger 	    = require('dw/system/Logger').getLogger('Valitor', 'Valitor');
var Transaction = require('dw/system/Transaction');

/**
 * Log error and sends email to stakeholders about the error
 * @param {Object} res - Response Object
 * @param {Object} error - Oject containing error related information
 * @param {string} error.logErrorMessage - Message written to the error log
 */
exports.handleErrorEvent = function(res, error){
	var URLUtils = require('dw/web/URLUtils');
	
	if(!empty(error.logErrorMessage)) {
		Logger.error(error.logErrorMessage);
	}
	
	//Make redirect back to last checkout step before payment 
	if(error.redirect) {
		try {
			//Assign valitor error values on session object which can be used to show error message to the customer.
			if (!error.cancelledByUser){
				session.custom.valitor_placeOrderError = true;
				session.custom.valitor_customerErrorMessage = error.customerErrorMessage;
			}
	
			res.redirect(URLUtils.https('Checkout-Begin', 'stage', 'payment'));

		} catch (e) {
			Logger.error('Valitor - errorHandler.js - Error when trying to redirect! Error message: ' + e.message);
			res.redirect(URLUtils.https('Cart-Show'));
		}
	}
}

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