import {
  SuiObjectProcessor,
  SuiContext,
  SuiObjectContext,
  SuiObjectProcessorTemplate,
} from "@sentio/sdk/sui";
import * as constant from "./constant-turbos.js";
import { SuiNetwork } from "@sentio/sdk/sui";
import * as helper from "./helper/turbos-clmm-helper.js";
import { Gauge, BigDecimal } from "@sentio/sdk";

import { pool, pool_factory, position_manager } from "./types/sui/turbos.js";
import {
  getCurrentTickStatus,
  MAX_TICK_INDEX,
  MIN_TICK_INDEX,
} from "./helper/turbos-clmm-helper.js";
import { getPriceByType } from "@sentio/sdk/utils";
const address = constant.CLMM_MAINNET;
const network = SuiNetwork.MAIN_NET;

export const volRewardOptions = {
  sparse: true,
  aggregationConfig: {
    intervalInMinutes: [60],
    // discardOrigin: false
  },
};
const day_reward_amount = Gauge.register("day_reward_amount", volRewardOptions);

export const volOptions = {
  sparse: true,
};

const price_a_gauge = Gauge.register("price_a", volOptions);
const price_b_gauge = Gauge.register("price_b", volOptions);

pool_factory
  .bind({
    address,
    network,
    startCheckpoint: 1500000n,
  })
  .onEventPoolCreatedEvent(
    async (event, ctx) => {
      ctx.meter.Counter("create_pool_counter").add(1);
      const account = event.data_decoded.account;
      const fee_protocol = event.data_decoded.fee_protocol;
      const pool = event.data_decoded.pool;
      const tick_spacing = event.data_decoded.tick_spacing;
      const fee = event.data_decoded.fee;
      const sqrt_price = event.data_decoded.sqrt_price;

      const poolInfo = await helper.getOrCreatePool(ctx, pool);

      ctx.eventLogger.emit("CreatePoolEvent", {
        distinctId: account,
        account,
        fee_protocol,
        pool,
        tick_spacing,
        fee,
        sqrt_price,
        token_a_symbol: poolInfo.symbol_a,
        token_b_symbol: poolInfo.symbol_b,
        token_a_address: poolInfo.type_a,
        token_b_address: poolInfo.type_b,
        pairName: poolInfo.pairName,
        pairFullName: poolInfo.pairFullName,
      });

      const mutated = ctx.transaction.effects?.mutated;
      const obj = mutated?.find((item) => item.reference.objectId === pool);

      await helper.getOrCreatePool(ctx, pool, obj?.reference.version);

      template.bind(
        {
          objectId: pool,
        },
        ctx
      );
    },
    { resourceChanges: true }
  );

