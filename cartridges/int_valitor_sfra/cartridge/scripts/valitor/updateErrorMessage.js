'use strict';

/**
* Updates the error message presented to the customer, when a payment has failed.
* @param {Object} args - Parameters
* @param {string} args.XMLString - Valitor Transaction Response
*/
exports.execute = function(args) {
	var Resource = require('dw/web/Resource');
	//=======================================================
	// Transaction Status Settings
	//=======================================================
	var CANCELLED = 'cancelled',
		EPAYMENT_CANCELLED = 'epayment_cancelled';
		
	var errorMessage = '',
		errorMerchant = '',
		transactionID = '',
		transactionStatus = 'NONE',
		paymentID = '',
		errorMessageMustBeShown = false;

	
	if(args.XMLString != null && !empty(args.XMLString)){
		var xml_obj = new XML(args.XMLString);
		
		//Merchant error message. Don't show this message, but it can be used by support!
		errorMerchant = '' + xml_obj.Body.MerchantErrorMessage; 
		
		//Generic error message, that can be shown to the end user!
		errorMessage = '' + xml_obj.Body.CardHolderErrorMessage;
		errorMessageMustBeShown = xml_obj.Body.CardHolderMessageMustBeShown;
		
		transactionID = '' + xml_obj.Body.Transactions.Transaction.TransactionId;
		transactionStatus = '' + xml_obj.Body.Transactions.Transaction.TransactionStatus;

		paymentID = '' + xml_obj.Body.Transactions.Transaction.PaymentId;

		if(xml_obj.Body.Transactions.Transaction.TransactionStatus == EPAYMENT_CANCELLED || xml_obj.Body.Transactions.Transaction.TransactionStatus == CANCELLED){
			errorMessage = Resource.msg('valitor.msg.cancelled.by.user', 'valitor', null);
			args.CancelledByUser = true;
		}
	}
	args.MerchantErrorMsg = errorMerchant;
	args.ErrorMessage = errorMessage;
	args.ErrorMessageMustBeShown = errorMessageMustBeShown;
	args.TransactionId = transactionID;
	args.TransactionStatus = transactionStatus;
	args.PaymentId = paymentID;
}