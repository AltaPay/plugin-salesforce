'use strict';

/**	
* Save credit card token on the customer profile SFCC if requested by customer on the payment page.
* @param {Object} args - Parameters
* @param {string} args.CallbackParams - Valitor Callback Parameters
*/
exports.execute = function(args) {
	var Logger = require('dw/system/Logger').getLogger('Valitor', 'Valitor');
	var Transaction = require('dw/system/Transaction');

	try {

		if(args.CallbackParams.nature != 'CreditCard') {
			return;
		}
        
		var transactionInfoSaveCreditcard = args.CallbackParams['transaction_info[savecreditcard]'];
		var saveCreditCard = transactionInfoSaveCreditcard == 1 ? true : false; 
        
		if(saveCreditCard && customer.profile) {
			Transaction.wrap(function(){
				customer.profile.custom.valitorCreditCardToken = args.CallbackParams.credit_card_token;
			})
		}

	} catch(e) {
		Logger.error('Valitor - saveCreditCardToken - General error due to exception. Error message: {0}.', e.message);
	}
}