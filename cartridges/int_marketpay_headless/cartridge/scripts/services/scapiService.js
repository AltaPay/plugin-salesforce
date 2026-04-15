'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
var Site = require('dw/system/Site');

/**
 * Get SLAS credentials from site preferences
 */
function getSLASCredentials() {
    return {
        organizationId: Site.current.getCustomPreferenceValue('marketPayOrganizationID'),
        shortCode: Site.current.getCustomPreferenceValue('marketPayOrganizationShortCode'),
        siteId: Site.current.ID
    };
}

/**
 * Get guest access token using SLAS
 * @returns {Object} { access_token, token_type, expires_in, refresh_token, usid, customer_id, enc_user_id, idp_access_token }
 */
function getGuestAccessToken() {
    var slasCredentials = getSLASCredentials();

    if (!slasCredentials.organizationId) {
        Logger.error('SLAS credentials not configured in site preferences');
        return null;
    }

    var service = LocalServiceRegistry.createService('int.marketpay.slas', {
        createRequest: function (svc, params) {
            const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
            const credentials = svc.getConfiguration().getCredential();
            svc.setRequestMethod('POST');
            // Set headers
            svc.addHeader('Content-Type', 'application/x-www-form-urlencoded');
            svc.addHeader('Authorization', marketPayDataHelper.getBasicAuthHeader(credentials.getUser(), credentials.getPassword()));

            // Replace URL placeholders
            var url = svc.getURL();
            url = url.replace('{shortcode}', params.shortCode);
            url = `${url}/shopper/auth/v1/organizations/${params.organizationId}/oauth2/token`;        
            svc.setURL(url);

            // Build form data for guest login
            var formData = [];
            formData.push('grant_type=client_credentials');
            formData.push('channel_id=' + params.siteId);

            return formData.join('&');
        },

        parseResponse: function (svc, client) {

            if (client.statusCode === 200) {
                return JSON.parse(client.text);
            }

            return null;
        },

        filterLogMessage: function (msg) {
            // Remove sensitive data from logs
            return msg.replace(/Authorization: Basic [^\s]+/g, 'Authorization: Basic ***')
                .replace(/client_secret=[^&]+/g, 'client_secret=***')
                .replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"***"')
                .replace(/"refresh_token"\s*:\s*"[^"]+"/g, '"refresh_token":"***"')
                .replace(/"enc_user_id"\s*:\s*"[^"]+"/g, '"enc_user_id":"***"');
        }
    });

    try {
        var result = service.call(slasCredentials);

        if (result.ok && result.object) {
            return result.object;
        } else {
            Logger.error('SLAS guest login failed: ' + result.errorMessage);
            return null;
        }
    } catch (e) {
        Logger.error('SLAS guest login exception: ' + e.message);
        return null;
    }
}

/**
 * Create checkout session via custom SCAPI
 * @param {Object} orderData - Order data
 * @param {Object} configuration - Payment configuration
 * @param {Object} customParams - Custom query parameters
 * @returns {Object} Service result
 */
function createMarketPaySession(customerID, requestBody) {
    var service = LocalServiceRegistry.createService('int.marketpay.slas', {
        createRequest: function (svc, params) {
            svc.setRequestMethod('POST');
            svc.addHeader('Content-Type', 'application/json');

            // Get access token
            var token = getGuestAccessToken();
            if (!token) {
                throw new Error('Unable to obtain access token');
            }
            // Add authorization header
            svc.addHeader('Authorization', 'Bearer ' + token.access_token);

            // Replace URL placeholders
            var credentials = getSLASCredentials();
            var url = svc.getURL();
            url = url.replace('{shortcode}', credentials.shortCode);
            url = `${url}/custom/marketpay/v1/organizations/${credentials.organizationId}/checkoutsession`;

            // Build query parameters
            var queryParams = [];
            queryParams.push('siteId=' + encodeURIComponent(params.siteId));
            queryParams.push('c_customerId=' + encodeURIComponent(params.customerID));

            var urlWithParams = url + '?' + queryParams.join('&');
            svc.setURL(urlWithParams);

            return JSON.stringify(params.requestBody);
        },
        parseResponse: function (svc, client) {
            if (client.statusCode === 200 || client.statusCode === 201) {
                return JSON.parse(client.text);
            }

            return null;
        },
        filterLogMessage: function (msg) {
            // Remove token from logs
            return msg.replace(/Bearer [^\s]+/g, 'Bearer ***');
        }
    });

    try {
        var result = service.call({
            siteId: Site.current.ID,
            customerID: customerID,
            requestBody: requestBody
        });

        if (result.ok) {
            return true;
        } else {
            Logger.error('Checkout session creation failed: ' + result.errorMessage);
            return false;
        }
    } catch (e) {
        Logger.error('Checkout session exception: ' + e.message + '\n' + e.stack);
        return false;
    }
}

function fetchAndUpdatePaymentStatus(orderId) {

    var service = LocalServiceRegistry.createService('int.marketpay.slas', {
        createRequest: function (svc, params) {
            svc.setRequestMethod('POST');
            svc.addHeader('Content-Type', 'application/json');

            // Get access token
            var token = getGuestAccessToken();
            if (!token) {
                throw new Error('Unable to obtain access token');
            }
            // Add authorization header
            svc.addHeader('Authorization', 'Bearer ' + token.access_token);
        
            // Replace URL placeholders
            var credentials = getSLASCredentials();
            var url = svc.getURL();
            url = url.replace('{shortcode}', credentials.shortCode);            
            url = `${url}/custom/marketpay/v1/organizations/${credentials.organizationId}/paymentstatus`;

            // Build query parameters
            var queryParams = [];
            queryParams.push('siteId=' + encodeURIComponent(params.siteId));
            queryParams.push('c_orderId=' + encodeURIComponent(params.orderId));

            var urlWithParams = url + '?' + queryParams.join('&');
            svc.setURL(urlWithParams);

            return "";
        },
        parseResponse: function (svc, client) {
            if (client.statusCode === 200 || client.statusCode === 201) {
                return JSON.parse(client.text);
            }

            return null;
        },
        filterLogMessage: function (msg) {
            // Remove token from logs
            return msg.replace(/Bearer [^\s]+/g, 'Bearer ***');
        }
    });

    try {
        var result = service.call({
            siteId: Site.current.ID,            
            orderId: orderId            
        });

        if (result.ok) {
            return true;
        } else {
            Logger.error('No Payment Info founds for the order: ' + result.errorMessage);
            return false;
        }
    } catch (e) {
        Logger.error('No Payment Info founds for the order: ' + e.message + '\n' + e.stack);
        return false;
    }
}

module.exports = {
    getGuestAccessToken: getGuestAccessToken,
    createMarketPaySession: createMarketPaySession,
    fetchAndUpdatePaymentStatus: fetchAndUpdatePaymentStatus
};