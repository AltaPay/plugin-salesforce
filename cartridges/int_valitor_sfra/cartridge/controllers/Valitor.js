/**
 * Valitor SFRA controller. 
 */
'use strict';

var server 			= require('server');

var Transaction 	= require('dw/system/Transaction');
var Status 			= require('dw/system/Status');
var URLUtils 		= require('dw/web/URLUtils');
var Resource 		= require('dw/web/Resource');
var Locale 			= require('dw/util/Locale');

var COHelpers 		= require('~/cartridge/scripts/checkout/valitorCheckoutHelpers');
var ErrorHandler 	= require('~/cartridge/scripts/valitor/helpers/errorHandler');
var BasketHelper	= require('~/cartridge/scripts/valitor/helpers/basketHelper');
var Validator 		= require('~/cartridge/scripts/valitor/helpers/validator');

/**
 * Get current order no. stored on session
 * @returns {string} - Session stored order no.
 */
function getOrderNo() {
	return session.custom.valitor_orderNo;
}

/**
 * Get current order
 * @param {string} orderNo - Order no. for requested Order
 * @returns {dw.order.Order} - Order 
 */
function getOrder(orderNo) {
	var OrderMgr = require('dw/order/OrderMgr');
	return OrderMgr.getOrder(!empty(orderNo) ? orderNo : getOrderNo());
}

/**
 * Renders template used on the payment page at Valitor
 */
server.post('CallbackForm', server.middleware.https, function (req, res, next) {
	
	var OrderModel = require('*/cartridge/models/order'),
		AccountModel = require('*/cartridge/models/account'),   
		reportingUrlsHelper = require('*/cartridge/scripts/reportingUrls');
	
	try {
		var orderNo = !empty(req.form.shop_orderid) ? req.form.shop_orderid : getOrderNo(),
			order = getOrder(orderNo),	
			currentLocale = Locale.getLocale(req.locale.id),
			args = {
				orderToken: req.form['transaction_info[demandware_order_token]']
			};

		if (order != null) {
			args.Order = order;
			
			// Validate Valitor as referrer
			// =================================================================
			var status = Validator.validateValitorAsReferrer(args);
			if(status.getStatus() == Status.ERROR) {
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - CallbackForm - Error due to not being able to validate Valitor as referrer. Request from: ' + req.remoteAddress
				});
				return next();
			}

			var shippingForm = server.forms.getForm('shipping'),
				billingForm = server.forms.getForm('billing'),
				usingMultiShipping = req.session.privacyCache.get('usingMultiShipping');

			var orderModel = new OrderModel(order, {
				customer: req.currentCustomer.raw,
				usingMultiShipping: usingMultiShipping,
				shippable: true,
				countryCode: currentLocale.country,
				containerView: 'basket'
			});

			var accountModel = new AccountModel(req.currentCustomer);

			var reportingURLs = reportingUrlsHelper.getCheckoutReportingURLs(
				order.UUID,
				4,
				'Place Order'
			);

			res.render('valitor/callbackform.isml', {
				order: orderModel,
				customer: accountModel,
				forms: {
					shippingForm: shippingForm,
					billingForm: billingForm
				},
				reportingURLs: reportingURLs
			});

			return next();

		} else {
			ErrorHandler.handleErrorEvent(res, {
				logErrorMessage: 'Valitor - CallbackForm - Current order not found in SFCC!'
			});
			return next();
		}
	} catch (e) {
		// Fail order and handle error event
		// =================================================================
		ErrorHandler.failOrder(order);
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - CallbackForm - General Error due to exception. Error message: ' + e.message
		});

		// Recover the basket, so the user can try to checkout again
		BasketHelper.recoverBasketFromOrder(order);
		return next();
	}
});
		
/**
 * Validate payment success response from Valitor and handle payment
 */
