'use strict';
const marketPayDataHelper = require('*/cartridge/scripts/helpers/marketPayDataHelper');

function onSuccessRedirect(req, res, args) {
    const Site = require('dw/system/Site');
    var isApp = false;
    if (args.order) {
        var latestPI = marketPayDataHelper.getLatestPaymentInstrumentFromOrder(args.order)        
        isApp = latestPI && latestPI.custom.marketPayPlatform.value === 'app';
    }
    var successURL = null;

    if (isApp)
        successURL = Site.getCurrent().getCustomPreferenceValue('marketPayAppURL');
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
    var isApp = false;
    if (args.order) {
        var latestPI = marketPayDataHelper.getLatestPaymentInstrumentFromOrder(args.order)
        isApp = latestPI && latestPI.custom.marketPayPlatform.value === 'app';
    }
    var failedURL = null;

    if (isApp)
        failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayAppURL');
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


