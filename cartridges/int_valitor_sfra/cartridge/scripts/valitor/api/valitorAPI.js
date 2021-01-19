'use strict';

var Logger 		= require('dw/system/Logger').getLogger('Valitor', 'Valitor');
var service 	= require('../services/valitorWebservice');
var libValitor  = require('~/cartridge/scripts/valitor/libValitor');

/**
 * Test the connection to the Valitor Gateway.
 *  @returns {Object} Response object indicating if connection can be established  
 */
function testConnection() {
	var ValitorMgr = libValitor.getValitorMgr();
	Logger.debug('valitorAPI - testConnection - Test Connection start.');
	var url = ValitorMgr.getGatewayURL() + ValitorMgr.TEST_CONNECTION_URL,
		requestObject = {
			url: url,
			requestMethod: 'GET',
		};

	Logger.debug('valitorAPI - testConnection - Make request to Valitor.');
	try {
		var response = service.createRequest(requestObject);
		if(response.ok){
			Logger.debug('valitorAPI - testConnection - Connection to Valitor succeeded.');
			return {
				error: false,
				connected: true
			}
		}

		Logger.error('valitorAPI - testConnection - Connection to Valitor couldn\'t be established. Error message: ' + response.errorMessage);
		return {
			error: true,
			errorMessage: 'Connection to Valitor couldn\'t be established. Error message: ' + response.errorMessage
		}
	} catch(e) {
		Logger.error('valitorAPI - testConnection - General Error due to exception. Error message: ' + e.message);
		return {
			error: true,
			errorMessage: 'General Error due to exception. Error message: ' + e.message
		}
	}
}

/**
 * Test that credentials is valid
 * @returns {Object} Response object indicating if credentials is valid  
 */
function testAuthentication() {
	var ValitorMgr = libValitor.getValitorMgr();
	Logger.debug('valitorAPI - testAuthentication - Test Authentication start.');
	var	url = ValitorMgr.getGatewayURL() + ValitorMgr.LOGIN_URL,
		requestObject = {
			url: url,
			credentials: getCredentials(),
			requestMethod: 'GET',
		};

	Logger.debug('valitorAPI - testAuthentication - Make request to Valitor.');
	try {
		var response = service.createRequest(requestObject);
		if(response.ok){
			Logger.debug('valitorAPI - testAuthentication - Login to Valitor finished successfully.');
			return {
				error: false,
				authenticated: true
			}
		}
		Logger.error('valitorAPI - testAuthentication - Login to Valitor finished unsuccessfully! Error message: ' + response.errorMessage);
		return {
			error: true,
			authenticated: false
		}
	} catch(e) {
		Logger.error('valitorAPI - testAuthentication - General Error due to exception. Error message: ' + e.message);
		return {
			error: true,
			authenticated: false
		}
	}
}

/**
 * Capture payment reservation
 * @param {dw.order.Order} order - the current order where the payment reservation must be captured
 * @returns {Object} Response object indicating if capture of payment reservation has succeeded  
 */