server.post('PaymentSuccess', server.middleware.https, function (req, res, next) {
	
	try {
		var orderNo = !empty(req.form.shop_orderid) ? req.form.shop_orderid : getOrderNo(),
			order = getOrder(orderNo),
			args = {
				Order: order,
				OrderNo: orderNo,
				CallbackParams: req.form,
				XMLString: req.form.xml,
				OrderConfirmed: true
			},
			status;
		
		if(order != null) {
			
			// Validate Valitor as referrer
			// =================================================================
			status = Validator.validateValitorAsReferrer(args);
			if(status.getStatus() == Status.ERROR) {
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - PaymentSuccess - Error due to not being able to validate Valitor as referrer. Request from: ' + req.remoteAddress,
					customerErrorMessage: Resource.msg('error.payment.server.error','checkout', null),
					redirect: true
				});
				return next();
			}

			// Make sure that the order is not failed or cancelled before current request
			// and stop the proces if that is the case. 
			// =================================================================
			status = Validator.validateOrderIsNotFailedOrCancelled(args);
			if(status.getStatus() == Status.ERROR) {
				ErrorHandler.releasePaymentReservation(args);
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - PaymentSuccess - Order is either failed or cancelled before current request.',
					customerErrorMessage: Resource.msg('error.payment.server.error','checkout', null),
					redirect: true
				})
				return next();
			}

			// Payment success request is valid - Handle payment
			// =================================================================
			handlePayment(req, res, args);

		} else {
			// Release payment reservation and handle error event
			// =================================================================
			ErrorHandler.releasePaymentReservation(args);
			ErrorHandler.handleErrorEvent(res, {
				logErrorMessage: 'Valitor - PaymentSuccess - Order with ID: ' + orderNo + 'not found in SFCC!',
				customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
				redirect: true
			});
		}

		return next();    

	} catch (e) {
		// Release payment reservation and handle error event
		// =================================================================
		ErrorHandler.failOrder(args.Order);
		ErrorHandler.releasePaymentReservation(args);
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentSuccess - General Error due to exception. Error message: ' + e.message,
			customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
			redirect: true
		});
		
		//Recover the basket, so the user can try to checkout again
		BasketHelper.recoverBasketFromOrder(args.Order);
		return next();
	}
});

/**
 * This controller is for asynchronous payments. A final payment notification will be received later.
 */
server.post('PaymentOpen', server.middleware.https, function (req, res, next) {
	
	try {
		
		var orderNo = !empty(req.form.shop_orderid) ? req.form.shop_orderid : getOrderNo(),
			order = getOrder(orderNo),
			args = {
				Order: order,
				OrderNo: orderNo,
				CallbackParams: req.form,
				XMLString: req.form.xml,
				OrderConfirmed: false
			},
			status;

		if(order != null) {

			// Validate Valitor as referrer
			// =================================================================
			status = Validator.validateValitorAsReferrer(args);
			if(status.getStatus() == Status.ERROR) {
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - PaymentOpen - Error due to not being able to validate Valitor as referrer. Request from: ' + req.remoteAddress,
					customerErrorMessage: Resource.msg('error.payment.server.error','checkout', null),
					redirect: true
				});
				return next();
			}

			// Make sure that the order is not failed or cancelled before current request
			// and stop the proces if that is the case. 
			// =================================================================
			status = Validator.validateOrderIsNotFailedOrCancelled(args);
			if(status.getStatus() == Status.ERROR) {
				ErrorHandler.releasePaymentReservation(args);
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - PaymentOpen - Order is either failed or cancelled before current request',
					customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
					redirect: true
				});
				return next();
			}

			// Payment open request is valid - Handle payment
			// =================================================================
			handlePayment(req, res, args);

		} else {
			// Release Payment Reservation and handle error event
			// =================================================================
			ErrorHandler.releasePaymentReservation(args);
			ErrorHandler.handleErrorEvent(res, {
				logErrorMessage: 'Valitor - PaymentOpen - Order with ID: ' + orderNo + 'not found in SFCC!',
				customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
				redirect: true
			});
		}	
		return next();

	} catch (e) {
		// Release payment reservation and handle error event
		// =================================================================
		ErrorHandler.failOrder(order);
		ErrorHandler.releasePaymentReservation(args);
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentOpen - General Error due to exception. Error message: ' + e.message,
			customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
			redirect: true
		});

		//Recover the basket, so the user can try to checkout again
		BasketHelper.recoverBasketFromOrder(order);
		return next();
	}
});

