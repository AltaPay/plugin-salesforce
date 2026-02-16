'use strict';

var LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
var Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');
var Site = require('dw/system/Site');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');

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
    var credentials = getSLASCredentials();

    if (!credentials.organizationId) {
        Logger.error('SLAS credentials not configured in site preferences');
        return null;
    }

    var service = LocalServiceRegistry.createService('int.marketpay.slas', {
        createRequest: function (svc, params) {
            svc.setRequestMethod('POST');

            const credentials = svc.getConfiguration().getCredential();
            const clientId = credentials.getUser();
            const clientSecret = credentials.getPassword();

            // Set headers
            svc.addHeader('Content-Type', 'application/x-www-form-urlencoded');
            svc.addHeader('Authorization', getBasicAuthHeader(clientId, clientSecret));

            // Replace URL placeholders
            var url = svc.getURL();
            url = url.replace('{shortcode}', params.shortCode);
            url = url.replace('{orgId}', params.organizationId);
            svc.setURL(url);

            // Build form data for guest login
            var formData = [];
            formData.push('grant_type=client_credentials');
            formData.push('channel_id=' + params.siteId);
            //formData.push('scope=SALESFORCE_COMMERCE_API:' + params.organizationId + ' sfcc.shopper-baskets-orders sfcc.shopper-customers.login sfcc.shopper-myaccount.baskets sfcc.shopper-myaccount.orders');

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
                .replace(/client_secret=[^&]+/g, 'client_secret=***');
        }
    });

    try {
        var result = service.call(credentials);

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
 * Generate Basic Auth header
 */
function getBasicAuthHeader(clientId, clientSecret) {
    var credentials = clientId + ':' + clientSecret;
    var credentialsBytes = new Bytes(credentials);
    var encodedCredentials = Encoding.toBase64(credentialsBytes);
    return 'Basic ' + encodedCredentials;
}

/**
 * Create checkout session via custom SCAPI
 * @param {Object} orderData - Order data
 * @param {Object} configuration - Payment configuration
 * @param {Object} customParams - Custom query parameters
 * @returns {Object} Service result
 */
function createMarketPaySession(customerID, requestBody) {
    var service = LocalServiceRegistry.createService('int.marketpay.custom', {
        createRequest: function (svc, params) {
            svc.setRequestMethod('POST');
            svc.addHeader('Content-Type', 'application/json');

            // Get access token
            var token = getGuestAccessToken();
            if (!token) {
                throw new Error('Unable to obtain access token');
            }

            Logger.info("access Token: " + token.access_token);
            // Add authorization header
            svc.addHeader('Authorization', 'Bearer ' + token.access_token);

            // Replace URL placeholders
            var credentials = getSLASCredentials();
            var url = svc.getURL();
            url = url.replace('{shortcode}', credentials.shortCode);
            url = url.replace('{orgId}', credentials.organizationId);

            // Build query parameters
            var queryParams = [];
            queryParams.push('siteId=' + encodeURIComponent(params.siteId));
            queryParams.push('c_customerId=' + params.customerID);

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
            locale: request.locale || 'default',
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

module.exports = {
    getGuestAccessToken: getGuestAccessToken,
    createMarketPaySession: createMarketPaySession
};