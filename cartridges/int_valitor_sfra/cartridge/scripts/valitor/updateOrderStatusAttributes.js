'use strict';

/**
 * Update Transaction- and Export status on the current order.
 * @param {Object} args - Parameters
 * @param {string} args.XMLString - Valitor Transaction Response
 * @param {dw.order.Order} args.Order - Current  Order
 * @param {boolean} args.OrderConfirmed - Is the Payment Authorization verified
 */
exports.execute = function(args) {
	//=======================================================
	// Transaction Status Settings
	//=======================================================
	var AUTH_TYPE_PAYMENT_AND_CAPTURE = 'paymentAndCapture',
		TRANSACTIONSTATUS_BANK_PAYMENT_FINALIZED = "bank_payment_finalized",
		TRANSACTIONSTATUS_CAPTURED = "captured";
		
	//=======================================================
	// 1. Update Payment Transaction Status.
	//=======================================================
	if(args.XMLString != null && !empty(args.XMLString)) {
		var xml_obj = new XML(args.XMLString),
			authType = encodeURIComponent(xml_obj.Body.Transactions.Transaction.AuthType),
			transactionStatus = encodeURIComponent(xml_obj.Body.Transactions.Transaction.TransactionStatus);

		if(authType.equals(AUTH_TYPE_PAYMENT_AND_CAPTURE) && transactionStatus.equals(TRANSACTIONSTATUS_BANK_PAYMENT_FINALIZED)){
			args.Order.custom.valitorTransactionStatus = TRANSACTIONSTATUS_CAPTURED.toUpperCase();
		} else {
			args.Order.custom.valitorTransactionStatus = transactionStatus.toUpperCase();
		}
	}	

	//=======================================================
	// 2. Update Confirmation and Export Status if the order
	// is ready for export.
	//=======================================================
	if(args.OrderConfirmed) {
		args.Order.setConfirmationStatus(dw.order.Order.CONFIRMATION_STATUS_CONFIRMED);
		args.Order.setExportStatus(dw.order.Order.EXPORT_STATUS_READY);
	} else {
		args.Order.setConfirmationStatus(dw.order.Order.CONFIRMATION_STATUS_NOTCONFIRMED);
	}
}

	