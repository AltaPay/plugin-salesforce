'use strict';

const LocalServiceRegistry = require('dw/svc/LocalServiceRegistry');
const Encoding = require('dw/crypto/Encoding');
const Bytes = require('dw/util/Bytes');
const Logger = require('dw/system/Logger');
var CacheMgr = require('dw/system/CacheMgr');

const CACHE_ID = 'marketPayRestOauthToken';
const CACHE_KEY = 'oauth_token';

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

    const tokenService = LocalServiceRegistry.createService("int.marketpay.auth", {
        createRequest: function (service, params) {
            service.setRequestMethod("POST");
            service.addHeader("Content-Type", "application/x-www-form-urlencoded");

            const credentials = service.getConfiguration().getCredential();
            const clientId = credentials.getUser();
            const clientSecret = credentials.getPassword();

            const authString = clientId + ":" + clientSecret;
            const base64Auth = Encoding.toBase64(new Bytes(authString));            
            service.addHeader("Authorization", "Basic " + base64Auth);

            return JSON.stringify({});
        },
        parseResponse: function (service, response) {
            return JSON.parse(response.text);
        }
    });

    const result = tokenService.call();

    if (result.ok && result.object && result.object.token) {
        const accessToken = result.object.token;

        // Cache the token (expires automatically after 3500 seconds)
        const cache = CacheMgr.getCache(CACHE_ID);
        cache.put(CACHE_KEY, accessToken);

        return accessToken;
    }


    throw new Error("Failed to get token: " + (result.errorMessage || 'Unknown error'));
}

function fetchNewAuthToken() {

    var tokenService = LocalServiceRegistry.createService("int.marketpay.auth", {
        createRequest: function (service, params) {
            service.setRequestMethod("POST");
            service.addHeader("Content-Type", "application/x-www-form-urlencoded");

            // Get credentials
            var credentials = service.getConfiguration().getCredential();
            var clientId = credentials.getUser();
            var clientSecret = credentials.getPassword();

            // Create Basic Auth header manually
            var authString = clientId + ":" + clientSecret;
            var base64Auth = Encoding.toBase64(new Bytes(authString));
            service.addHeader("Authorization", "Basic " + base64Auth);

            return JSON.stringify({});
        },
        parseResponse: function (service, response) {
            return JSON.parse(response.text);
        }
    });

    var result = tokenService.call();

    if (result.ok) {
        var tokenData = result.object;
        //this.cacheToken(tokenData);
        //return tokenData.token;

        return tokenData;
    }

    throw new Error("Failed to get token: " + result.errorMessage);
}

function getMarketPayAuthenticateService() {
    let authString;
    let encodedAuthString;

    return LocalServiceRegistry.createService('int.marketpay.auth', {
        createRequest: function (svc, payload) {
            svc.setRequestMethod('POST');
            svc.addHeader('Content-Type', 'application/json');

            authString = payload.username + ':' + payload.password;
            encodedAuthString = Encoding.toBase64(new Bytes(authString));
            svc.addHeader('Authorization', 'Basic ' + encodedAuthString);

            return JSON.stringify(payload);
        },

        parseResponse: function (svc, client) {
            try {
                return JSON.parse(client.text);
            } catch (e) {
                throw new Error('Failed to parse authentication response: ' + e.message);
            }
        },

        filterLogMessage: function (msg) {
            return msg; // Mask if needed
        },

        mockCall: function () {
            return {
                status: 'SUCCESS',
                token: 'mock-auth-token'
            };
        }
    });
}

function getService(serviceType, method, url) {
    return LocalServiceRegistry.createService('marketpay.http.service', {
        createRequest: function (svc, payload) {

            var log = Logger.getLogger("marketpay");

            log.info("GetService Marketing _url:" + svc.getURL() + '/' + serviceType);
            log.info("GetService token:" + getAuthToken());
            log.info("GetService body:" + JSON.stringify(payload.requestBody));

            if (url == null)
                svc.setURL(svc.getURL() + '/' + serviceType);
            else
                svc.setURL(url);

            svc.setRequestMethod(method);
            svc.addHeader('Content-Type', 'application/json');
            svc.addHeader('Authorization', 'Bearer ' + getAuthToken());

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
            return msg; // Mask if needed
        },

        mockCall: function () {
            return {
                status: 'SUCCESS',
                sessionId: 'mock-session-id'
            };
        }
    });
}


/**
 * Creates and returns a LocalServiceRegistry service for creating a MarketPay session.
 *
 * The service:
 *  - Sends a POST request to the MarketPay session endpoint.
 *  - Uses Bearer token authentication.
 *  - Parses the JSON session response.
 *  - Provides a mock response for testing.
 *
 * @function
 * @returns {dw.svc.HTTPService}
 * A configured MarketPay session service instance.
 */


function getMarketPaySessionService() {
    return LocalServiceRegistry.createService('int.marketpay.session', {
        createRequest: function (svc, payload) {


            svc.setRequestMethod('POST');
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
            return msg; // Mask if needed
        },

        mockCall: function () {
            return {
                status: 'SUCCESS',
                sessionId: 'mock-session-id'
            };
        }
    });
}

/**
 * Retrieves an authentication token from the MarketPay API.
 *
 * Calls the MarketPay authentication service using credentials configured
 * as custom site preferences and returns the issued token.
 *
 * @function getAuthToken
 *
 * @throws {Error}
 * Thrown when the authentication service call fails or does not return a valid token.
 *
 * @returns {string}
 * The MarketPay authentication token.
 */
function getAuthToken() {    
    
    const cache = CacheMgr.getCache(CACHE_ID);
    let token = cache.get(CACHE_KEY);

    // If token exists in cache, return it (cache handles expiry)
    if (token) {
        return token;
    }

    // Otherwise fetch new token
    return fetchNewToken();
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
    const token = getAuthToken();    

    const sessionService = getMarketPaySessionService();
    const result = sessionService.call({
        token: token,
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

function getPaymentMethods(checkoutSessionId) {

    const service = getService(`session/${checkoutSessionId}/payment-methods`, 'GET');
    const result = service.call({        
        requestBody: {}
    });

    if (!result.ok) {
        Logger.error('MarketPay PaymentMethods API error', result.errorMessage);
        throw new Error('Failed to retrieve MarketPay Payment Methods');
    }

    return result.object;
}

function createPayment(checkoutSessionId, paymentMethodId, onInitiatePaymentURL) {

    const service = getService(`payment`, 'POST', onInitiatePaymentURL);
    const result = service.call({        
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

module.exports = {
    getTokenAndSessionId: getTokenAndSessionId,
    getPaymentMethods: getPaymentMethods,
    createPayment: createPayment,
    fetchNewAuthToken: fetchNewAuthToken
};


