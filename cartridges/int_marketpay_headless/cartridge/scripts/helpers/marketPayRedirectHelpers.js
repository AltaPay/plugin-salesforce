'use strict';

function onSuccessRedirect(req, res, args) {
    const Site = require('dw/system/Site');
    var userAgent = req.httpHeaders.get('user-agent');
    var isMobile = /android|iphone|ipad|ipod/i.test(userAgent);
    var successURL = null;

    if (isMobile)
        successURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentSuccessAppURL');
    else
        successURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentSuccessURL');
    
    if(successURL && successURL.indexOf('{LOCALE}') != -1) {
        successURL =  successURL.replace('{LOCALE}', args.userLocale);
    }

    if(!empty(args)) {
        var queryParts = Object.keys(args).filter(function(key) {
            return key !== 'userLocale';
        }).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(args[key]);
        });

        if(queryParts.length > 0) {
            successURL += (successURL.indexOf('?') !== -1 ? '&' : '?') + queryParts.join('&');
        }
    }
    
    res.redirect(successURL);
}

function onFailureRedirect(req, res, args) {
    const Site = require('dw/system/Site');
    var userAgent = req.httpHeaders.get('user-agent');
    var isMobile = /android|iphone|ipad|ipod/i.test(userAgent);
    var failedURL = null;

    if (isMobile)
        failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedAppURL');
    else
        failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');

    if(failedURL && failedURL.indexOf('{LOCALE}') != -1) {
        failedURL =  failedURL.replace('{LOCALE}', args.userLocale);
    }

    if(!empty(args)) {
        var queryParts = Object.keys(args).filter(function(key) {
            return key !== 'userLocale';
        }).map(function(key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(args[key]);
        });

        if(queryParts.length > 0) {
            failedURL += (failedURL.indexOf('?') !== -1 ? '&' : '?') + queryParts.join('&');
        }
    }

    res.redirect(failedURL);
}

module.exports = {
    onSuccessRedirect: onSuccessRedirect,
    onFailureRedirect: onFailureRedirect
};


