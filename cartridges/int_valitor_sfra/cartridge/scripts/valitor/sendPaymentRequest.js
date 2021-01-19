'use strict';

/**
 * Perform Valitor createPayment request. If the request is succesfully completed, the URL
 * for the Valitor payment page will be stored on the args object
 * @param {Object} args - Parameters
 * @param {dw.order.Order} args.Order - Current Order
 * @param {string} args.Parameters - Create Payment Request Parameters
 */
exports.execute = function(args) {
	var StringUtils = require('dw/util/StringUtils'),
		Logger 	   = require('dw/system/Logger').getLogger('Valitor', 'Valitor');
        
	var libValitor = require('./libValitor'),
		ValitorMgr = libValitor.getValitorMgr(),
		service = require('./services/valitorWebservice');
	
	// Make URL for createPayment request
	// ===============================================================	
	var url = StringUtils.format('{0}{1}', ValitorMgr.getGatewayURL(), ValitorMgr.CREATE_PAYMENT_REQUEST_URL);
	Logger.debug('URL to create payment request: "{0}"', url); 
	
	// Make payment request to Valitor
	// ===============================================================
	Logger.debug('Make payment request to Valitor.');
	try {
		var username = ValitorMgr.getUsername(),
			password = ValitorMgr.getPassword(),
			requestObject = {
				url: url,
				credentials: StringUtils.encodeBase64(username + ':' + password),
				requestMethod: 'POST',
				requestBody: args.Parameters
			};
		
		var response = service.createRequest(requestObject);
        
		if(response.ok) {
			Logger.debug('Payment request completed.');
			var xml_obj = new XML(response.object);
			
			if(xml_obj.Header.ErrorCode == '0') {
				// URL to Valitor payment page
				// ===============================================================
				args.CreatePaymentURL = xml_obj.Body.Url.toString();

			} else {
				Logger.error("Valitor error during create payment request. ErrorCode=" + xml_obj.Header.ErrorCode + ", ErrorMessage=" + xml_obj.Header.ErrorMessage);
				if(xml_obj.Header.ErrorMessage.toLowerCase().indexOf('terminal') !== -1) {
					Logger.error("Valitor Error - Terminal ID =" + args.TerminalID + ", terminal name = " + args.TerminalID);
				}
			}
		} else {
			Logger.error("Valitor error during create payment request. HTTPService.status=" + response.status + ", HTTPService.status.errorMessage=" + response.errorMessage);
		}
	} catch(e) {
        var test = e;
		Logger.error("Valitor error during create payment request.", e);
	}
}