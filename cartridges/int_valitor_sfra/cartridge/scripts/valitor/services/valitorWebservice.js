'use strict';
var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
/**
 * Represents an HTTP Service.
 * @private
 * @typedef {dw.svc.Service} service
 */
var httpService = LocalServiceRegistry.createService('int_valitor.service', {
	createRequest: function (service, params) {
		service.setURL(params.url);
		service.setRequestMethod(params.requestMethod);
		service.setAuthentication('NONE');
		service.addHeader('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8');
		service.addHeader('Authorization', 'Basic ' + params.credentials);
		if(params.requestMethod == 'POST' && params.requestBody){
			return params.requestBody;
		}
		return;
	},
	parseResponse: function (service, httpClient) {
		return httpClient.getText();
	},
	mockCall: function (service) {
		return {
			statusCode: 200,
			statusMessage: 'Success',
			text: 'MOCK RESPONSE (' + service.URL + ')'
		};
	},
	filterLogMessage: function (msg) {
		return msg.replace('headers', 'OFFWITHTHEHEADERS');
	},
	getRequestLogMessage: function (request) {
		return !empty(request) ? request.toString() : 'Request is null.';
	},
	getResponseLogMessage: function (response) {
		return !empty(response) ? response.toString() : 'Response is null.';
	}
});

/**
 * Create HTTP Service call to Valitor
 * @param {Object} params - Parameters
 * @param {stinrg} params.url - Url to API Endpoint at Valitor
 * @param {Object} params.credentials - Credentials to Valitor
 * @param {Object} params.requestBody - Request parameters
 * @returns {dw.svc.Result} response 
 */
exports.createRequest = function(params){
	return httpService.call(params);
};


