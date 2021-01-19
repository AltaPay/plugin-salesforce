'use strict'
/**
 * Get ValitorMgr that contains all relevant information
 * @returns {Object} - ValitorMgr 
 */
exports.getValitorMgr = function() {
	return (function () {

		//=======================================================
		// Private variables
		//=======================================================
		var Site = require('dw/system/Site'),
			baseProductionURL = Site.getCurrent().getCustomPreferenceValue('valitorBaseProductionURL'),
			baseTestURL = Site.getCurrent().getCustomPreferenceValue('valitorBaseTestURL'),
			password = Site.getCurrent().getCustomPreferenceValue('valitorPassword'),
			passwordTest = Site.getCurrent().getCustomPreferenceValue('valitorTestPassword'),
			paymentPagePipeline = Site.getCurrent().getCustomPreferenceValue('valitorPaymentPagePipeline'),
			paymentSuccessPipeline = Site.getCurrent().getCustomPreferenceValue('valitorPaymentSuccessPipeline'),
			paymentFailPipeline	= Site.getCurrent().getCustomPreferenceValue('valitorPaymentFailPipeline'),
			paymentOpenPipeline	= Site.getCurrent().getCustomPreferenceValue('valitorPaymentOpenPipeline'),
			paymentNotificationPipeline = Site.getCurrent().getCustomPreferenceValue('valitorPaymentNotificationPipeline'),
			redirectPipeline = Site.getCurrent().getCustomPreferenceValue('valitorRedirectPipeline'),
			terminalsConfig = Site.getCurrent().getCustomPreferenceValue('valitorTerminals'),
			testMode = Site.getCurrent().getCustomPreferenceValue('valitorTestMode'),
			timeout	= Site.getCurrent().getCustomPreferenceValue('valitorTimeout'),
			username = Site.getCurrent().getCustomPreferenceValue('valitorUsername'),
			usernameTest = Site.getCurrent().getCustomPreferenceValue('valitorTestUsername');
			
		//=======================================================
		// Private functions
		//=======================================================
		
		/**
		* Private function to find Valitor Terminals for the current locale and currency
		* @returns {dw/util/HashMap} - Valitor Terminals for the current locale and currency
		*/
		var getValitorTerminalForCurrentLocale = function() {
			var map = new dw.util.HashMap();
			
			var terminalsString = terminalsConfig;
			if(terminalsString == null || empty(terminalsString)) { return map; }
			
			var jsonTerminals = JSON.parse(terminalsString),
				terminals = jsonTerminals.terminals;
			if(terminals == null) { return map; }
			
			var envTerminals = terminals[testMode == true ? 'test' : 'production'];
			if(envTerminals == null) { return map; }
			
			var localeTerminals = envTerminals[request.locale];
			if(localeTerminals == null) {
				localeTerminals = [];
				for(var currency in envTerminals) {
					var currencyTerminals = envTerminals[currency];
					for(var i in currencyTerminals) {
						if(empty(currencyTerminals[i].allowedlocales)) continue;
						if(currencyTerminals[i].allowedlocales.indexOf(request.locale) !== -1) {
							localeTerminals.push(currencyTerminals[i]);
						}
					}
				}
				if(empty(localeTerminals)) {			
					return map; 
				}
			}
			
			for(var j in localeTerminals) {
				var terminal = localeTerminals[j];
				if(!map.containsKey(terminal.id)) {
					map.put(terminal.id, terminal.name);
				}
			}
			
			return map;
		};

		return {
	
			//=======================================================
			// Public variables
			//=======================================================
			CAPTURE_RESERVATION_URL: "/merchant/API/captureReservation",
			CREATE_PAYMENT_REQUEST_URL: "/merchant/API/createPaymentRequest",
			FRAUDCHECK : true,
			LOGIN_URL: "/merchant/API/login",
			RELEASE_RESERVATION_URL: "/merchant/API/releaseReservation",
			TEST_CONNECTION_URL: "/merchant/API/testConnection",
			TESTMODE: testMode ? true : false,
	
			//=======================================================
			// Public functions
			//=======================================================
	
			/**
			* Gets the Valitor Payment Instrument for the current LineItemCtnr.
			* @param {dw.order.LineItemCtnr} lineItemCtnr - the current basket
			* @returns {dw.order.OrderPaymentInstrument} OrderPaymentInstrument
			*/
			getValitorPaymentInstrument : function(lineItemCtnr) {
				if(!empty(lineItemCtnr)) {
					var paymentInstruments = lineItemCtnr.getPaymentInstruments();
					for (var i in paymentInstruments) {
						var paymentInstrument = paymentInstruments[i];
						if (paymentInstrument.paymentMethod.indexOf('VALITOR_') == 0 ) {
							return paymentInstrument;
						}
					}
				}
				return null;
			},
	
			/**
			 * Get All Payment Callback Pipelines
			 * @returns {Object} - Pipelines
			 */
			getCallbackPipelines: function() {
				return {
					paymentPage : paymentPagePipeline,
					paymentSuccess : paymentSuccessPipeline,
					paymentFail	: paymentFailPipeline,
					paymentOpen	: paymentOpenPipeline,
					paymentNotification : paymentNotificationPipeline,
					redirect : redirectPipeline
				}
			},
	
			/**
			 * Get URL to Valitor Gateway
			 * @returns {string} - Gateway URL
			 */
			getGatewayURL: function() {
				return testMode ? baseTestURL : baseProductionURL;
			},
	
			/**
			 * Get Password to Valitor Gateway
			 * @returns {string} - Password
			 */
			getPassword: function() {
				return testMode ? passwordTest : password;
			},
	
			/**
			 * Get Username to Valitor Gateway
			 * @returns {string} - Username
			 */
			getUsername: function() {
				return testMode ? usernameTest : username;
			},
	
			/**
			 * Get Valitor terminals for current locale and currency
			 * @returns {string} - Username
			 */
			getTerminals: function() {
				return getValitorTerminalForCurrentLocale();
			},
	
			/**
			 * Get timeout for Valitor Gateway
			 * @returns {string} - timeout
			 */
			getTimeout: function() {
				return timeout;
			}
		}
	})();
} 