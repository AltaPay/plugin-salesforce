'use strict';

function onSuccessRedirect(req, res, orderNo) {
    const Site = require('dw/system/Site');

    var userAgent = req.httpHeaders.get('user-agent');
    var isMobile = /android|iphone|ipad|ipod/.test(userAgent);
    var successURL = null;

    if (isMobile)
        successURL = Site.current.getCustomPreferenceValue('marketPayPaymentSuccessAppURL');
    else
        successURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentSuccessURL');

    res.redirect(successURL + '/' + orderNo);
}

function onFailtureRedirect(req, res, orderNo) {
    const Site = require('dw/system/Site');

    var userAgent = req.httpHeaders.get('user-agent');
    var isMobile = /android|iphone|ipad|ipod/.test(userAgent);
    var failedURL = null;

    if (isMobile)
        failedURL = Site.current.getCustomPreferenceValue('marketPayPaymentFailedAppURL');
    else
        failedURL = Site.getCurrent().getCustomPreferenceValue('marketPayPaymentFailedURL');

    res.redirect(failedURL + '/' + orderNo);
}

module.exports = {
    onSuccessRedirect: onSuccessRedirect,
    onFailtureRedirect: onFailtureRedirect
};


