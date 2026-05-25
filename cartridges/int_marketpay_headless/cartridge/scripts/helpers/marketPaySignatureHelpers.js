'use strict';

var Mac = require('dw/crypto/Mac');
var Encoding = require('dw/crypto/Encoding');
var Bytes = require('dw/util/Bytes');
var Site = require('dw/system/Site');

// Matches Java URLEncoder: space→+, encode all chars except A-Za-z0-9 - _ . *
// encodeURIComponent leaves ( ) ! ~ ' unencoded but Java URLEncoder encodes them.
function formEncode(str) {
    return encodeURIComponent(str)
        .replace(/%20/g, '+')
        .replace(/[!()'~]/g, function (c) {
            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        });
}

function validateRequest(req) {
    var secret = Site.getCurrent().getCustomPreferenceValue('marketPayCallbackSecret');

    if (!secret) {
        return true; // No secret configured, skip validation
    }

    // Step 1: Parse the AltaPay-Signature header
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

    // Step 2: Prepare the payload — rawBody + "." + timestamp
    // SFCC parses application/x-www-form-urlencoded bodies into httpParameterMap on
    // request arrival, so requestBodyAsString is always null for this content type.
    // Reconstruct by re-encoding parameters in received order (Tomcat preserves it).
    var paramMap = request.httpParameterMap;
    var parts = [];
    var paramNamesIter = paramMap.getParameterNames().iterator();
    while (paramNamesIter.hasNext()) {
        var paramName = paramNamesIter.next();
        var stringValues = paramMap.get(paramName).getStringValues();
        if (stringValues.isEmpty()) {
            // SFCC returns empty Collection for params submitted with no value (e.g. "error_message=")
            parts.push(formEncode(paramName) + '=');
        } else {
            var valuesIter = stringValues.iterator();
            while (valuesIter.hasNext()) {
                var paramValue = valuesIter.next();
                // SFCC strips trailing \n from parameter values; AltaPay appends \n after </APIResponse>
                if (paramName === 'xml') {
                    paramValue += '\n';
                }
                parts.push(formEncode(paramName) + '=' + formEncode(paramValue));
            }
        }
    }
    var rawBody = parts.join('&');

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
