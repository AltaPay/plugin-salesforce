'use strict';
var Logger 	= require('dw/system/Logger').getLogger('Valitor', 'Valitor');
var Status 	= require('dw/system/Status');

/**
 * Validate that order is not failed and cancelled when receiving request from Valitor.
 * @param {Object} args - XMLString - request data from Valitor
 * @returns {dw.system.Status} - OK or ERROR 
 */
exports.validateOrderIsNotFailedOrCancelled = function(args) {
	if(args.Order.status == dw.order.Order.ORDER_STATUS_FAILED || args.Order.status == dw.order.Order.ORDER_STATUS_CANCELLED) {
		return new Status(Status.ERROR);
	}   
	return new Status(Status.OK);
}


/**
 * Verify that the IP of the request originates from Valitor.
 * @param {Object} args - Args Object holding all information trough the current request 
 * @param {string} args.XMLString - XML from Valitor
 * @returns {dw.system.Status} - OK or ERROR 
 */
exports.validateValitorAsReferrer = function(args) {
	Logger.debug('Validate Valitor as referrer.');
	var Site = require('dw/system/Site');
	try {
		var WHITELISTED_VALITOR_REFERRER_IPs = Site.getCurrent().getCustomPreferenceValue('valitorWhiteListedIP');
		if(WHITELISTED_VALITOR_REFERRER_IPs.length < 1){
			Logger.error('Valitor - validator.js - Valitor white listed IP\'s not provided'); 
			return new Status(Status.ERROR);
		}
		
		if(args.orderToken == null) {
			args.orderToken = !empty(args.CallbackParams['transaction_info[demandware_order_token]']) ? args.CallbackParams['transaction_info[demandware_order_token]'] : '';
		}
		
		if(args.XMLString != null && !empty(args.XMLString)) {
			var xml_obj = new XML(args.XMLString);
			for(var index in xml_obj.Body.Transactions.Transaction.PaymentInfos.PaymentInfo) {
				var paymentInfo = xml_obj.Body.Transactions.Transaction.PaymentInfos.PaymentInfo[index];
				if(paymentInfo["@name"] == 'demandware_order_token') {
					args.orderToken = ""+paymentInfo;
					break;
				}
			}
		}

		if(WHITELISTED_VALITOR_REFERRER_IPs.indexOf(request.httpRemoteAddress) > -1 && args.orderToken == args.Order.getOrderToken()) {
			return new Status(Status.OK);
		}

		Logger.error('Valitor - validator.js - Valitor could not be validated as referrer'); 
		return new Status(Status.ERROR);

	} catch (e) {
		Logger.error('Valitor - validator.js - General error due to exception. Error message: ' + e.message);
		return new Status(Status.ERROR);
	}
}

exports.valitorFraudCheck = function(req) {
	Logger.debug('Validate Valitor Fraud Check.');
	var fraudRecommendation = req.form.fraud_recommendation;
    
	try {
		if (fraudRecommendation != null && (fraudRecommendation == 'Deny' || fraudRecommendation == 'Challenge')) {
			Logger.error('Valitor - validator.js - Valitor Fraud Check - fraud recommendation equals ' + fraudRecommendation); 
			return new Status(Status.ERROR);
		} else {
			return new Status(Status.OK);
		}	

	} catch (e) {
		Logger.error('Valitor - validator.js - General error due to exception. Error message: ' + e.message);
		return new Status(Status.ERROR);
	}
}