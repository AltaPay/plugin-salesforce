'use strict';

const Logger = require('dw/system/Logger');

exports.afterPOST = function (basketId) {

    var HookMgr = require('dw/system/HookMgr');

    if (HookMgr.hasHook('dw.order.createOrderNo')) {
        var orderNo = HookMgr.callHook('dw.order.createOrderNo', 'createOrderNo');
        Logger.info("MarketPayOrderNo Created via hook: " + orderNo);
    } else {
        Logger.error("dw.order.createOrderNo hook not found");
    }
};