pool
  .bind({
    address,
    network,
    startCheckpoint: 1500000n,
  })
  .onEventSwapEvent(
    async (event, ctx) => {
      ctx.meter.Counter("swap_counter").add(1);
      const sender = event.sender;
      const pool = event.data_decoded.pool;

      const mutated = ctx.transaction.effects?.mutated;
      const obj = mutated?.find((item) => item.reference.objectId === pool);

      const recipient = event.data_decoded.recipient;
      const poolInfo = await helper.getOrCreatePool(
        ctx,
        pool,
        obj?.reference.version
      );
      const atob = event.data_decoded.a_to_b;
      const liquidity = Number(event.data_decoded.liquidity);
      const tick_current_index = event.data_decoded.tick_current_index.bits;
      const tick_pre_index = event.data_decoded.tick_pre_index.bits;
      const sqrt_price = Number(event.data_decoded.sqrt_price);
      const protocol_fee = Number(event.data_decoded.protocol_fee);
      const fee_amount = Number(event.data_decoded.fee_amount);
      const is_exact_in = event.data_decoded.is_exact_in;

      const type_a = poolInfo.type_a;
      const type_b = poolInfo.type_b;
      const symbol_a = poolInfo.symbol_a;
      const symbol_b = poolInfo.symbol_b;
      const decimal_a = poolInfo.decimal_a;
      const decimal_b = poolInfo.decimal_b;
      const pairName = poolInfo.pairName;
      const pairFullName = poolInfo.pairFullName;

      const amount_a =
        Number(event.data_decoded.amount_a) / Math.pow(10, decimal_a);
      const amount_b =
        Number(event.data_decoded.amount_b) / Math.pow(10, decimal_b);

      console.log(
        `swapevent calculateSwapVol_USD pool:${pool} ;type:${poolInfo.type},checkpoint: ${ctx.transaction.checkpoint}`
      );
      const [usd_volume, price_a, price_b] = await helper.calculateSwapVol_USD(
        poolInfo.type,
        amount_a,
        amount_b,
        atob,
        ctx.timestamp
      );
      let fee_usd = 0;
      if (atob) {
        if (price_a) {
          fee_usd = (fee_amount / Math.pow(10, decimal_a)) * price_a;
        }
      } else {
        if (price_b) {
          fee_usd = (fee_amount / Math.pow(10, decimal_b)) * price_b;
        }
      }

      ctx.meter.Gauge("Fee").record(fee_usd, { pairName, pairFullName });
      ctx.meter
        .Counter("Cumulative_Fee_Counter")
        .add(fee_usd!, { pairName, pairFullName, poolId: pool });

      ctx.eventLogger.emit("SwapEvent", {
        distinctId: sender,
        digest: ctx.transaction.digest,
        checkpoint: ctx.transaction.checkpoint,
        recipient,
        pool,
        sqrt_price,
        token_a_address: type_a,
        token_b_address: type_b,
        amount_a,
        amount_b,
        price_a,
        price_b,
        atob,
        usd_volume,
        liquidity,
        tick_current_index,
        tick_pre_index,
        protocol_fee,
        is_exact_in,
        fee_amount,
        fee_usd,
        token_a_symbol: symbol_a,
        token_b_symbol: symbol_b,
        coin_symbol: atob ? symbol_a : symbol_b, //for amount_in
        pairName,
        pairFullName,
        message: `Swap ${atob ? amount_a : amount_b} ${
          atob ? symbol_a : symbol_b
        } to ${atob ? amount_b : amount_a} ${
          atob ? symbol_b : symbol_a
        }. USD value: ${usd_volume} in Pool ${pairFullName} `,
      });

      ctx.meter
        .Gauge("Swap_Volume_USD")
        .record(usd_volume!, { pairName, pairFullName, poolId: pool });
      ctx.meter
        .Counter("Swap_Volume_USD_Counter")
        .add(usd_volume!, { pairName, pairFullName, poolId: pool });
      if (price_a) {
        price_a_gauge.record(ctx, price_a, {
          pairName,
          pairFullName,
          token_address: type_a,
          token_symbol: symbol_a,
          poolId: pool,
        });
      }
      if (price_b) {
        price_b_gauge.record(ctx, price_b, {
          pairName,
          pairFullName,
          token_address: type_b,
          token_symbol: symbol_b,
          poolId: pool,
        });
      }

      await helper.calculateTokenValue_USD(
        ctx,
        pool,
        ctx.timestamp,
        obj?.reference.version
      );
    },
    { resourceChanges: true }
  )
  .onEventMintEvent(
    async (event, ctx) => {
      ctx.meter.Counter("add_liquidity_counter").add(1);
      const pool = event.data_decoded.pool;

      const mutated = ctx.transaction.effects?.mutated;
      const obj = mutated?.find((item) => item.reference.objectId === pool);

      const poolInfo = await helper.getOrCreatePool(ctx, pool);
      const pairName = poolInfo.pairName;
      const pairFullName = poolInfo.pairFullName;

      const decimal_a = poolInfo.decimal_a;
      const decimal_b = poolInfo.decimal_b;

      const sender = event.sender;
      const owner = event.data_decoded.owner;
      const tick_lower_index = Number(event.data_decoded.tick_lower_index.bits);
      const tick_upper_index = Number(event.data_decoded.tick_upper_index.bits);
      const liquidity_delta = Number(event.data_decoded.liquidity_delta);
      const amount_a =
        Number(event.data_decoded.amount_a) / Math.pow(10, decimal_a);
      const amount_b =
        Number(event.data_decoded.amount_b) / Math.pow(10, decimal_b);
      const [value_a, value_b] = await helper.calculateValue_USD(
        ctx,
        pool,
        amount_a,
        amount_b,
        ctx.timestamp,
        obj?.reference.version
      );
      const value = value_a + value_b;
      ctx.eventLogger.emit("AddLiquidityEvent", {
        distinctId: sender,
        owner,
        pool,
        tick_lower_index,
        tick_upper_index,
        liquidity_delta,
        amount_a,
        amount_b,
        value,
        token_a_symbol: poolInfo.symbol_a,
        token_b_symbol: poolInfo.symbol_b,
        token_a_address: poolInfo.type_a,
        token_b_address: poolInfo.type_b,
        pairName,
        pairFullName,
        message: `Add USD$${value} Liquidity in ${pairFullName}`,
      });
      ctx.meter
        .Gauge("add_liquidity_gauge")
        .record(value, { pairName, pairFullName, poolId: pool });

      await helper.calculateTokenValue_USD(
        ctx,
        pool,
        ctx.timestamp,
        obj?.reference.version
      );
    },
    { resourceChanges: true }
  )
  .onEventBurnEvent(
    async (event, ctx) => {
      ctx.meter.Counter("remove_liquidity_counter").add(1);
      const pool = event.data_decoded.pool;

      const mutated = ctx.transaction.effects?.mutated;
      const obj = mutated?.find((item) => item.reference.objectId === pool);

      const poolInfo = await helper.getOrCreatePool(ctx, pool);
      const pairName = poolInfo.pairName;
      const pairFullName = poolInfo.pairFullName;
      const decimal_a = poolInfo.decimal_a;
      const decimal_b = poolInfo.decimal_b;

      const sender = event.sender;
      const owner = event.data_decoded.owner;
      const tick_lower_index = Number(event.data_decoded.tick_lower_index.bits);
      const tick_upper_index = Number(event.data_decoded.tick_upper_index.bits);
      const liquidity_delta = Number(event.data_decoded.liquidity_delta);
      const amount_a =
        Number(event.data_decoded.amount_a) / Math.pow(10, decimal_a);
      const amount_b =
        Number(event.data_decoded.amount_b) / Math.pow(10, decimal_b);
      const [value_a, value_b] = await helper.calculateValue_USD(
        ctx,
        pool,
        amount_a,
        amount_b,
        ctx.timestamp,
        obj?.reference.version
      );
      const value = value_a + value_b;

      ctx.eventLogger.emit("RemoveLiquidityEvent", {
        distinctId: sender,
        pool,
        owner,
        tick_lower_index,
        tick_upper_index,
        liquidity_delta,
        amount_a,
        amount_b,
        token_a_symbol: poolInfo.symbol_a,
        token_b_symbol: poolInfo.symbol_b,
        token_a_address: poolInfo.type_a,
        token_b_address: poolInfo.type_b,
        value,
        pairName,
        pairFullName,
        message: `Remove USD$${value} Liquidity in ${pairFullName}`,
      });
      ctx.meter
        .Gauge("remove_liquidity_gauge")
        .record(value, { pairName, pairFullName, poolId: pool });

      await helper.calculateTokenValue_USD(
        ctx,
        pool,
        ctx.timestamp,
        obj?.reference.version
      );
    },
    { resourceChanges: true }
  )
  .onEventUpdateRewardEmissionsEvent(async (event, ctx) => {
    ctx.meter.Counter("update_reward_emissions").add(1);
    const pool = event.data_decoded.pool;
    const poolInfo = await helper.getOrCreatePool(ctx, pool);

    const pairName = poolInfo.pairName;
    const pairFullName = poolInfo.pairFullName;

    const reward_emissions_per_second =
      event.data_decoded.reward_emissions_per_second;
    const reward_index = event.data_decoded.reward_index;
    const reward_manager = event.data_decoded.reward_manager;
    const reward_vault = event.data_decoded.reward_vault;
    const sender = event.sender;

    const { type, symbol, decimals } = await helper.setOrGetCoinType(
      ctx,
      reward_vault
    );
    const dayAmount = new BigDecimal(86400)
      .multipliedBy(reward_emissions_per_second.toString())
      .dividedBy(10 ** decimals)
      .toNumber();
    console.log(
      `onEventUpdateRewardEmissionsEvent decimals:${decimals}, reward_emissions_per_second:${reward_emissions_per_second.toString()}, day amount:${dayAmount}, reward_vault: ${reward_vault}`
    );
    // ctx.meter.Gauge("day_reward_amount").record(dayAmount, { pairName, pairFullName, type, symbol });
    day_reward_amount.record(ctx, dayAmount, {
      pairName,
      pairFullName,
      type,
      symbol,
      poolId: pool,
    });

    ctx.eventLogger.emit("UpdateRewardEmissions", {
      distinctId: sender,
      pool,
      pairName,
      pairFullName,
      reward_emissions_per_second,
      reward_index,
      reward_manager,
      reward_vault,
      reward_token_address: type,
      reward_token_symbol: symbol,
      reward_token_decimals: decimals,
      reward_token_day_amount: dayAmount,
      message: `Update Reward Emissions in ${pairFullName}`,
    });
  });

