'use strict';

/**
 * Script used to extract order information from XML
 * @module scripts/helpers/XMLHelper
 */

exports.parseValitorResponse = function(valitorResponse) {

	// If error occured during capture request
	if(valitorResponse.error) return valitorResponse;

	var xmlObj = valitorResponse.response;
	var response = {
		result: xmlObj.Body.Result ? xmlObj.Body.Result.toString() : '',
		errorMessage: xmlObj.Body.CardHolderErrorMessage ? xmlObj.Body.CardHolderErrorMessage.toString() : '',
		captureResult : xmlObj.Body.CaptureResult ? xmlObj.Body.CaptureResult.toString() : '',
		transaction: {
			id: xmlObj.Body.Transactions.Transaction.TransactionId ? xmlObj.Body.Transactions.Transaction.TransactionId.toString() : '',
			status: xmlObj.Body.Transactions.Transaction.TransactionStatus ? xmlObj.Body.Transactions.Transaction.TransactionStatus.toString() : '',
			reservedAmount: xmlObj.Body.Transactions.Transaction.ReservedAmount ? xmlObj.Body.Transactions.Transaction.ReservedAmount.toString() : '',
			capturedAmount: xmlObj.Body.Transactions.Transaction.CapturedAmount ? xmlObj.Body.Transactions.Transaction.CapturedAmount.toString() : ''
		}	
	};

	return response;
}