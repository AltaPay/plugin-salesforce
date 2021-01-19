'use strict';

/* API Includes */
var Logger 	    = require('dw/system/Logger').getLogger('Valitor', 'Valitor');
var Transaction = require('dw/system/Transaction');
var Status 		= require('dw/system/Status');

/**
 * Creates a payment instrument specific for the given payment type (payment method)
 * for the given basket
 * @param {Object} args - Parameters
 * @param {dw.order.LineItemCtnr} args.currentBasket - The current basket.
 * @param {string} args.paymentMethodID - ID of the payment method used to create the payment instrument
 * @returns {dw.system.Status} - OK or ERROR
 */
exports.Handle = function(args) {
	Logger.debug('Start Valitor handle');

	args.LineItemCtnr = args.currentBasket;
	args.PaymentType = args.paymentMethodID;
	args.RemoveExisting = true;

	try {
		//=======================================================
		// 1. Create Payment Instrument
		//=======================================================
		Logger.debug('Create payment instrument.');
		Transaction.wrap(function() {
			return require('~/cartridge/scripts/valitor/createPaymentInstrument.js').execute(args);
		});

		if(!args.PaymentInstrument) {
			Logger.error('Valitor handle error: Payment instrument not created.');
			return new Status(Status.ERROR);
		}

		return new Status(Status.OK);

	} catch (e) {
		Logger.error('Valitor handle error: ', e.message);
		return new Status(Status.ERROR);
	}
}

/**
 * Perform Valitor createPayment request and store payment gateway URL on current session object.
 * @param {Object} args - Parameters
 * @param {string} args.orderNumber - Order number of the current Order
 * @param {dw.order.Order} args.order - The current Order
 * @param {dw.order.PaymentInstrument} args.paymentInstrument - current PaymentInstrument
 * @param {dw.order.PaymentProcessor} args.paymentProcessor - current PaymentProcessor 
 * @returns {dw.system.Status} - OK or ERROR
 */
exports.Authorize = function(args) {
	Logger.debug('Start Valitor Authorize');

	try {

		//=======================================================
		// 1. Get ID of Valitor Terminal used to create payment
		//=======================================================
	
		Logger.debug('Valitor Authorize: Check requisites.');
		args.Order = args.order;
		args.PaymentMethod = args.paymentInstrument.paymentMethod;
	
		require('~/cartridge/scripts/valitor/checkPreRequisites.js').execute(args);
		
		if (!args.TerminalID) {
			Logger.error('Couldn\'t determine which Valitor terminal to use.');
			return new Status(Status.ERROR);
		}
		
		//=======================================================
		// 2. Create payment request parameters
		//=======================================================
		Logger.debug('Valitor Authorize: Create payment request parameters.');
		require('~/cartridge/scripts/valitor/createRequestParameters.js').execute(args);
		
		
		//=======================================================
		// 3. Send payment request Valitor and store Payment URL
		// on Global request object.
		//=======================================================
		Logger.debug('Valitor Authorize: Send payment request to Valitor.');
		require('~/cartridge/scripts/valitor/sendPaymentRequest.js').execute(args);
		
		if (!args.CreatePaymentURL) {
			Logger.error('Couldn\'t determine Valitor gateway URL.');
			return new Status(Status.ERROR);
		}
	
		session.custom.valitor = args.orderNumber;
		request.custom.valitor_location = args.CreatePaymentURL;
		return new Status(Status.OK);

	} catch (e) {
		Logger.error('Valitor Authorize error: ', e.message);
		return new Status(Status.ERROR);
	}
}