function captureReservation(order) {
	var ValitorMgr = libValitor.getValitorMgr();
	Logger.debug('valitorAPI - captureReservation - Capture Reservation start.');

	var	url = ValitorMgr.getGatewayURL() + ValitorMgr.CAPTURE_RESERVATION_URL;
	
	//Create parameters
	Logger.debug('valitorAPI - captureReservation - Create parameters for capture payment request.');
	var parameterArr = new Array();
	parameterArr.push(['transaction_id', encodeURIComponent(order.custom.valitorTransactionID)].join('='));
	//Add products
	for(var i = 0; i < order.productLineItems.length; i++) {
		var productLineItem = order.productLineItems[i];
		var unitPrice = productLineItem.adjustedNetPrice / productLineItem.quantity;
		parameterArr.push([encodeURIComponent('orderLines[' + i + '][description]'), encodeURIComponent(productLineItem.productName)].join('='));
		parameterArr.push([encodeURIComponent('orderLines[' + i + '][itemId]'), encodeURIComponent(productLineItem.productID)].join('='));
		parameterArr.push([encodeURIComponent('orderLines[' + i + '][quantity]'), encodeURIComponent(productLineItem.quantity)].join('='));
		parameterArr.push([encodeURIComponent('orderLines[' + i + '][unitPrice]'), encodeURIComponent(unitPrice.toFixed(2))].join('='));
		parameterArr.push([encodeURIComponent('orderLines[' + i + '][taxAmount]'), encodeURIComponent(productLineItem.adjustedTax)].join('='));
		parameterArr.push([encodeURIComponent('orderLines[' + i + '][goodsType]'), 'item'].join('='));
	}
	
	var parameters = parameterArr.join('&'),
		requestObject = {
			url: url,
			credentials: getCredentials(),
			requestMethod: 'POST',
			requestBody: parameters
		};

	Logger.debug('valitorAPI - captureReservation - Make request to Valitor.');
	try {
		var response = service.createRequest(requestObject);
		
		if(response.ok){
			Logger.debug('valitorAPI - captureReservation - Payment capture finished successfully.');
			
			var xmlObj = new XML(response.object);
			return {
				error: false,
				response: xmlObj,
			}
		}

		var errorMessage = response.errorMessage;
		Logger.error('valitorAPI - captureReservation - Capture request to Valitor finished unsuccessfully! Error message: ' + errorMessage);

		if(errorMessage.indexOf('SocketTimeoutException') > -1){
			errorMessage = 'Capture request to Valitor finished unsuccessfully! Error message: Connection Timed Out.';
		}

		return {
			error: true,
			errorMessage: errorMessage
		}

	} catch(e) {
		Logger.error('valitorAPI - captureReservation - General Error due to exception. Error message: ' + e.message);
		return {
			error: true,
			errorMessage: e.message
		}
	}
}

/**
 * Release payment reservation
 * @param {string} transactionID -ID of transaction that must be released
 * @returns {Object} Response object indicating if release of payment reservation has succeeded  
 */
function releaseReservation(transactionID) {
	var ValitorMgr = libValitor.getValitorMgr();
	Logger.debug('valitorAPI - releaseReservation - Release Reservation start.');
	var	url = ValitorMgr.getGatewayURL() + ValitorMgr.RELEASE_RESERVATION_URL;
	
	//Create parameters
	Logger.debug('valitorAPI - releaseReservation - Create parameters for release payment request.');
	var parameterArr = new Array();
	parameterArr.push(['transaction_id', encodeURIComponent(transactionID)].join('='));
	
	var parameters = parameterArr.join('&'),
		requestObject = {
			url: url,
			credentials: getCredentials(),
			requestMethod: 'POST',
			requestBody: parameters
		};

	Logger.debug('valitorAPI - releaseReservation - Make request to Valitor.');
	try {
		var response = service.createRequest(requestObject);
		if(response.ok){
			Logger.debug('valitorAPI.releaseReservation - Release of payment reservation finished successfully.');
			var xml_obj = new XML(response.object);
			return {
				error: false,
				response: xml_obj,
			}
		}
		Logger.error('valitorAPI releaseReservation - Release payment request to Valitor finished unsuccessfully! Error message: ' + response.errorMessage);
		return {
			error: true,
		}
	} catch (e) {
		Logger.error('valitorAPI - releaseReservation - General Error due to exception. Error message: ' + e.message);
		return {
			error: true,
		}
	}
}

/**
 * Get credentials for Valitor Authentication
 * @returns {string} Credentials in base64 encoded string  
 */
function getCredentials() {
	var ValitorMgr = libValitor.getValitorMgr();
	var StringUtils = require('dw/util/StringUtils'),
		username = ValitorMgr.getUsername(),
		password = ValitorMgr.getPassword();

	return StringUtils.encodeBase64(username + ':' + password);
}

module.exports = {
	testConnection: testConnection,
	testAuthentication: testAuthentication,
	captureReservation: captureReservation,
	releaseReservation: releaseReservation
}