/**
 * Controller for failed payments.
 */
server.post('PaymentFail', server.middleware.https, function (req, res, next) {
	try {
		var orderNo = !empty(req.form.shop_orderid) ? req.form.shop_orderid : getOrderNo(),
			order = getOrder(orderNo),
			args = {
				Order: order,
				OrderNo: orderNo,
				CallbackParams: req.form,
				XMLString: req.form.xml,
				MerchantErrorMsg: req.form.merchant_error_message,
			},
			status;
		
		if(order != null) {

			// Validate Valitor as referrer
			// =================================================================
			status = Validator.validateValitorAsReferrer(args);
			if(status.getStatus() == Status.ERROR) {
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - PaymentFail - Error due to not being able to validate Valitor as referrer. Request from: ' + req.remoteAddress,
					customerErrorMessage: Resource.msg('error.payment.server.error','checkout', null),
					redirect: true
				});
				return next();
			}

			// Update order with error information from Valitor
			// =================================================================
			require('~/cartridge/scripts/valitor/updateErrorMessage').execute(args);
			require('~/cartridge/scripts/valitor/setErrorCode').execute(args);
	
			Transaction.wrap(function() {		
				order.custom.valitorTransactionID = args.TransactionId;
				order.custom.valitorTransactionStatus = typeof args.TransactionStatus == 'string' ? args.TransactionStatus.toUpperCase() : '';
				order.custom.valitorPaymentID = args.PaymentId;	
				order.custom.valitorErrorCode = args.PlaceOrderError != null ? args.PlaceOrderError.code : '';
				order.custom.valitorErrorMessage = args.MerchantErrorMsg;
			});
			
			// If the order is not already failed then fail the order
			// =================================================================
			if(order.getStatus() != dw.order.Order.ORDER_STATUS_FAILED){
				ErrorHandler.failOrder(order);
			}

			// Handle error event
			// =================================================================
			ErrorHandler.handleErrorEvent(res, {
				logErrorMessage: !args.CancelledByUser ? 'Valitor - PaymentFail - Merchant Error message: ' + args.MerchantErrorMsg + '. Error message: ' + args.privateMessage : null,
				customerErrorMessage: args.ErrorMessageMustBeShown && !empty(args.ErrorMessage) ? args.ErrorMessage : Resource.msg('error.payment.server.error','checkout',null),
				cancelledByUser: args.CancelledByUser ? args.CancelledByUser : false,
				redirect: true
			});

			//Recover the basket, so the user can try to checkout again
			BasketHelper.recoverBasketFromOrder(order);

			
		} else {
			// Handle error event
			// =================================================================
			ErrorHandler.handleErrorEvent(res, {
				logErrorMessage: 'Valitor - PaymentFail - Order with ID: ' + order.orderNo + 'not found in SFCC!',
				customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
				redirect: true
			});
		}	

		return next();

	} catch(e) {
		// Fail the order and handle error event
		// =================================================================
		ErrorHandler.failOrder(order);
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentFail - General Error due to exception. Error message: ' + e.message,
			customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
			redirect: true
		});

		//Recover the basket, so the user can try to checkout again
		BasketHelper.recoverBasketFromOrder(order);
		return next();
	}
});

/**
 * This controller is for asynchronous payments, when the aquier returns an answer for payment request.
 */
