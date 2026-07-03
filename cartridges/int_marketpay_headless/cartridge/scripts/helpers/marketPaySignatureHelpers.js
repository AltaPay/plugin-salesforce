'use strict';

var Mac = require('dw/crypto/Mac');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');
var Site = require('dw/system/Site');

/**
 * URL encodes strings to match the gateway's Java-style encoding.
 * (Needed because standard JS leaves characters like '!' or '(' unencoded).
 */
function formEncode(str) {
    return encodeURIComponent(str)
        .replace(/%20/g, '+')
        .replace(/[!()'~]/g, function (c) {
            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        });
}

/**
 * Checks if the request is actually from the gateway by verifying its signature.
 */
function validateRequest(req) {
    var secret = Site.getCurrent().getCustomPreferenceValue('marketPayCallbackSecret');

    if (!secret || !secret.trim()) {
        return true; // No secret set or just spaces? Skip validation.
    }

    // 1. Get the timestamp and signature(s) from the header
    var signatureHeader = req.httpHeaders.get('altapay-signature');

    if (!signatureHeader) {
        return false;
    }

    var timestamp = null;
    var signatures = [];

    signatureHeader.split(';').forEach(function (field) {
        var trimmed = field.trim();
        if (trimmed.indexOf('t=') === 0) {
            timestamp = trimmed.substring(2);
        } else if (/^s\d+=/.test(trimmed)) {
            signatures.push(trimmed.split('=')[1]);
        }
    });

    if (!timestamp || signatures.length === 0) {
        return false;
    }

    // 2. Rebuild the raw request body
    // SFCC parses form data automatically, so we have to manually stitch the
    // body back together to check the signature.
    var paramMap = request.httpParameterMap;
    var parts = [];
    var paramNamesIter = paramMap.getParameterNames().iterator();
    while (paramNamesIter.hasNext()) {
        var paramName = paramNamesIter.next();
        var stringValues = paramMap.get(paramName).getStringValues();
        if (stringValues.isEmpty()) {
            parts.push(formEncode(paramName) + '=');
        } else {
            var valuesIter = stringValues.iterator();
            while (valuesIter.hasNext()) {
                var paramValue = valuesIter.next();
                // Add back the trailing newline that SFCC strips from the XML parameter.
                if (paramName === 'xml') {
                    paramValue += '\n';
                }
                parts.push(formEncode(paramName) + '=' + formEncode(paramValue));
            }
        }
    }
    var rawBody = parts.join('&');

    // 3. Hash the body + timestamp and compare with the provided signatures
    var mac = new Mac(Mac.HMAC_SHA_256);
    var payload = rawBody + '.' + timestamp;
    var calculatedHex = Encoding.toHex(mac.digest(new Bytes(payload, 'UTF-8'), new Bytes(secret, 'UTF-8')));
    var signatureValid = signatures.some(function (sig) { return calculatedHex === sig; });

    if (!signatureValid) {
        return false;
    }

    return true;
}

module.exports = {
    validateRequest: validateRequest
};
