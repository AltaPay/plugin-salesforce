'use strict';
/**
 * Special authorization handling conserning Klarna payments only.
 * @param {Object} args - Parameters
 * @param {string} args.XMLString - Valitor Transaction Response
 * @returns {dw.system.Status} - OK or ERROR 
 */
exports.execute = function(args) {
	var Transaction = require('dw/system/Transaction');
	var Status 	= require('dw/system/Status');
	var RESULT_SUCCESS = 'Success',
		RESULT_SUCCEEDED = 'Succeeded',
		RESULT_SUCCEEDED_LOWERCASE = 'succeeded',
		RESULT_OPEN = 'Open';

	if (args.XMLString != null && !empty(args.XMLString)) {
		var xml_obj = new XML(args.XMLString),
			result = encodeURIComponent(xml_obj.Body.Result);
        
		if(xml_obj.Header.ErrorCode == '0' || result.equals(RESULT_SUCCESS) || result.equals(RESULT_SUCCEEDED) || result.equals(RESULT_SUCCEEDED_LOWERCASE || result.equal(RESULT_OPEN))) {
            
			if (xml_obj.Body.Transactions != null && !empty(xml_obj.Body.Transactions.Transaction.CustomerInfo.toString()) && !empty(xml_obj.Body.Transactions.Transaction.CustomerInfo.RegisteredAddress.toString())) {
				var shippingAddress = args.Order.defaultShipment.shippingAddress,
					registeredAddressXML = xml_obj.Body.Transactions.Transaction.CustomerInfo.RegisteredAddress;
                
				// Check if Valitor response xml contains a RegisteredAddress. Somethime it does not.
				// ==================================================================================
				if (registeredAddressXML != null && !empty(registeredAddressXML.Address.toString())) {
                    
					Transaction.wrap(function(){
						shippingAddress.setAddress1(registeredAddressXML.Address.toString());
						shippingAddress.setCity(registeredAddressXML.City.toString());
						shippingAddress.setCountryCode(registeredAddressXML.Country.toString());
						shippingAddress.setFirstName(registeredAddressXML.Firstname.toString());
						shippingAddress.setLastName(registeredAddressXML.Lastname.toString());
						shippingAddress.setPostalCode(registeredAddressXML.PostalCode.toString());
                        
						// Flush these value, since Klarna response does not support them.
						// ===============================================================
						shippingAddress.setAddress2( '' );
						shippingAddress.setCompanyName( '' );
					});
				}      
			}
			return new Status(Status.OK);
		}    
	}
    
	return new Status(Status.ERROR);
}