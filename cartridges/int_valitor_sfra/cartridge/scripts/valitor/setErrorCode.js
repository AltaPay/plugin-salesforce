'use strict'

/**
 * Outputs an error object if response from Valitor contains error.
 * @param {Object} args - Parameters
 * @param {string} args.XMLString - Valitor Transaction Response
 */
exports.execute = function(args) {
	var Logger = require('dw/system/Logger').getLogger('Valitor', 'Valitor');
	args.PlaceOrderError = null;

	if(args.XMLString != null && !empty(args.XMLString)) {
		var xml_obj = new XML(args.XMLString);
		
		if(xml_obj.Header.ErrorCode != '0' || xml_obj.Body.Result != 'Success') {
			var orderError = {};
			if(xml_obj.Header.ErrorCode != '0') {
				orderError.code = xml_obj.Header.ErrorCode;
				orderError.message = xml_obj.Header.ErrorMessage;
				orderError.privateMessage = xml_obj.header.ErrorMessage;
			} else {
				orderError.code = xml_obj.Body.CardHolderErrorMessage.toString().replace(/ /g, '').toLocaleLowerCase();
				if(empty(orderError.code)) {
					if(xml_obj.Body.Result == 'Cancelled') {
						orderError.code = 'cancelled';
					} else {						
						orderError.code = 'internalerror';
					}
				}
				orderError.message = xml_obj.Body.CardHolderErrorMessage;
				orderError.privateMessage = '';
				if(!empty(xml_obj.Body.CardHolderErrorMessage.toString())) {
					orderError.privateMessage = 'CardHolderErrorMessage: ' + xml_obj.Body.CardHolderErrorMessage.toString();
				}
				if(!empty(xml_obj.Body.MerchantErrorMessage.toString())) {
					orderError.privateMessage += (orderError.privateMessage == null || empty(orderError.privateMessage) ? '' : '\n') + 'MerchantErrorMessage: ' + xml_obj.Body.MerchantErrorMessage.toString();
				}
				if(!empty(args.MerchantErrorMsg)) {
					orderError.privateMessage += 'MerchantErrorMessage: ' + args.MerchantErrorMsg;
				}
				if(xml_obj.Body.Transactions != null && !empty(xml_obj.Body.Transactions.Transaction.TransactionStatus.toString())) {
					orderError.privateMessage += (orderError.privateMessage == null || empty(orderError.privateMessage) ? '' : '\n') + 'TransactionStatus: ' + xml_obj.Body.Transactions.Transaction.TransactionStatus.toString();
				}
			}
			
			args.PlaceOrderError = orderError;
			Logger.error('Error during Valitor payment: ' + args.MerchantErrorMsg);
			Logger.error(args.XMLString);
		}
	}
}
