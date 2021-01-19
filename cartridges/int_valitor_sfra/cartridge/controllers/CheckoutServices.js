'use strict';

var server = require('server');
var checkoutServices = module.superModule;
server.extend(checkoutServices);

var COHelpers = require('~/cartridge/scripts/checkout/valitorCheckoutHelpers');
var csrfProtection = require('*/cartridge/scripts/middleware/csrf');

var Logger = require('dw/system/Logger');

/**
 *  Handle Ajax payment (and billing) form submit
 */
server.replace('SubmitPayment', server.middleware.https, csrfProtection.validateAjaxRequest, function (req, res, next) {
	Logger.debug('Submit Payment Start.');

	var paymentForm = server.forms.getForm('billing');
	var billingFormErrors = {};
	var viewData = {};

	// Validate billing form data
	// ===============================================================
	Logger.debug('Validate all fields in the payment form.');
	billingFormErrors = COHelpers.validateBillingForm(paymentForm);

	if (Object.keys(billingFormErrors).length) {
        // respond with form data and errors
		res.json({
			form: paymentForm,
			fieldErrors: [billingFormErrors],
			serverErrors: [],
			error: true
		});
	} else {
		Logger.debug('Populate view data with values from the payment form.');
		viewData.address = {
			firstName: { value: paymentForm.addressFields.firstName.value },
			lastName: { value: paymentForm.addressFields.lastName.value },
			address1: { value: paymentForm.addressFields.address1.value },
			address2: { value: paymentForm.addressFields.address2.value },
			city: { value: paymentForm.addressFields.city.value },
			postalCode: { value: paymentForm.addressFields.postalCode.value },
			countryCode: { value: paymentForm.addressFields.country.value }
		};

		if (Object.prototype.hasOwnProperty
                .call(paymentForm.addressFields, 'states')) {
			viewData.address.stateCode =
                    { value: paymentForm.addressFields.states.stateCode.value };
		}

		viewData.paymentMethod = {
			value: paymentForm.paymentMethod.value,
			htmlName: paymentForm.paymentMethod.value
		};

		viewData.email = {
			value: paymentForm.customerEmail.value,
			htmlName: paymentForm.customerEmail.value
		};

		viewData.phone = {
			value: paymentForm.phone.value,
			htmlName: paymentForm.phone.value
		};

		res.setViewData(viewData);

		this.on('route:BeforeComplete', function (req, res) { // eslint-disable-line no-shadow
			var BasketMgr = require('dw/order/BasketMgr');
			var HookMgr = require('dw/system/HookMgr');
			var Resource = require('dw/web/Resource');
			var PaymentMgr = require('dw/order/PaymentMgr');
			var Transaction = require('dw/system/Transaction');
			var URLUtils = require('dw/web/URLUtils');
			var basketCalculationHelpers = require('*/cartridge/scripts/helpers/basketCalculationHelpers');
			var currentBasket = BasketMgr.getCurrentBasket();
			var billingData = res.getViewData();

			if (!currentBasket) {
				delete billingData.paymentInformation;

				res.json({
					error: true,
					cartError: true,
					fieldErrors: [],
					serverErrors: [],
					redirectUrl: URLUtils.url('Cart-Show').toString()
				});
				return;
			}

			var billingAddress = currentBasket.billingAddress;
			var billingForm = server.forms.getForm('billing');
			var paymentMethodID = billingData.paymentMethod.value;

			Transaction.wrap(function () {
				if (!billingAddress) {
					billingAddress = currentBasket.createBillingAddress();
				}

				billingAddress.setFirstName(billingData.address.firstName.value);
				billingAddress.setLastName(billingData.address.lastName.value);
				billingAddress.setAddress1(billingData.address.address1.value);
				billingAddress.setAddress2(billingData.address.address2.value);
				billingAddress.setCity(billingData.address.city.value);
				billingAddress.setPostalCode(billingData.address.postalCode.value);
                
				if (Object.prototype.hasOwnProperty.call(billingData.address, 'stateCode')) {
					billingAddress.setStateCode(billingData.address.stateCode.value);
				}
                
				billingAddress.setCountryCode(billingData.address.countryCode.value);

				if (billingData.storedPaymentUUID) {
					billingAddress.setPhone(req.currentCustomer.profile.phone);
					currentBasket.setCustomerEmail(req.currentCustomer.profile.email);
				} else {
					billingAddress.setPhone(billingData.phone.value);
					currentBasket.setCustomerEmail(billingData.email.value);
				}
			});

			// if there is no selected payment option and balance is greater than zero
			// =======================================================================
			if (!paymentMethodID && currentBasket.totalGrossPrice.value > 0) {
				var noPaymentMethod = {};

				noPaymentMethod[billingData.paymentMethod.htmlName] =
                        Resource.msg('error.no.selected.payment.method', 'creditCard', null);

				delete billingData.paymentInformation;

				res.json({
					form: billingForm,
					fieldErrors: [noPaymentMethod],
					serverErrors: [],
					error: true
				});
				return;
			}

			// Store selected payment method on session to be found if customer returns from uncompleted payment
			// =================================================================================================
			session.custom.selectedPaymentMethod = paymentMethodID;
            
            // Ensure there is a shipping address
			if (currentBasket.defaultShipment.shippingAddress === null) {
				res.json({
					error: true,
					errorStage: {
						stage: 'shipping',
						step: 'address'
					},
					errorMessage: Resource.msg('error.no.shipping.address', 'checkout', null)
				});
				return;
			}

			// Ensure that a billing address exists
			// =======================================================================
			if (!currentBasket.billingAddress) {
				res.json({
					error: true,
					errorStage: {
						stage: 'payment',
						step: 'billingAddress'
					},
					errorMessage: Resource.msg('error.no.billing.address', 'checkout', null)
				});
				return;
			}

			// Validate all product line items is online and in stock and no invalid coupons is added
			// ======================================================================================
			Logger.debug('Validate that all product line items in the basket is online and in stock and that no invalid coupons is added.'); 
			var validationBasketStatus = COHelpers.validateBasketStatus(currentBasket);
                
			if (validationBasketStatus.error) {
				Logger.error('Basket status is invalid. Error message: {0}', validationBasketStatus.errorMessage);
				res.json({
					error: true,
					errorMessage: validationBasketStatus.message
				});
				return;
			}

			// Ensure there is a payment processor
			// =======================================================================
			Logger.debug('Ensure there is a payment processor.');
			if (!PaymentMgr.getPaymentMethod(paymentMethodID).paymentProcessor) {
				Logger.error('Payment Processor is missing for paymentmethod with ID: {0}.', paymentMethodID);
				throw new Error(Resource.msg(
                        'error.payment.processor.missing',
                        'checkout',
                        null
                    ));
			}
            
            //===================================================================
            // All good! Start to place order
			//===================================================================
			
			Logger.debug('All validation completed start to place order.');
			var processor = PaymentMgr.getPaymentMethod(paymentMethodID).getPaymentProcessor();
			var status;

			Logger.debug('Handle payment and create payment instrument with payment processor {0}', processor.ID);
			if (HookMgr.hasHook('app.payment.processor.' + processor.ID.toLowerCase())) {
				try {
					status = HookMgr.callHook('app.payment.processor.' + processor.ID.toLowerCase(),
                        'Handle',
						{
							currentBasket: currentBasket,
							paymentMethodID: paymentMethodID
						}
					);

				} catch (e) {
					Logger.error('Handle payment failed! Error message: {0}', e.message);
					res.json({
						error: true,
						errorMessage: Resource.msg('error.technical', 'checkout', null)
					});
					return;
				}
                
			} else {
				Logger.error('No hook with id: "{0}" found!', 'app.payment.processor.' + processor.ID.toLowerCase());
				res.json({
					error: true,
					errorMessage: Resource.msg('error.technical', 'checkout', null)
				});
				return;
			}

			if (status.getStatus() == dw.system.Status.ERROR) {
				res.json({
					error: true,
					errorMessage: Resource.msg('error.technical', 'checkout', null),
					serverErrors: [],
					form: billingForm,
				});
				return;
			}

			// Calculate the basket
			// =======================================================================
			Logger.debug('Recalculate the basket.');
			Transaction.wrap(function () {
				basketCalculationHelpers.calculateTotals(currentBasket);
			});

			// Re-calculate the payments.
			// =======================================================================
			Logger.debug('Calculate the payment transaction.');
			var calculatedPaymentTransaction = COHelpers.calculatePaymentTransaction(
                    currentBasket
                );

			if (calculatedPaymentTransaction.error) {
				res.json({
					form: paymentForm,
					fieldErrors: [],
					serverErrors: [Resource.msg('error.technical', 'checkout', null)],
					error: true
				});
				return;
			}

			// Creates a new order. This will internally reserve inventory for order
			// and will create a new Order with status created
			// =====================================================================
			Logger.debug('Create order from current basket.');
			var order = COHelpers.createOrder(currentBasket);
			if (!order) {
				res.json({
					error: true,
					errorMessage: Resource.msg('error.technical', 'checkout', null)
				});
				return;
			}
			
			// Handles payment authorization
			// =======================================================================
			Logger.debug('Start to handle payment authorization.');
			try {
				var handlePaymentResult = COHelpers.handlePayments(order, order.orderNo);
				if (handlePaymentResult.error) {
					Logger.error('Authorization of payments failed!');
					res.json({
						error: true,
						errorMessage: Resource.msg('error.technical', 'checkout', null)
					});
					return;
				}
			} catch (e) {
				Logger.error('Payment authorization failed! Error message: {0}', e.message);
				res.json({
					error: true,
					errorMessage: Resource.msg('error.technical', 'checkout', null)
				});
				return;
			}
    
			//Redirect to payment provider with URL stored on global request object
			// ====================================================================
			Logger.debug('Get payment provider url from global request object');
			var location = request.custom && request.custom.valitor_location ? request.custom.valitor_location : '';
            
			session.custom.valitor_directedToPayment = true;
			session.custom.valitor_orderNo = order.orderNo;
        
			res.json({
				redirectUrl: location,
				error: false,
			});
		});
	}
	return next();
});

module.exports = server.exports();
