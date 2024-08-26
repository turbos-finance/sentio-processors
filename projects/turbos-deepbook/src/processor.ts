import { BigDecimal } from "@sentio/sdk";
import {
  deepbook,
  skipStartBlockValidation,
  startCheckPoint,
  originPools,
  originCoins,
} from "./helper/config.js";
import { GLOBAL_CONFIG } from "@sentio/runtime";

GLOBAL_CONFIG.execution = {
  skipStartBlockValidation: skipStartBlockValidation,
};

const pools = Object.entries(originPools).map(([poolKey, pool]) => {
  return { poolKey, ...pool };
});

const coins = Object.entries(originCoins).map(([symbol, coin]) => {
  return { symbol, ...coin };
});

deepbook.order_info
  .bind({
    startCheckpoint: startCheckPoint,
  })
  .onEventOrderFilled(
    async (event, ctx) => {
      const orderId = event.data_decoded.taker_order_id.toString();
      const infoEvent = (ctx.transaction.events || []).find((event) => {
        return (
          // ::order_info::OrderInfo
          // ::order_info::OrderInfoEvent
          event.type.includes("::order_info::OrderInfo") &&
          // @ts-expect-error
          String(event.parsedJson?.order_id) === orderId
        );
      });

      if (!infoEvent) {
        console.log("===infoEvent not found ", ctx.transaction.digest);
        return;
      }

      const infoEventData = infoEvent.parsedJson as {
        order_id: string;
        is_bid: boolean;
        original_quantity: string;
        market_order: boolean;
      };

      const eventData = event.parsedJson as {
        base_quantity: string;
        quote_quantity: string;
        pool_id: string;
        price: string;
        taker_balance_manager_id: string;
        taker_client_order_id: string;
        taker_order_id: string;
        maker_balance_manager_id: string;
        maker_client_order_id: string;
        maker_order_id: string;
        taker_is_bid: boolean;
      };
      const atob = !infoEventData.is_bid;
      const poolId = eventData.pool_id;
      const poolInfo = pools.find((item) => item.address === poolId);
      if (!poolInfo) {
        console.log("===pool not found", poolId);
        return;
      }

      const baseCoinInfo = coins.find(
        (item) => item.symbol === poolInfo.baseCoin
      );
      const quoteCoinInfo = coins.find(
        (item) => item.symbol === poolInfo.quoteCoin
      );

      if (!baseCoinInfo || !quoteCoinInfo) {
        console.log("===coin not found", JSON.stringify(poolInfo));
        return;
      }

      // onchain_price = real_price * FLOAT_SCALAR * quote_coin_scalar / base_coin_scalar
      const price = new BigDecimal(eventData.price)
        .div(
          new BigDecimal(10)
            .pow(9)
            .times(quoteCoinInfo.scalar)
            .div(baseCoinInfo.scalar)
        )
        .toString();
      const amountA = new BigDecimal(eventData.base_quantity)
        .div(baseCoinInfo.scalar)
        .toString();
      const amountB = new BigDecimal(eventData.quote_quantity)
        .div(quoteCoinInfo.scalar)
        .toString();
      const amountOrigin = new BigDecimal(infoEventData.original_quantity)
        .div(baseCoinInfo.scalar)
        .toString();

      ctx.eventLogger.emit("DeepbookSwapEvent", {
        event_seq: Number(event.id.eventSeq),
        pool: poolId,
        order_id: infoEventData.order_id,
        is_bid: infoEventData.is_bid,
        market_order: infoEventData.market_order,
        price,
        sender: event.sender,
        maker_client_order_id: eventData.maker_client_order_id,
        maker_address: eventData.maker_balance_manager_id,
        maker_order_id: eventData.maker_order_id,
        taker_client_order_id: eventData.taker_client_order_id,
        taker_address: eventData.taker_balance_manager_id,
        taker_order_id: eventData.taker_order_id,
        coin_symbol_a: baseCoinInfo.symbol,
        coin_symbol_b: quoteCoinInfo.symbol,
        coin_type_a: baseCoinInfo.type,
        coin_type_b: quoteCoinInfo.type,
        coin_amount_a: amountA,
        coin_amount_b: amountB,
        total_amount: amountOrigin,
        distinctId: event.sender,
        message: `Deepbook swap from ${atob ? baseCoinInfo.symbol : quoteCoinInfo.symbol} to ${atob ? quoteCoinInfo.symbol : baseCoinInfo.symbol}. Progress: ${amountA}/${amountOrigin}`,
      });

      ctx.meter.Gauge("Deepbook Prices").record(price, {
        pair: `${baseCoinInfo.symbol}-${quoteCoinInfo.symbol}`,
      });
    },
    {
      allEvents: true,
    }
  );
