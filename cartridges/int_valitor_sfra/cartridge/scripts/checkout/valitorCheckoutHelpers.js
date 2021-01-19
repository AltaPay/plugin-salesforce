'use strict';

var HashMap = require('dw/util/HashMap');
var HookMgr = require('dw/system/HookMgr');
var Mail = require('dw/net/Mail');
var OrderMgr = require('dw/order/OrderMgr');
var PaymentMgr = require('dw/order/PaymentMgr');
var Status = require('dw/system/Status');
var Resource = require('dw/web/Resource');
var Site = require('dw/system/Site');
var Template = require('dw/util/Template');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');
var formErrors = require('*/cartridge/scripts/formErrors');

// static functions needed for Checkout Controller logic

/**
 * Validate billing form
 * @param {Object} form - the form object with pre-validated form fields
 * @returns {Object} the names of the invalid form fields
 */
function validateFields(form) {
	return formErrors.getFormErrors(form);
}

/**
 * Validate billing form fields
 * @param {Object} form - the form object with pre-validated form fields
 * @param {Array} fields - the fields to validate
 * @returns {Object} the names of the invalid form fields
 */
function validateBillingForm(form) {
	return validateFields(form);
}

/**
 * Validates status of the current users basket including product line items and coupons
 * @param {dw.order.Basket} currentBasket - The current user's basket
 * @returns {Object} an error object
 */
function validateBasketStatus(currentBasket) {
	return HookMgr.callHook('app.validate.basket', 'validateBasket', currentBasket, false);
}


/**
 * Sets the payment transaction amount
 * @param {dw.order.Basket} currentBasket - The current basket
 * @returns {Object} an error object
 */
function calculatePaymentTransaction(currentBasket) {
	var result = { error: false };

	try {
		Transaction.wrap(function () {
            // TODO: This function will need to account for gift certificates at a later date
			var orderTotal = currentBasket.totalGrossPrice;
			var paymentInstrument = currentBasket.paymentInstrument;
			paymentInstrument.paymentTransaction.setAmount(orderTotal);
		});
	} catch (e) {
		result.error = true;
	}

	return result;
}

/**
 * Attempts to create an order from the current basket
 * @param {dw.order.Basket} currentBasket - The current basket
 * @returns {dw.order.Order} The order object created from the current basket
 */
function createOrder(currentBasket) {
	var order;

	try {
		order = Transaction.wrap(function () {
			return OrderMgr.createOrder(currentBasket);
		});
	} catch (error) {
		return null;
	}
	return order;
}

/**
 * Handles the payment authorization for each payment instrument
 * @param {dw.order.Order} order - current order object
 * @param {string} orderNumber - Order number of current order
 * @returns {Object} an error object
 */
function handlePayments(order, orderNumber) {
	var result = {};

	if (order.totalNetPrice !== 0.00) {
		var paymentInstruments = order.paymentInstruments;

		if (paymentInstruments.length === 0) {
            
			Transaction.wrap(function () { 
				OrderMgr.failOrder(order); 
			});

			result.error = true;
		}

		if (!result.error) {
            
			for (var i = 0; i < paymentInstruments.length; i++) {
				var paymentInstrument = paymentInstruments[i];
				var paymentProcessor = PaymentMgr.getPaymentMethod(paymentInstrument.paymentMethod).paymentProcessor;        
				var authorizationResult;

				if (paymentProcessor === null) {
					Transaction.wrap(function () { 
						paymentInstrument.paymentTransaction.setTransactionID(orderNumber);
					});
				} else {
					if (HookMgr.hasHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase())) {
						authorizationResult = HookMgr.callHook('app.payment.processor.' + paymentProcessor.ID.toLowerCase(),'Authorize',
							{
								orderNumber: orderNumber,
								order: order,
								paymentInstrument: paymentInstrument,
								paymentProcessor: paymentProcessor
							}
                        );
					} else {
						authorizationResult = HookMgr.callHook('app.payment.processor.default','Authorize');
					}

					if (authorizationResult.getStatus() == dw.system.Status.ERROR) {
						Transaction.wrap(function () { 
							OrderMgr.failOrder(order); 
						});
						result.error = true;
						break;
					} 
				}
			}
		}
	}

	return result;
}

/**
 * Sends a confirmation to the current user
 * @param {dw.order.Order} order - The current user's order
 * @param {string} locale - the current request's locale id
 * @returns {void}
 */
