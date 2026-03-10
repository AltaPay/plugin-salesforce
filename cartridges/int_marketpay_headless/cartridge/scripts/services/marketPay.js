'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const Logger = require('dw/system/Logger').getLogger('MarketPay', 'MarketPay');

/**
 * Creates and returns a LocalServiceRegistry service for authenticating with MarketPay.
 *
 * The service:
 *  - Sends a POST request with JSON credentials (username & password).
 *  - Uses HTTP Basic Authentication with Base64-encoded credentials.
 *  - Parses the JSON authentication response.
 *  - Provides a mock response for testing.
 *
 * @function
 * @returns {dw.svc.HTTPService}
 * A configured MarketPay authentication service instance.
 */

function fetchNewToken() {
    const tokenService = LocalServiceRegistry.createService("int.marketpay.service", {
        createRequest: function (svc, params) {

            svc.setURL(svc.getURL() + '/checkout/v1/api/authenticate');
            svc.setRequestMethod("POST");
            svc.addHeader("Content-Type", "application/x-www-form-urlencoded");

            const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
            const credentials = svc.getConfiguration().getCredential();
            svc.addHeader("Authorization", marketPayDataHelper.getBasicAuthHeader(credentials.getUser(), credentials.getPassword()));

            return JSON.stringify({});
        },
        parseResponse: function (service, response) {
            return JSON.parse(response.text);
        },
        filterLogMessage: function (msg) {
            // Remove token from logs
            return msg.replace(/"token"\s*:\s*"[^"]+"/g, '"token":"***"')
            
        }
    });

    const result = tokenService.call();

    if (result.ok && result.object && result.object.token) {
            
        return result.object.token;
    }

    throw new Error("Failed to get token: " + (result.errorMessage || 'Unknown error'));
}


function getMerchantService() {
    return LocalServiceRegistry.createService('int.marketpay.service', {
        createRequest: function (svc, payload) {
            svc.setURL(svc.getURL() + '/' + payload.endPoint);
            svc.setRequestMethod("GET");
            svc.addHeader("Content-Type", "application/x-www-form-urlencoded");
            const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
            const credentials = svc.getConfiguration().getCredential();
            svc.addHeader("Authorization", marketPayDataHelper.getBasicAuthHeader(credentials.getUser(), credentials.getPassword()));

            return JSON.stringify({});
        },
        parseResponse: function (svc, client) {
            try {
                return client.text;
            } catch (e) {
                throw new Error('Failed to parse session response: ' + e.message);
            }
        },
        filterLogMessage: function (msg) {
            return msg;
        }
    });
}

function getService() {
    return LocalServiceRegistry.createService('int.marketpay.service', {
        createRequest: function (svc, payload) {

            if (payload.url == null)
                svc.setURL(svc.getURL() + '/' + payload.endPoint);
            else
                svc.setURL(payload.url);

            svc.setRequestMethod(payload.method);
            svc.addHeader('Content-Type', 'application/json');
            svc.addHeader('Authorization', 'Bearer ' + payload.token);

            return JSON.stringify(payload.requestBody);
        },

        parseResponse: function (svc, client) {
            try {
                return JSON.parse(client.text);
            } catch (e) {
                throw new Error('Failed to parse session response: ' + e.message);
            }
        },

        filterLogMessage: function (msg) {
            return msg.replace(/"sessionId"\s*:\s*"[^"]+"/g, '"sessionId":"***"')
        }
    });
}

/**
 * Retrieves a MarketPay authentication token and creates a MarketPay session.
 *
 * This function:
 *  - Obtains an authentication token via {@link getAuthToken}.
 *  - Calls the MarketPay session service using the token.
 *  - Returns both the token and the created session ID.
 *
 * @function getTokenAndSessionId
 *
 * @throws {Error}
 * Thrown when the authentication token cannot be retrieved.
 *
 * @throws {Error}
 * Thrown when the session service call fails or does not return a session ID.
 *
 * @returns {{ token: string, sessionId: string }}
 * An object containing:
 *  - token: The MarketPay authentication token
 *  - sessionId: The created MarketPay session ID
 */

function getTokenAndSessionId(requestBody) {
    const token = fetchNewToken();
    const service = getService();

    const result = service.call({
        token: token,
        endPoint: `checkout/v1/api/session`,
        method: 'POST',
        requestBody: requestBody
    });

    if (!result.ok || !result.object || !result.object.sessionId) {
        Logger.error('MarketPay Session API error', result.errorMessage);
        throw new Error('Failed to retrieve MarketPay session ID');
    }

    return {
        token: token,
        sessionId: result.object.sessionId
    };
}

function updateSession(token, checkoutSessionId, requestBody) {

    const service = getService();
    const result = service.call({
        token: token,
        endPoint: `checkout/v1/api/session/${checkoutSessionId}`,
        method: 'PUT',
        requestBody: requestBody
    });

    if (!result.ok) {
        Logger.error('MarketPay updateSession API error', result.errorMessage);
        throw new Error('Failed to update MarketPay session');
    }

    return result.ok;
}

function getPaymentMethods(token, checkoutSessionId) {
    const service = getService();
    const result = service.call({
        token: token,
        endPoint: `checkout/v1/api/session/${checkoutSessionId}/payment-methods`,
        method: "GET", 
        requestBody: {}
    });

    if (!result.ok) {
        Logger.error('MarketPay PaymentMethods API error', result.errorMessage);
        throw new Error('Failed to retrieve MarketPay Payment Methods');
    }

    return result.object;
}

function createPayment(token, checkoutSessionId, paymentMethodId, onInitiatePaymentURL) {
    const service = getService();
    const result = service.call({
        token: token,
        endPoint: `checkout/v1/api/payment`,
        url: onInitiatePaymentURL,
        method: 'POST',
        requestBody: {
            paymentMethodId: paymentMethodId,
            sessionId: checkoutSessionId
        }
    });

    if (!result.ok || !result.object) {
        Logger.error('MarketPay createPayment API error', result.errorMessage);
        throw new Error('Failed to create MarketPay session ID');
    }

    return result.object;
}

function getPaymentDetail(sfccOrderId) {
    const service = getMerchantService();
    const result = service.call({
        endPoint: `merchant/API/payments?shop_orderid=${sfccOrderId}`,
        requestBody: {}
    });

    if (!result.ok) {
        Logger.error('MarketPay payments API error', result.errorMessage);
        throw new Error('Failed to retrieve MarketPay payment status');
    }

    return new XML(result.object);
}

module.exports = {
    getTokenAndSessionId: getTokenAndSessionId,
    updateSession: updateSession,
    getPaymentMethods: getPaymentMethods,
    createPayment: createPayment,
    getPaymentDetail: getPaymentDetail
};
