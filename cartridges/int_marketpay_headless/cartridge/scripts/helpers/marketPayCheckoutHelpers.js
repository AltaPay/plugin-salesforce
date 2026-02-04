'use strict';

var OrderMgr = require('dw/order/OrderMgr');
var Status = require('dw/system/Status');
var Transaction = require('dw/system/Transaction');
var Logger = require('dw/system/Logger');

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

		Transaction.commit();
	} catch (e) {
		Logger.getLogger('Valitor').error('CheckoutHelpers.PlaceOrder failed for orderNo: {0}. Error message: {1}' , order.orderNo, e.message);
		Transaction.rollback();

		return new Status(Status.ERROR);
	}

	return new Status(Status.OK);
}

module.exports = {
	placeOrder: placeOrder
};
