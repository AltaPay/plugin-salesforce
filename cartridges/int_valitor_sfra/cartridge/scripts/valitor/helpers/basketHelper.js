'use strict';


/**
 * Creates a basket from an existing order for the purposes of handling customers who has left payment page
 * without completing the payment transaction successfully.
 * @param {dw.order.Order} order - order used to create new basket 
 */
function recoverBasketFromOrder(order){
	var Transaction = require('dw/system/Transaction');
	var BasketMgr = require('dw/order/BasketMgr');
	var HookMgr = require('dw/system/HookMgr');
    
	var currentBasket = BasketMgr.getCurrentOrNewBasket(); 

	Transaction.wrap(function() {
		var productLineItems = order.getAllProductLineItems();
		var couponLineItems = order.getCouponLineItems();
		copyProductLineItems(productLineItems, currentBasket);
		copyCouponLineItems(couponLineItems, currentBasket);
		copyShippingAndBillingAddress(currentBasket, order);
		copyShippingMethod(currentBasket, order);

        // Calculate the basket
		HookMgr.callHook('dw.order.calculate', 'calculate', currentBasket);
	});
}

/**
 * Copies all product lineitems from the order to the basket
 * @param {Collection} productLineItems - All productlineItems from the order
 * @param {dw.order.Basket} currentBasket - the current basket
 */
function copyProductLineItems(productLineItems, currentBasket){
	var collections = require('*/cartridge/scripts/util/collections');
	collections.forEach(productLineItems, function (pli) {
		var productLineItem = currentBasket.createProductLineItem(pli.productID, currentBasket.defaultShipment);
		productLineItem.setQuantityValue(pli.quantityValue);
	});
}

/**
 * Copies all coupon lineitems from the order to the basket
 * @param {Collection} couponlineItems - All couponlineItems from the order
 * @param {dw.order.Basket} currentBasket - the current basket
 */
function copyCouponLineItems(couponlineItems, currentBasket){
	var collections = require('*/cartridge/scripts/util/collections');
	collections.forEach(couponlineItems, function (cli) {
		currentBasket.createCouponLineItem(cli.couponCode, true);
	});
}


/**
 * Copies the shipping and billing address from the order to the basket
 * @param {dw.order.Basket} currentBasket - the current basket
 * @param {dw.order.Order} order - the current order
 */
function copyShippingAndBillingAddress(currentBasket, order){
	var shipment = currentBasket.defaultShipment;
	var billingAddress = currentBasket.billingAddress;
	var shippingAddress = shipment.shippingAddress;
    
	var orderBillingAddress = order.getBillingAddress();
	var orderShippingAddress = order.defaultShipment.shippingAddress;

	if (!billingAddress) {
		billingAddress = currentBasket.createBillingAddress();
	}
    
	billingAddress.setFirstName(orderBillingAddress.firstName ? orderBillingAddress.firstName : '');
	billingAddress.setLastName(orderBillingAddress.lastName ? orderBillingAddress.lastName : '');
	billingAddress.setAddress1(orderBillingAddress.address1 ? orderBillingAddress.address1 : '');
	billingAddress.setAddress2(orderBillingAddress.address2 ? orderBillingAddress.address2 : '');
	billingAddress.setCity(orderBillingAddress.city ? orderBillingAddress.city : '');
	billingAddress.setPostalCode(orderBillingAddress.postalCode ? orderBillingAddress.postalCode : '');
	billingAddress.setCountryCode(orderBillingAddress.countryCode ? orderBillingAddress.countryCode : '' );
	billingAddress.setPhone(orderBillingAddress.phone ? orderBillingAddress.phone : '');

	if (shippingAddress === null) {
		shippingAddress = shipment.createShippingAddress();
	}

	shippingAddress.setFirstName(orderShippingAddress.firstName ? orderShippingAddress.firstName : '');
	shippingAddress.setLastName(orderShippingAddress.lastName ? orderShippingAddress.lastName : '');
	shippingAddress.setAddress1(orderShippingAddress.address1 ? orderShippingAddress.address1 : '');
	shippingAddress.setAddress2(orderShippingAddress.address2 ? orderShippingAddress.address2 : '');
	shippingAddress.setCity(orderShippingAddress.city ? orderShippingAddress.city : '');
	shippingAddress.setPostalCode(orderShippingAddress.postalCode ? orderShippingAddress.postalCode : '');
	shippingAddress.setCountryCode(orderShippingAddress.countryCode ? orderShippingAddress.countryCode : '');
	shippingAddress.setPhone(orderBillingAddress.phone ? orderBillingAddress.phone : '');
}

/**
 * Copies the selected shipping method from from the order to the basket
 * @param {dw.order.Basket} currentBasket - the current basket
 * @param {dw.order.Order} order - the current order
 */
function copyShippingMethod(currentBasket, order){
	var shipment = currentBasket.defaultShipment;
	shipment.setShippingMethod(order.defaultShipment.shippingMethod);
}

module.exports = {
	recoverBasketFromOrder: recoverBasketFromOrder
}