'use strict';

var Logger = require('dw/system/Logger');
var BasketMgr = require('dw/order/BasketMgr');

/**
 * Hook to provide custom order number when creating an order
 * Uses the pre-generated order number stored in basket.custom.marketPayUsedOrderNo
 * @returns {string|null} - Custom order number or null to use default
 */
exports.createOrderNo = function () {
    var orderNo;
    var isOrderExist;

    const OrderMgr = require('dw/order/OrderMgr');
    const Transaction = require('dw/system/Transaction');
    
    try {

        var basket = BasketMgr.getCurrentBasket();
        Logger.info("createOrderNo Hook called, basket is null: " + (basket == null));

        Transaction.begin();
        orderNo = basket.custom.marketPayUsedOrderNo;

        if (!orderNo) {
            orderNo = OrderMgr.createOrderSequenceNo();
            basket.custom.marketPayUsedOrderNo = orderNo;
        } else {
            try {
                isOrderExist = !empty(OrderMgr.getOrder(orderNo));

                if (isOrderExist) {
                    orderNo = OrderMgr.createOrderSequenceNo();
                    basket.custom.marketPayUsedOrderNo = orderNo;
                }
            } catch (error) {
                Logger.error("Error in createOrderNo: " + error.message);
                orderNo = OrderMgr.createOrderSequenceNo();
                basket.custom.marketPayUsedOrderNo = orderNo;
            }
        }

        Transaction.commit();
    } catch (e) {
        Transaction.rollback();
        Logger.error("Transaction error in createOrderNo: " + e.message);
        throw e;
    }

    Logger.info("createOrderNo Hook called, OrderNo: " + orderNo);

    return orderNo;
};
