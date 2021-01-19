'use strict';

/**
 * Adds the payment values from Valitor to the order payment instrument on the current order.
 * @param {Object} args - Parameters
 * @param {dw.order.Order} args.Order - Current Order
 * @param {string} args.XMLString - Valitor Transaction Response
 */
exports.execute = function(args) {
	var Logger = require('dw/system/Logger').getLogger('Valitor', 'Valitor'),
		PaymentMgr = require('dw/order/PaymentMgr'),
		libValitor = require('./libValitor'),
		ValitorMgr = libValitor.getValitorMgr();
    
	if(args.Order == null) {
		Logger.error('Valitor - updateOrderPaymentTransaction.js - Order isn\'t available.');
		return;
	}
	
	var valitorPaymentInstrument = ValitorMgr.getValitorPaymentInstrument(args.Order);
	
	if(valitorPaymentInstrument == null) {
		Logger.error('Valitor - updateOrderPaymentTransaction.js: PaymentInstrument not found!');
		return;
	} 
	
	if(args.XMLString != null && !empty(args.XMLString)) {
		var xml_obj = new XML(args.XMLString);
		
		//Create parameters
		var MaskedCardNo = encodeURIComponent(xml_obj.Body.Transactions.Transaction.CreditCardMaskedPan),
			TransactionID = encodeURIComponent(xml_obj.Body.Transactions.Transaction.TransactionId),
			PaymentID = encodeURIComponent(xml_obj.Body.Transactions.Transaction.PaymentId),
			CreditCardType = encodeURIComponent(xml_obj.Body.Transactions.Transaction.PaymentSchemeName),
			CardExirationMonth = encodeURIComponent(xml_obj.Body.Transactions.Transaction.CreditCardExpiry.Month),
			CardExirationYear = encodeURIComponent(xml_obj.Body.Transactions.Transaction.CreditCardExpiry.Year);

		var identifiers = xml_obj.Body.Transactions.Transaction.ReconciliationIdentifiers.ReconciliationIdentifier;
		var ReconciliationID;

		if(identifiers != null) {
			
			if(identifiers instanceof Array) {
				ReconciliationID =  encodeURIComponent(identifiers[identifiers.length - 1].Id);
			} else {
				ReconciliationID =  encodeURIComponent(identifiers.Id);
			}
		}
	}
	
	//Setting card number
	if(!empty(MaskedCardNo)) {
		valitorPaymentInstrument.setCreditCardNumber(MaskedCardNo.toString());
	}

	//Setting transaction id
	var paymentTransaction = valitorPaymentInstrument.paymentTransaction;
	paymentTransaction.setTransactionID(TransactionID);
	
	//Setting custom order attributes with Valitor Transaction ID and Payment ID
	args.Order.custom.valitorTransactionID = TransactionID;
	args.Order.custom.valitorPaymentID = PaymentID;
	
	//Setting expiration date
	if(!empty(CardExirationMonth) && !empty(CardExirationYear)) {
		var month = CardExirationMonth,
			year = CardExirationYear.substr(2, 4);
		
        valitorPaymentInstrument.setCreditCardExpirationMonth(parseInt(month));
		valitorPaymentInstrument.setCreditCardExpirationYear(parseInt(year));
	}
	
	//Set reconciliation ID
	if(ReconciliationID != null && !empty(ReconciliationID)){
		valitorPaymentInstrument.custom.reconciliationIdentifier = ReconciliationID;
	}

	//Update payment instrument
	if(valitorPaymentInstrument != null) {
		var paymentManager = PaymentMgr.getPaymentMethod(valitorPaymentInstrument.paymentMethod);
		valitorPaymentInstrument.paymentTransaction.paymentProcessor = paymentManager.paymentProcessor;
	}
	
	//Setting credit card type
	var creditCardType = CreditCardType;
	if(!empty(creditCardType)) {
		valitorPaymentInstrument.setCreditCardType(creditCardType);
	}
}