server.post('PaymentNotification', server.middleware.https, function (req, res, next) {
	var OrderMgr = require('dw/order/OrderMgr'),
		args = {
			CallbackParams: req.form,
			XMLString: req.form.xml
		};
	
	// Find order ID from Valitor request body
	// ===============================================================
	require('~/cartridge/scripts/valitor/findOrder').execute(args);
	
	if (args.orderId == null) {
		//Order ID not found
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentNotification - Order ID not found in request body from Valitor',
		});
		res.render('valitor/notification_feedback_order_not_found.isml', {});
		return next();
	}
	
	var order = OrderMgr.getOrder(args.orderId);

	if (order == null) {		
		
		//Order not found in SFCC, release the payment reservation and handle error event
		ErrorHandler.releasePaymentReservation(args);
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentNotification - Order not found: order ID ' + args.orderId,
		});

		res.render('valitor/notification_feedback_order_not_found.isml', {});
		return next();
	}

	args.Order = order;
	args.OrderNo = order.orderNo;

	// Validate Valitor as referrer
	// =================================================================
	var status = Validator.validateValitorAsReferrer(args);
	if(status.getStatus() == dw.system.Status.ERROR) {
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentNotification - Error due to not being able to validate Valitor as referrer. Request from: ' + req.remoteAddress,
		});
		res.render('valitor/notification_feedback_order_not_found.isml', {});
		return next();
	}

	status = Validator.validateOrderIsNotFailedOrCancelled(args);

	// Stop proces if order is either failed or cancelled before current request
	// =========================================================================
	if(status.getStatus() == dw.system.Status.ERROR) {
		res.render('valitor/notification_feedback_order_not_found.isml', {});
		return next();
	}
	
	// Control open notification and determine how the order should be handled
	// ===============================================================
	Transaction.wrap (function () {
		return require('~/cartridge/scripts/valitor/controlOpenNotification.js').execute(args);
	});

	// Handle order based on Valitor information
	// ===============================================================
	if (args.NoResult) {
		res.render('valitor/notification_feedback_order_not_found.isml', {});
		return next();

	} else if (args.CancelOrder) { 
		handlePaymentNotificationCancelOrder(res, args);
		return next();
		
	}  else if (args.FailOrder) { 
		handlePaymentNotificationFailOrder(res, args);
		return next();
		
	} else if (args.OrderMatch) {
		if (order.getStatus() != dw.order.Order.ORDER_STATUS_NEW) {
			try {
				
				// Place order
				// ===============================================================
				status = COHelpers.placeOrder(order);
				
				if(status.getStatus() == dw.system.Status.OK) {

					// Update paymentinstrument with information from Valitor
					// ===============================================================
					Transaction.wrap(function() {
						require('~/cartridge/scripts/valitor/updatePaymentInstrument').execute(args);
					});

					// Remove Valitor related session storage
					// ===============================================================
					delete session.custom.valitor_orderNo;
					delete session.custom.valitor_directedToPayment;
					delete session.custom.valitor_openMessage;
					delete session.custom.valitor_placeOrderError;
					delete session.custom.valitor_customerErrorMessage;
					
					// Send confirmation email
					// ===============================================================
					if (order.getConfirmationStatus() == dw.order.Order.CONFIRMATION_STATUS_CONFIRMED) {
						COHelpers.sendConfirmationEmail(args.Order, args.Order.customerLocaleID);
					}

				} else {
					// Handle error event
					// =================================================================
					ErrorHandler.handleErrorEvent(res, {
						logErrorMessage: 'Valitor - PaymentNotification - Place Order: Order could not be placed',
					});
					return next();
				}
				
			} catch (e) {
				// Handle error event
				// =================================================================
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - PaymentNotification - Error calling CheckoutHelpers PlaceOrder',
				});
				return next();		
			}
		}

		res.render('valitor/notification_feed_back.isml', {});

		return next();

	} else {
		// Handle error event
		// =================================================================
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentNotification - OrderMatch is false',
		});

		res.render('valitor/notification_feedback_order_not_found.isml', {});

		return next();
	}
});

/**
 * Clear Valitor related session storage, send order confirmation and redirect to confirmation page
 */
