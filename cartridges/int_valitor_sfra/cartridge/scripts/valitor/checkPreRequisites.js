'use strict'

/**
 * Find ID of the Valitor terminal to use in the current payment request and store it on args object
 * @param {Object} args - Parameters
 * @param {dw.order.PaymentMethod} args.PaymentMethod - Payment Method which is required to determine the Terminal ID
 * @param {dw.order.Order} args.Order - Current Order containing currency information which is required to determine the Terminal ID 
 */
exports.execute = function(args) {
	var Logger = require('dw/system/Logger').getLogger('Valitor', 'Valitor'),
		libValitor = require('./libValitor'),
		terminalID = null;
	
	Logger.debug('Valitor - checkPreRequisites.js - Get the Valitor terminal to use in the payment request.');
	var paymentMethod = args.PaymentMethod;
	if(paymentMethod != null) {
		var ValitorMgr = libValitor.getValitorMgr(),	
			terminals = ValitorMgr.getTerminals(),
			currencyCode = args.Order.currencyCode != null ? args.Order.currencyCode : session.currency.currencyCode;

		terminalID = terminals[paymentMethod + '_' + currencyCode];
	} else {
		Logger.error("Valitor - checkPreRequisites.js - Payment method is null and can't determine which Valitor terminal to use.");
	}
    
	args.TerminalID = terminalID;
}