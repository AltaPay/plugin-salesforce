'use strict';

/**
 * Update the message which will be presented to the customer, when the payment hasn't been verified
 * @param {Object} args - Parameters
 * @param {boolean} args.OrderConfirmed - Is the Payment Authorization verified
 */
exports.execute = function(args) {
	var Resource = require('dw/web/Resource');
	if(!args.OrderConfirmed) {
		var openMessage = Resource.msg('valitor.msg.payment.open', 'valitor', null);
		args.openMessage = openMessage;
	}
}
