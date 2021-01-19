'use strict'
/**
 * Creates a payment instrument specific for the given payment type (payment method)
 * for the given basket
 * 
 * If only one payment instrument is allowed, any existing payment instrument may be
 * removed by using the RemoveExisting input parameter and passing a Boolean true.
 * 
 * If the payment instrument is succesfully created it will be stored on the args object. 
 * 
 * @param {Object} args - Parameters
 * @param {dw.order.LineItemCtnr} args.LineItemCtnr - The current basket.
 * @param {string} args.PaymentType - The payment method of the payment instrument to create.
 * @param {boolean} args.RemoveExisting - If true, removes any other payment instruments of the same payment method
*/
exports.execute = function(args) {
	var Logger = require('dw/system/Logger').getLogger('Valitor', 'Valitor');
	
	var lineItemCtnr = args.LineItemCtnr,
		paymentType = args.PaymentType,
		removeExisting = args.RemoveExisting,
		amount;

	// Validate input parameters
	// ===============================================================
	Logger.debug('Ensure all input parameters is provided.');
	if(lineItemCtnr == null || paymentType == null || removeExisting == null) {
		Logger.error('Valitor - createPaymentInstrument.js - Some parameters are missing. LineItemCtnr provided: {0},  PaymentType provided: {1}, RemoveExisting provided: {2}', (lineItemCtnr == null), (paymentType == null), (removeExisting == null));
		return;
	}

	// Remove existing payment instruments from the basket
	// ===============================================================
	if(removeExisting) {
		Logger.debug('Remove all payment instruments from the basket.');
		lineItemCtnr.removeAllPaymentInstruments();
	}

	// Calculate the amount to be reflected by this payment instrument
	// ===============================================================
	Logger.debug('Calculate the amount to be reflected by this payment instrument.');
	amount = calculateNonGiftCertificateAmount(lineItemCtnr);

	// Create payment instrument
	// ===============================================================
	Logger.debug('Create payment instrument based on payment method: {0} and with amount: {1}', paymentType, amount);
	args.PaymentInstrument = lineItemCtnr.createPaymentInstrument(paymentType, amount);
}

/**
 * Calculates the amount to be payed by a non-gift certificate payment instrument based 
 * on the given basket. The method subtracts the amount of all redeemed gift certificates 
 * from the order total and returns this value.
 * @param {dw.order.Basket} lineItemCtnr - The current basket
 * @returns {dw.value.Money} - Amount which has to be paid
 */
function calculateNonGiftCertificateAmount(lineItemCtnr) {
	var	Money = require('dw/value/Money');

	// The total redemption amount of all gift certificate payment instruments in the basket
	var giftCertTotal = new Money(0.0, lineItemCtnr.currencyCode),
		orderTotal,
		amountOpen;

	//Get the list of all gift certificate payment instruments 
	var gcPaymentInstrs = lineItemCtnr.getGiftCertificatePaymentInstruments(),
		iterator = gcPaymentInstrs.iterator(),
		orderPI = null;

	//Sum the total redemption amount
	while(iterator.hasNext()) {
		orderPI = iterator.next();
		giftCertTotal = giftCertTotal.add(orderPI.getPaymentTransaction().getAmount());
	}

	//Get the order total
	orderTotal = lineItemCtnr.totalGrossPrice;

	//Calculate the amount to charge for the payment instrument
	//this is the remaining open order total which has to be paid
	amountOpen = orderTotal.subtract( giftCertTotal );

	//Return the open amount
	return amountOpen;
}