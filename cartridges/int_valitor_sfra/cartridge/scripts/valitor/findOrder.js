'use strict';

/**	
* Find SFFC orderNo from AltPay XML response.
* @param {Object} args - Parameters
* @param {string} args.XMLString - Valitor Transaction Response
*/
exports.execute = function(args) {
	var Logger = require('dw/system/Logger').getLogger('Valitor', 'Valitor');
	try {
		if(args.XMLString != null && !empty(args.XMLString)) {
			var xml_obj = new XML(args.XMLString);
			args.orderId = encodeURIComponent(xml_obj.Body.Transactions.Transaction.ShopOrderId);
		}
	} catch(e) {
		Logger.error('Valitor - findOrder - General error due to exception. Error message: {0}.', e.message);
	}
}