function sendConfirmationEmail(order, locale) {
	var OrderModel = require('*/cartridge/models/order');
	var Locale = require('dw/util/Locale');

	var confirmationEmail = new Mail();
	var context = new HashMap();
	var currentLocale = Locale.getLocale(locale);

	var orderModel = new OrderModel(order, { countryCode: currentLocale.country });

	var orderObject = { order: orderModel };

	confirmationEmail.addTo(order.customerEmail);
	confirmationEmail.setSubject(Resource.msg('subject.order.confirmation.email', 'order', null));
	confirmationEmail.setFrom(Site.current.getCustomPreferenceValue('customerServiceEmail')
        || 'no-reply@salesforce.com');

	Object.keys(orderObject).forEach(function (key) {
		context.put(key, orderObject[key]);
	});

	var template = new Template('checkout/confirmation/confirmationEmail');
	var content = template.render(context).text;
	confirmationEmail.setContent(content, 'text/html', 'UTF-8');
	confirmationEmail.send();
}

/**
 * Attempts to place the order
 * @param {dw.order.Order} order - The order object to be placed
 * @returns {dw.system.Status} - OK or ERROR 
 */
function placeOrder(order) {
	try {
		Transaction.begin();
		var placeOrderStatus = OrderMgr.placeOrder(order);
		if (placeOrderStatus === Status.ERROR) {
			Logger.getLogger('Valitor').error('CheckoutHelpers.PlaceOrder failed for orderNo: {0}', order.orderNo);
			return new Status(Status.ERROR);
		}
        // Creates gift certificates for all gift certificate line items in the order
        // and sends an email to the gift certificate receiver
		order.getGiftCertificateLineItems().toArray().map(function (lineItem) {
			return createGiftCertificateFromLineItem(lineItem, order.getOrderNo());
		}).forEach(sendGiftCertificateEmail);

		Transaction.commit();
	} catch (e) {
		Logger.getLogger('Valitor').error('CheckoutHelpers.PlaceOrder failed for orderNo: {0}. Error message: {1}' , order.orderNo, e.message);
		Transaction.rollback();

		return new Status(Status.ERROR);
	}

	return new Status(Status.OK);
}

/**
 * Create a gift certificate for a gift certificate line item in the order
 * @param {dw.order.GiftCertificateLineItem} giftCertificateLineItem - Gift certificate line item in the current order
 * @param {string} orderNo the order number of the order to associate gift certificate to
 * @return {dw.order.GiftCertificate} - Gift certificate
 */
function createGiftCertificateFromLineItem(giftCertificateLineItem, orderNo) {
	var GiftCertificateMgr = require('dw/order/GiftCertificateMgr');
	var giftCertificate = GiftCertificateMgr.createGiftCertificate(giftCertificateLineItem.netPrice.value);
	giftCertificate.setRecipientEmail(giftCertificateLineItem.recipientEmail);
	giftCertificate.setRecipientName(giftCertificateLineItem.recipientName);
	giftCertificate.setSenderName(giftCertificateLineItem.senderName);
	giftCertificate.setMessage(giftCertificateLineItem.message);
	giftCertificate.setOrderNo(orderNo);

	return giftCertificate;
}

/**
 * Send an email to recipient of gift certificate
 * @param {dw.order.Order} order - The current user's order
 * @param {dw.order.GiftCertificate} giftCertificate - The current order's gift certificate
 * @returns {void}
 */
function sendGiftCertificateEmail(order, giftCertificate) {
	var giftCertificateEmail = new Mail();
	var context = new HashMap();
    
    // Set locale so any mails send is in the correct locale
	request.setLocale(order.getCustomerLocaleID());

	giftCertificateEmail.addTo(giftCertificate.getRecipientEmail());
	giftCertificateEmail.setSubject(Resource.msg('resource.ordergcemsg', 'email', null) + ' ' + giftCertificate.getSenderName());
	giftCertificateEmail.setFrom(Site.current.getCustomPreferenceValue('customerServiceEmail') || 'no-reply@salesforce.com');

	Object.keys(giftCertificate).forEach(function (key) {
		context.put(key, giftCertificate[key]);
	});

	var template = new Template('mail/giftcert');
	var content = template.render(context).text;
    
	giftCertificateEmail.setContent(content, 'text/html', 'UTF-8');
	giftCertificateEmail.send();
}

module.exports = {
	validateFields: validateFields,
	validateBillingForm: validateBillingForm,
	validateBasketStatus: validateBasketStatus,
	calculatePaymentTransaction: calculatePaymentTransaction,
	handlePayments: handlePayments,
	createOrder: createOrder,
	placeOrder: placeOrder,
	sendConfirmationEmail: sendConfirmationEmail
};
