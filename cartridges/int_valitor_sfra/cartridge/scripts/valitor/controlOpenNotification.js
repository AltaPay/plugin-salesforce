'use strict';

/**
 * Determine how to handle the order based on Valitor's transaction status and results.
 * @param {Object} args - Parameters
 * @param {string} args.XMLString - Valitor Transaction Response
 */
exports.execute = function(args) {
	//=======================================================
	// Transaction Status Settings
	//=======================================================
	var AUTH_TYPE_PAYMENT_AND_CAPTURE = 'paymentAndCapture',
		TRANSACTIONSTATUS_PREAUTH = 'preauth',
		TRANSACTIONSTATUS_PREAUTH_ERROR = 'preauth_error',
		TRANSACTIONSTATUS_EPAYMENT_CANCELLED = 'epayment_cancelled',
		TRANSACTIONSTATUS_BANK_PAYMENT_FINALIZED = 'bank_payment_finalized',
		TRANSACTIONSTATUS_INVOICE_INITIALIZED = 'invoice_initialized',
		TRANSACTIONSTATUS_CAPTURED = 'captured',
		RESULT_SUCCESS = 'Success',
		RESULT_SUCCEEDED = 'Succeeded',
		RESULT_SUCCEEDED_LOWERCASE = 'succeeded',
		RESULT_FAILED = 'Failed',
		RESULT_ERROR = 'Error';

	args.NoResult = true;
	args.OrderMatch = false;
	args.FailOrder = false;
	
	if (args.XMLString != null && !empty(args.XMLString)) {
		
		var xml_obj = new XML(args.XMLString),
			result = encodeURIComponent(xml_obj.Body.Result),
			transactionStatus = encodeURIComponent(xml_obj.Body.Transactions.Transaction.TransactionStatus);

		if(result.equals(RESULT_SUCCESS) || result.equals(RESULT_SUCCEEDED) || result.equals(RESULT_SUCCEEDED_LOWERCASE) ){
			
			if(transactionStatus.equals(TRANSACTIONSTATUS_PREAUTH) || transactionStatus.equals(TRANSACTIONSTATUS_BANK_PAYMENT_FINALIZED || transactionStatus.equals(TRANSACTIONSTATUS_INVOICE_INITIALIZED))){
			
				var reservedAmount = parseFloat(encodeURIComponent(xml_obj.Body.Transactions.Transaction.ReservedAmount));
			
				if(args.Order.totalGrossPrice.getValue() == reservedAmount){
			
					args.Order.setConfirmationStatus(dw.order.Order.CONFIRMATION_STATUS_CONFIRMED);
					args.Order.setExportStatus(dw.order.Order.EXPORT_STATUS_READY);

					// Update Valitor Transaction Status on Order in SFCC
					// ===============================================================
					var authType = encodeURIComponent(xml_obj.Body.Transactions.Transaction.AuthType);
					if(authType.equals(AUTH_TYPE_PAYMENT_AND_CAPTURE) && transactionStatus.equals(TRANSACTIONSTATUS_BANK_PAYMENT_FINALIZED)){
						args.Order.custom.valitorTransactionStatus = TRANSACTIONSTATUS_CAPTURED.toUpperCase();
					} else {
						args.Order.custom.valitorTransactionStatus = TRANSACTIONSTATUS_PREAUTH.toUpperCase();
					}
			
					args.CancelOrder = false;
					args.OrderMatch = true;
					args.NoResult = false;
				}
			}
		} else if (result.equal(RESULT_ERROR) && transactionStatus.equals(TRANSACTIONSTATUS_EPAYMENT_CANCELLED)) {
			args.CancelOrder = true;
			args.OrderMatch = true;
			args.NoResult = false;

			// Update Valitor Transaction Status on Order in SFCC
			// ===============================================================
			args.Order.custom.valitorTransactionStatus = TRANSACTIONSTATUS_EPAYMENT_CANCELLED.toUpperCase();

		} else if (result.equals(RESULT_FAILED) && transactionStatus.equals(TRANSACTIONSTATUS_PREAUTH_ERROR)) {
			args.FailOrder = true;
			args.OrderMatch = true;
			args.CancelOrder = false;
			args.NoResult = false;

			// Update Valitor Transaction Status on Order in SFCC
			// ===============================================================
			args.Order.custom.valitorTransactionStatus = TRANSACTIONSTATUS_PREAUTH_ERROR.toUpperCase();

		}  else if(result.equals(RESULT_FAILED)){
			args.CancelOrder = true;
			args.OrderMatch = true;
			args.NoResult = false;

			// Update Valitor Transaction Status on Order in SFCC
			// ===============================================================
			args.Order.custom.valitorTransactionStatus = transactionStatus.toUpperCase();
		}
	}
}