position_manager
  .bind({
    address,
    network,
    startCheckpoint: 1500000n,
  })
  .onEventCollectEvent(
    async (event, ctx) => {
      ctx.meter.Counter("collect_fee").add(1);
      const pool = event.data_decoded.pool;

      const mutated = ctx.transaction.effects?.mutated;
      const obj = mutated?.find((item) => item.reference.objectId === pool);

      const amount_a = event.data_decoded.amount_a;
      const amount_b = event.data_decoded.amount_b;
      const recipientAddress = event.data_decoded.recipient;

      const sender = event.sender;

      const poolInfo = await helper.getOrCreatePool(ctx, pool);
      console.log(`onEventCollectEvent poolInfo: ${JSON.stringify(poolInfo)}`);
      const pairName = poolInfo.pairName;
      const pairFullName = poolInfo.pairFullName;

      const _amount_a = Number(amount_a) / Math.pow(10, poolInfo.decimal_a);
      const _amount_b = Number(amount_b) / Math.pow(10, poolInfo.decimal_b);

      const [value_a, value_b] = await helper.calculateValue_USD(
        ctx,
        pool,
        _amount_a,
        _amount_b,
        ctx.timestamp,
        obj?.reference.version
      );

      ctx.eventLogger.emit("CollectFee", {
        distinctId: sender,
        pool,
        pairName,
        pairFullName,
        amount_a: _amount_a,
        amount_a_usd: value_a,
        token_a_symbol: poolInfo.symbol_a,
        token_a_address: poolInfo.type_a,
        amount_b: _amount_b,
        amount_b_usd: value_b,
        token_b_symbol: poolInfo.symbol_b,
        token_b_address: poolInfo.type_b,
        amount_usd: value_a + value_b,
        recipientAddress,
        message: `collect ${_amount_a} ${poolInfo.symbol_a} and  ${_amount_b} ${poolInfo.symbol_b} fee`,
      });
    },
    { resourceChanges: true }
  )
  .onEventCollectRewardEvent(async (event, ctx) => {
    ctx.meter.Counter("collect_reward").add(1);
    const pool = event.data_decoded.pool;
    const amount = event.data_decoded.amount;
    const reward_index = event.data_decoded.reward_index;
    const recipientAddress = event.data_decoded.recipient;
    const vault = event.data_decoded.vault;
    const sender = event.sender;

    const vaultCoin = await helper.setOrGetCoinType(ctx, vault);
    const poolInfo = await helper.getOrCreatePool(ctx, pool);

    const price = await getPriceByType(network, vaultCoin.type, ctx.timestamp);

    const pairName = poolInfo.pairName;
    const pairFullName = poolInfo.pairFullName;

    const _amount = Number(amount) / Math.pow(10, vaultCoin.decimals);

    ctx.eventLogger.emit("CollectReward", {
      distinctId: sender,
      pool,
      pairName,
      pairFullName,
      amount: _amount,
      amount_usd: Number(price || 0) * _amount,
      price: price || 0,
      reward_index,
      recipientAddress,
      vault,
      token_symbol: vaultCoin.symbol,
      token_address: vaultCoin.type,
      message: `collect ${_amount} ${vaultCoin.symbol} reward`,
    });
  });