server.get('ShowConfirmation', server.middleware.https, function (req, res, next) {
	var order = getOrder(req.querystring.orderno);
	if (order == null) {
		// Handle error event
		// =================================================================	
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - ShowConfirmation - Order not found with ID: ' + req.querystring.orderno
		});
		return next();
	}

	// Remove Valitor related session storage
	// ===============================================================
	delete session.custom.valitor_orderNo;
	delete session.custom.valitor_directedToPayment;
	delete session.custom.valitor_openMessage;
	delete session.custom.valitor_placeOrderError;
	delete session.custom.valitor_customerErrorMessage;
	delete session.custom.selectedPaymentMethod;
	
	// Send confirmation email
	// ===============================================================
	if (order.getConfirmationStatus() == dw.order.Order.CONFIRMATION_STATUS_CONFIRMED) {
		COHelpers.sendConfirmationEmail(order, order.customerLocaleID);
	}

	// Redirect to confirmation page
	// =================================================================
	res.redirect(URLUtils.https("Order-Confirm", 'ID', order.orderNo, 'token', order.orderToken));
	return next();
});

/**
 * Handle successful and open payments.
 * @param {Object} req - request object 
 * @param {Object} res - response object
 * @param {Object} args - Object holding information trough the current request 
 * @param {string} args.OrderNo - Order No of the current order
 * @param {boolean} args.OrderConfirmed - Payment confirmed or not
 */
function handlePayment(req, res, args) {
	try {
		var status; 

		// Save credit card token, if requested by customer
		// ===============================================================
		require('~/cartridge/scripts/valitor/saveCreditCardToken').execute(args);

		// If selected payment method is Klarna then override shipping address with registered
		// address from Klarna
		// =================================================================================
		if(args.Order.paymentInstrument.paymentMethod.indexOf('KLARNA') != -1) {
			status = require('~/cartridge/scripts/valitor/handleKlarnaResponse').execute(args);
			if( status.getStatus() == dw.system.Status.ERROR) {
				
				// Update order with registered address from Klarna failed.
				// ===============================================================
				ErrorHandler.failOrder(args.Order);
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - handlePayment - Override shipping address with registered address from Klarna failed',
					customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
					redirect: true
				});

				// Recover the basket, so the user can try to checkout again
				BasketHelper.recoverBasketFromOrder(args.Order);
				return;
			}
		}

		// Make Fraud Check
		// ===============================================================
		status = Validator.valitorFraudCheck(req);
		if( status.getStatus() == dw.system.Status.ERROR) {
			
			// Fraud checking (only for credit cards) returned 'Deny' or 'Challenge': fail the order.
			// ======================================================================================
			ErrorHandler.failOrder(args.Order);
			ErrorHandler.handleErrorEvent(res, {
				logErrorMessage: 'Valitor - handlePayment - Fraud check: credit card declined',
				customerErrorMessage: Resource.msg('error.declined.credit.card','creditCard',null),
				redirect: true
			});

			// Recover the basket, so the user can try to checkout again
			BasketHelper.recoverBasketFromOrder(args.Order);
			return;
		}
		
		// Place order
		// ===============================================================
		if (args.Order.getStatus() != dw.order.Order.ORDER_STATUS_NEW) {
			//Order status should change from CREATED to NEW.
			status = COHelpers.placeOrder(args.Order);
			if (status.getStatus() == dw.system.Status.OK) {
				
				Transaction.wrap(function() {
					require('~/cartridge/scripts/valitor/updatePaymentInstrument').execute(args);
					require('~/cartridge/scripts/valitor/updateOrderStatusAttributes').execute(args);
				});

				require('~/cartridge/scripts/valitor/updateOpenNotificationMessage').execute(args);
				
				// Save openMessage on session so it can be used to show on the order confirmation page
				// ===============================================================
				if(args.openMessage) {
					session.custom.valitor_openMessage = args.openMessage;
				}

			} else {
				// Fail the order and handle error event
				// ===============================================================
				ErrorHandler.failOrder(args.Order);
				ErrorHandler.handleErrorEvent(res, {
					logErrorMessage: 'Valitor - handlePayment - Place Order: Order could not be placed',
					customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
					redirect: true
				});

				//Recover the basket, so the user can try to checkout again
				BasketHelper.recoverBasketFromOrder(args.Order);
				return;
			}
		}
		
		// Redirect to order confirmation
		// ===============================================================
		res.redirect(URLUtils.https('Valitor-ShowConfirmation', 'orderno', args.OrderNo));
		return;

	} catch(e) {
		// Fail the order and handle error event
		// ===============================================================
		ErrorHandler.failOrder(args.Order);
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - handlePayment - General error due to exception. Error message: ' + e.message,
			customerErrorMessage: Resource.msg('error.payment.server.error','checkout',null),
			redirect: true
		});

		//Recover the basket, so the user can try to checkout again
		BasketHelper.recoverBasketFromOrder(args.Order);
		return;
	}
}

