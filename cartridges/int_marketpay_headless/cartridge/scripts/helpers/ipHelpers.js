'use strict';

function ipToInt(ip) {
    return ip.split('.').reduce(function (acc, octet) {
        return (acc * 256) + parseInt(octet, 10);
    }, 0) >>> 0;
}

function isIPInCIDR(clientIP, cidr) {
    var parts = cidr.split('/');
    var prefix = parseInt(parts[1], 10);
    var mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipToInt(clientIP) & mask) === (ipToInt(parts[0]) & mask);
}

function isKnownIPProtectionEnabled() {
    var Site = require('dw/system/Site');
    return Site.getCurrent().getCustomPreferenceValue('marketPayKnownIPProtection');
}

function isRequestFromKnownIP(req) {
    var marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');
    var clientIP = req.remoteAddress;

    if (!clientIP) {
        Logger.warn('MarketPay: Unable to determine client IP address, denying request');
        return false;
    }

    var ipSet = marketPayDataHelper.MARKETPAY_IP_ADDRESS_SET;

    for (var i = 0; i < ipSet.length; i++) {
        var entry = ipSet[i];
        if (entry.indexOf('/') !== -1) {
            if (isIPInCIDR(clientIP, entry)) return true;
        } else if (clientIP === entry) {
            return true;
        }
    }

    return false;
}

module.exports = {
    isRequestFromKnownIP: isRequestFromKnownIP,
    isKnownIPProtectionEnabled: isKnownIPProtectionEnabled
};