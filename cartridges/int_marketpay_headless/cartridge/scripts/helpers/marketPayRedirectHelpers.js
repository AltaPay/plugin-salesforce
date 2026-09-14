'use strict';

function getSuccessRedirectURL(args) {
    const Site = require('dw/system/Site');
    var successURL = args.isApp
        ? args.appReturnURL || Site.getCurrent().getCustomPreferenceValue('marketPayAppURL')
        : Site.getCurrent().getCustomPreferenceValue('marketPayPaymentSuccessURL');

    return buildRedirectURL(successURL, args);
}

function getFailureRedirectURL(args) {
    const Site = require('dw/system/Site');
    var failedURL = args.isApp
        ? args.appReturnURL || Site.getCurrent().getCustomPreferenceValue('marketPayAppURL')
        : Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');

    return buildRedirectURL(failedURL, args);
}

function buildRedirectURL(baseURL, args) {
    if (!baseURL) {
        return null;
    }

    var url = baseURL;

    if (url.indexOf('{LOCALE}') != -1) {
        url = url.replace('{LOCALE}', args.userLocale);
    }

    if (!empty(args)) {
        var queryParts = Object.keys(args).filter(function (key) {
            return key !== 'userLocale' && key !== 'isApp' && key !== 'appReturnURL';
        }).map(function (key) {
            return encodeURIComponent(key) + '=' + encodeURIComponent(args[key]);
        });

        if (queryParts.length > 0) {
            url += (url.indexOf('?') !== -1 ? '&' : '?') + queryParts.join('&');
        }
    }

    return url;
}

module.exports = {
    getSuccessRedirectURL: getSuccessRedirectURL,
    getFailureRedirectURL: getFailureRedirectURL
};