/**
 * Handle payment notification cancel order
 * @param {Object} res - Response Object 
 * @param {Object} args - Oject containing all transaction related information
 */
function handlePaymentNotificationCancelOrder(res, args){
		
	// Update order with error information from Valitor
	// =================================================================
	require('~/cartridge/scripts/valitor/updateErrorMessage').execute(args);
	require('~/cartridge/scripts/valitor/setErrorCode').execute(args);

	Transaction.wrap(function() {		
		args.Order.custom.valitorTransactionID = args.TransactionId;
		args.Order.custom.valitorTransactionStatus = typeof args.TransactionStatus == 'string' ? args.TransactionStatus.toUpperCase() : '';
		args.Order.custom.valitorPaymentID = args.PaymentId;	
		args.Order.custom.valitorErrorCode = args.PlaceOrderError != null ? args.PlaceOrderError.code : '';
		args.Order.custom.valitorErrorMessage = args.MerchantErrorMsg;
	});
		
	// Cancel the order
	// ===============================================================
	var status = cancelOrder(args.Order, args);
	if (status.getStatus() == dw.system.Status.OK) {
		res.render('valitor/notification_feed_back.isml', {});
		return;
	} else {
		ErrorHandler.handleErrorEvent(res, {
			logErrorMessage: 'Valitor - PaymentNotification - Error cancelling the order ' + args.orderId + ': ' + status.getMessage(),
		});
		res.render('valitor/notification_feedback_order_not_found.isml', {});
		return;
	}
}

/**
 * Handle payment notification fail order
 * @param {Object} res - Response Object 
 * @param {Object} args - Oject containing all transaction related information
 */
function handlePaymentNotificationFailOrder(res, args){
		
	// Update order with error information from Valitor
	// =================================================================
	require('~/cartridge/scripts/valitor/updateErrorMessage').execute(args);
	require('~/cartridge/scripts/valitor/setErrorCode').execute(args);

	Transaction.wrap(function() {		
		args.Order.custom.valitorTransactionID = args.TransactionId;
		args.Order.custom.valitorTransactionStatus = typeof args.TransactionStatus == 'string' ? args.TransactionStatus.toUpperCase() : '';
		args.Order.custom.valitorPaymentID = args.PaymentId;	
		args.Order.custom.valitorErrorCode = args.PlaceOrderError != null ? args.PlaceOrderError.code : '';
		args.Order.custom.valitorErrorMessage = args.MerchantErrorMsg;
	});
		
	// Fail the order
	// ===============================================================
	ErrorHandler.failOrder(args.Order);
	res.render('valitor/notification_feed_back.isml', {});
	return;
}


/**
 * Cancel current order
 * @param {dw/order/Order} order - Current Order
 * @returns {dw.system.Status} - OK or ERROR
 */
function cancelOrder(order) {
	var OrderMgr = require('dw/order/OrderMgr'),
		status;
	try {
		status = Transaction.wrap(function() {
			return OrderMgr.cancelOrder(order);
		})
		if(status.getStatus() == dw.system.Status.OK) {
			Transaction.wrap(function(){
				order.addNote('Order cancelled','Order cancelled due to Valitor unsuccessfull authorization');
			})
			return new Status(Status.OK);
		} else {
			return new Status(Status.ERROR);
		}
	} catch (e) {
		ErrorHandler.handleErrorEvent(null, {
			logErrorMessage: 'Valitor - CancelOrder - Error due to exception. Error message: ' + e.message
		});
		return new Status(Status.ERROR);
	}
}

module.exports = server.exports();