// pool object
// for (let i = 0; i < constant.POOLS_INFO_MAINNET.length; i++) {
//   const pool_address = constant.POOLS_INFO_MAINNET[i]
//   SuiObjectProcessor.bind({
//     objectId: pool_address,
//     network: SuiNetwork.MAIN_NET,
//     startCheckpoint: 2000000n
//   })
const template = new SuiObjectProcessorTemplate().onTimeInterval(
  async (self, _, ctx) => {
    // When the pool is broken through, it is not recorded
    if (await getCurrentTickStatus(ctx, ctx.objectId)) {
      return;
    }

    if (self) {
      try {
        const fields = await ctx.coder.decodedType(self, pool.Pool.type());
        //get coin addresses
        const poolInfo = await helper.getOrCreatePool(ctx, ctx.objectId);

        const symbol_a = poolInfo.symbol_a;
        const symbol_b = poolInfo.symbol_b;
        const decimal_a = poolInfo.decimal_a;
        const decimal_b = poolInfo.decimal_b;
        const pairName = poolInfo.pairName;
        const pairFullName = poolInfo.pairFullName;

        const [coin_a_address, coin_b_address] = helper.getCoinObjectAddress(
          poolInfo.type
        );
        const coin_a_bridge = helper.getBridgeInfo(coin_a_address);
        const coin_b_bridge = helper.getBridgeInfo(coin_b_address);

        const coin_a_balance =
          Number(fields?.coin_a || 0) / Math.pow(10, decimal_a);
        const coin_b_balance =
          Number(fields?.coin_b || 0) / Math.pow(10, decimal_b);
        console.log(
          `pair: ${pairFullName} \nsymbol:${symbol_a} ${symbol_b}, \ncoin_a_balance ${coin_a_balance} coin_b_balance ${coin_b_balance}, \npool ${ctx.objectId}`
        );
        if (coin_a_balance) {
          ctx.meter.Gauge("coin_a_balance").record(coin_a_balance, {
            token_symbol: symbol_a,
            token_address: poolInfo.type_a,
            pairName,
            pairFullName,
            poolId: ctx.objectId,
          });
        }

        if (coin_b_balance) {
          ctx.meter.Gauge("coin_b_balance").record(coin_b_balance, {
            token_symbol: symbol_b,
            token_address: poolInfo.type_b,
            pairName,
            pairFullName,
            poolId: ctx.objectId,
          });
        }

        //record liquidity
        const liquidity = Number(fields?.liquidity || 0);
        ctx.meter
          .Gauge("liquidity")
          .record(liquidity, { pairName, pairFullName, poolId: ctx.objectId });

        //record price
        // const coin_a2b_price = await helper.getPoolPrice(ctx, ctx.objectId)

        //record tvl
        const turbosPool = await helper.getTurbosPool(ctx.objectId);
        if (turbosPool.data?.is_risk || turbosPool.data?.flag !== 1) {
          ctx.meter
            .Gauge("TVL_by_Pool_USD")
            .record(0, { pairName, pairFullName, poolId: ctx.objectId });
          ctx.meter.Gauge("TVL_by_Pool_Token_USD").record(0, {
            pairName,
            pairFullName,
            bridge: coin_a_bridge,
            token_address: coin_a_address,
            token_symbol: symbol_a,
            poolId: ctx.objectId,
          });
          ctx.meter.Gauge("TVL_by_Pool_Token_USD").record(0, {
            pairName,
            pairFullName,
            bridge: coin_b_bridge,
            token_address: coin_b_address,
            token_symbol: symbol_b,
            poolId: ctx.objectId,
          });
        } else {
          const [tvl_a, tvl_b] = await helper.calculateValue_USD(
            ctx,
            ctx.objectId,
            coin_a_balance,
            coin_b_balance,
            ctx.timestamp
          );
          const tvl = tvl_a + tvl_b;
          console.log(`${pairFullName} tvl: ${tvl}`);
          ctx.meter
            .Gauge("TVL_by_Pool_USD")
            .record(tvl, { pairName, pairFullName, poolId: ctx.objectId });
          ctx.meter.Gauge("TVL_by_Pool_Token_USD").record(tvl_a, {
            pairName,
            pairFullName,
            bridge: coin_a_bridge,
            token_address: coin_a_address,
            token_symbol: symbol_a,
            poolId: ctx.objectId,
          });
          ctx.meter.Gauge("TVL_by_Pool_Token_USD").record(tvl_b, {
            pairName,
            pairFullName,
            bridge: coin_b_bridge,
            token_address: coin_b_address,
            token_symbol: symbol_b,
            poolId: ctx.objectId,
          });

          console.log(
            `pair: ${pairFullName} \nsymbol:${symbol_a} ${symbol_b}, \ncoin_a_balance ${coin_a_balance} coin_b_balance ${coin_b_balance}, \npool ${ctx.objectId} \nliquidity: ${liquidity} \ntvl: ${tvl} `
          );
        }
      } catch (e) {
        console.log(`SuiObjectProcessorTemplate: ${e.message}`);
      }
    }
  },
  1,
  1440,
  undefined,
  { owned: false }
);
// }
