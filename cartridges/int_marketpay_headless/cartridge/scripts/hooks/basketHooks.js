'use strict';

const Site = require('dw/system/Site');
const Logger = require('dw/system/Logger');
const BasketMgr = require('dw/order/BasketMgr');

exports.afterPOST = function (basketId) {

    Logger.info("basket afterPost Called ");

    var HookMgr = require('dw/system/HookMgr');

    if (HookMgr.hasHook('dw.order.createOrderNo')) {
        var orderNo = HookMgr.callHook('dw.order.createOrderNo', 'createOrderNo');
        Logger.info("MarketPayOrderNo Created via hook: " + orderNo);
    } else {
        Logger.error("dw.order.createOrderNo hook not found");
    }
};