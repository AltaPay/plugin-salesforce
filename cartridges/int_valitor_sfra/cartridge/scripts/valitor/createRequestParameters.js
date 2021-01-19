'use strict';
/**
 * Creates parameters for Valitor createPayment request.
 * @param {Object} args - Parameters
 * @param {dw.order.Order} args.Order - Current Order
 * @param {string} args.TerminalID - Current Valitor Terminal ID
 */
exports.execute = function(args) {
	var URLUtils = require('dw/web/URLUtils'),
		Logger = require('dw/system/Logger').getLogger('Valitor', 'Valitor'),
		Resource = require('dw/web/Resource'),
		Money = require('dw/value/Money');
    
	var libValitor = require('./libValitor');
    var ValitorMgr = libValitor.getValitorMgr();
		
	
	var order = args.Order,
		currencyCode = order.currencyCode != null ? order.currencyCode : session.currency.currencyCode;

	// Detecting if Klarna is selected Payment Method.
	//=======================================================
	var isKlarna = order.paymentInstrument.paymentMethod.indexOf('VALITOR_KLARNA') != -1;	

	// 1. Get Order Total Price
	//=======================================================

	Logger.debug('Get Payment total.');
	var paymentTotal;	
	if(dw.order.TaxMgr.taxationPolicy == dw.order.TaxMgr.TAX_POLICY_GROSS && order.totalGrossPrice.available) {
		paymentTotal = order.totalGrossPrice;
	} else if(dw.order.TaxMgr.taxationPolicy == dw.order.TaxMgr.TAX_POLICY_NET && order.totalNetPrice.available) {
		paymentTotal = order.totalNetPrice;
	} else {
		paymentTotal = order.getAdjustedMerchandizeTotalPrice(true).add(order.giftCertificateTotalPrice);
	}
	
	// 2. Get Valitor Terminal ID
	//=======================================================

	Logger.debug('Get Valitor Terminal from arguments.');
	var terminalName = args.TerminalID;
	if(terminalName == null) {
		Logger.warn('Valitor Terminal couldn\'t be dertermined from arguments.');
		var paymentInstrument = ValitorMgr.getValitorPaymentInstrument(order);
		terminalName = ValitorMgr.getTerminals()[paymentInstrument.paymentMethod + '_' + order.currencyCode];
	}
	
	// 3. Create Payment Request Parameters
	//=======================================================

	Logger.debug('Create payment request parameters.');
	var parameterArr = new Array();
	parameterArr.push(['terminal', encodeURIComponent(terminalName)].join('='));
	parameterArr.push(['shop_orderid', order.orderNo].join('='));
	parameterArr.push(['amount', paymentTotal.value.toFixed(2)].join('='));
	parameterArr.push(['currency', currencyCode].join('='));

	// Add language parameter
	var language;
	if(request.locale === 'default') {
		language = 'en';
	} else {
		language = request.locale.indexOf('ru') == 0 ? 'en' : request.locale.substring(0,2);
	}

	parameterArr.push(['language', language].join('='));
	parameterArr.push(['type', 'payment'].join('=')); //See documentation for other payment types.

	// Credit card token:
	if (order.customer.profile != null && order.customer.profile.custom.valitorCreditCardToken != null) {
		parameterArr.push(['ccToken', encodeURIComponent(customer.profile.custom.valitorCreditCardToken)].join('='));
	}

	/*
	// Reconciliation Identifier 
	parameterArr.push(['sale_reconciliation_identifier', 'Insert reconciliation identifier here'].join('='));
	*/
	
	// Add Callback config parameters
	var callBackPipelines = ValitorMgr.getCallbackPipelines();
	if(!empty(callBackPipelines.paymentPage)) {
		parameterArr.push([encodeURIComponent('config[callback_form]'), encodeURIComponent(URLUtils.https(callBackPipelines.paymentPage))].join('='));
	}
	if(!empty(callBackPipelines.paymentSuccess)) {
		parameterArr.push([encodeURIComponent('config[callback_ok]'), encodeURIComponent(URLUtils.https(callBackPipelines.paymentSuccess))].join('='));
	}
	if(!empty(callBackPipelines.paymentFail)) {
		parameterArr.push([encodeURIComponent('config[callback_fail]'), encodeURIComponent(URLUtils.https(callBackPipelines.paymentFail))].join('='));
	}
	if(!empty(callBackPipelines.paymentOpen)) {
		parameterArr.push([encodeURIComponent('config[callback_open]'), encodeURIComponent(URLUtils.https(callBackPipelines.paymentOpen))].join('='));
	}
	if(!empty(callBackPipelines.redirect)) {
		parameterArr.push([encodeURIComponent('config[callback_redirect]'), encodeURIComponent(URLUtils.https(callBackPipelines.redirect))].join('='));
	}
	if(!empty(callBackPipelines.paymentNotification)) {
		parameterArr.push([encodeURIComponent('config[callback_notification]'), encodeURIComponent(URLUtils.https(callBackPipelines.paymentNotification))].join('='));
	}
	
	// Customer config parameters
	parameterArr.push([encodeURIComponent('customer_info[email]'), encodeURIComponent(order.customerEmail)].join('='));
	parameterArr.push([encodeURIComponent('customer_info[username]'), encodeURIComponent(order.customerEmail)].join('='));
	if(order.billingAddress.phone != null && !empty(order.billingAddress.phone)) {
		parameterArr.push([encodeURIComponent('customer_info[customer_phone]'), encodeURIComponent(order.billingAddress.phone)].join('='));
	}
	
	// Billing address parameters
	parameterArr.push([encodeURIComponent('customer_info[billing_firstname]'), encodeURIComponent(order.billingAddress.firstName)].join('='));
	parameterArr.push([encodeURIComponent('customer_info[billing_lastname]'), encodeURIComponent(order.billingAddress.lastName)].join('='));
	parameterArr.push([encodeURIComponent('customer_info[billing_address]'), encodeURIComponent(order.billingAddress.address1)].join('='));
	parameterArr.push([encodeURIComponent('customer_info[billing_postal]'), encodeURIComponent(order.billingAddress.postalCode)].join('='));
	parameterArr.push([encodeURIComponent('customer_info[billing_city]'), encodeURIComponent(order.billingAddress.city)].join('='));
	if(order.billingAddress.stateCode != null && !empty(order.billingAddress.stateCode)) {
		parameterArr.push([encodeURIComponent('customer_info[billing_region]'), encodeURIComponent(order.billingAddress.stateCode)].join('='));
	}
	parameterArr.push([encodeURIComponent('customer_info[billing_country]'), encodeURIComponent(order.billingAddress.countryCode)].join('='));
	
	// Shipping address parameters
	if(isKlarna) {
		// If selected payment method is Klarna use billing address as shipping address to meet requirements to billing and shipping address must be the same 
		parameterArr.push([encodeURIComponent('customer_info[shipping_firstname]'), encodeURIComponent(order.billingAddress.firstName)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_lastname]'), encodeURIComponent(order.billingAddress.lastName)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_address]'), encodeURIComponent(order.billingAddress.address1)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_postal]'), encodeURIComponent(order.billingAddress.postalCode)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_city]'), encodeURIComponent(order.billingAddress.city)].join('='));
		if(order.defaultShipment.shippingAddress.stateCode != null && !empty(order.defaultShipment.shippingAddress.stateCode)) {
			parameterArr.push([encodeURIComponent('customer_info[shipping_region]'), encodeURIComponent(order.billingAddress.stateCode)].join('='));
		}
		parameterArr.push([encodeURIComponent('customer_info[shipping_country]'), encodeURIComponent(order.billingAddress.countryCode)].join('='));

	} else {
		parameterArr.push([encodeURIComponent('customer_info[shipping_firstname]'), encodeURIComponent(order.defaultShipment.shippingAddress.firstName)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_lastname]'), encodeURIComponent(order.defaultShipment.shippingAddress.lastName)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_address]'), encodeURIComponent(order.defaultShipment.shippingAddress.address1)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_postal]'), encodeURIComponent(order.defaultShipment.shippingAddress.postalCode)].join('='));
		parameterArr.push([encodeURIComponent('customer_info[shipping_city]'), encodeURIComponent(order.defaultShipment.shippingAddress.city)].join('='));
		if(order.defaultShipment.shippingAddress.stateCode != null && !empty(order.defaultShipment.shippingAddress.stateCode)) {
			parameterArr.push([encodeURIComponent('customer_info[shipping_region]'), encodeURIComponent(order.defaultShipment.shippingAddress.stateCode)].join('='));
		}
		parameterArr.push([encodeURIComponent('customer_info[shipping_country]'), encodeURIComponent(order.defaultShipment.shippingAddress.countryCode)].join('='));
	}
	
	// Orderlines parameters
	if(order.shipments != null) {
		var lineIndex = 1;
		for(var i in order.shipments) {
			var shipment = order.shipments[i];
			
			// Add shipping
			parameterArr.push([encodeURIComponent('orderLines[0][description]'), encodeURIComponent(Resource.msg('valitor.paymentcreate.shipment', 'valitor', 'Shipment'))].join('='));
			parameterArr.push([encodeURIComponent('orderLines[0][itemId]'), 'shipment'].join('='));
			parameterArr.push([encodeURIComponent('orderLines[0][quantity]'), '1'].join('='));
			parameterArr.push([encodeURIComponent('orderLines[0][unitPrice]'), encodeURIComponent(shipment.adjustedShippingTotalNetPrice)].join('='));
			parameterArr.push([encodeURIComponent('orderLines[0][taxAmount]'), encodeURIComponent(shipment.adjustedShippingTotalTax)].join('='));
			parameterArr.push([encodeURIComponent('orderLines[0][goodsType]'), 'shipment'].join('='));
			
			// Add products
			for(var j in shipment.productLineItems) {
				var productLineItem = shipment.productLineItems[j];
				var unitPrice = productLineItem.adjustedNetPrice.divide(productLineItem.quantityValue);
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][description]'), encodeURIComponent(productLineItem.productName)].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][itemId]'), encodeURIComponent(productLineItem.productID)].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][quantity]'), encodeURIComponent(productLineItem.quantity)].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][unitPrice]'), encodeURIComponent(unitPrice.value.toFixed(2))].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][taxAmount]'), encodeURIComponent(productLineItem.adjustedTax)].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][goodsType]'), 'item'].join('='));
				
				lineIndex++;
			}
			
			// Add non product line discounts
			var totalDiscount = new Money(0.0, order.currencyCode);
			var totalDiscountExclVAT =  new Money(0.0, order.currencyCode);
			if(order.priceAdjustments.length > 0) {
				for(var k in order.priceAdjustments) {
					var pa = order.priceAdjustments[k];
					totalDiscount.add(pa.price.multiply(-1));
					totalDiscountExclVAT.add(pa.netPrice.multiply(-1));
				}
			}
			
			if(order.defaultShipment.adjustedShippingTotalPrice.value != order.shippingTotalPrice.value) {
				totalDiscount.add(order.shippingTotalPrice.subtract(order.defaultShipment.adjustedShippingTotalPrice));
				totalDiscountExclVAT.add(order.shippingTotalNetPrice.subtract(order.defaultShipment.adjustedShippingTotalNetPrice));
			}
	
			if(totalDiscountExclVAT > 0 && !isKlarna) {
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][description]'), encodeURIComponent(Resource.msg('valitor.paymentcreate.handling','valitor','Handling'))].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][itemId]'), 'handling'].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][quantity]'), '1'].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][unitPrice]'), encodeURIComponent(totalDiscountExclVAT.multiply(-1))].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][taxAmount]'), encodeURIComponent(totalDiscountExclVAT.subtract(totalDiscount))].join('='));
				parameterArr.push([encodeURIComponent('orderLines[' + lineIndex + '][goodsType]'), 'handling'].join( '=' ) );
			}
		}
	}
	
	// Add Order token
	parameterArr.push(['transaction_info[demandware_order_token]', order.getOrderToken()].join('='));
	
	// Cookies
	var cookies = request.httpCookies;
	var cookieArr = new Array();
	for(var l in cookies) {
		var cookie = cookies[l];
		cookieArr.push( [ cookie.name, cookie.value ].join( '=' ) );
	}

	var cookieString = cookieArr.join(';');
	parameterArr.push(['cookie', encodeURIComponent(cookieString)].join('='));
	
	var parameters = parameterArr.join('&');
	Logger.debug('Creation of parameters succeeded.');
	args.Parameters = parameters;
}