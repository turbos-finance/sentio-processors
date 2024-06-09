// @ts-nocheck
import {
  SuiObjectProcessor,
  SuiContext,
  SuiObjectContext,
} from "@sentio/sdk/sui";
import { getPriceByType, token } from "@sentio/sdk/utils";
import * as constant from "../constant-turbos.js";
import { SuiNetwork } from "@sentio/sdk/sui";
import axios from "axios";
import { LRUCache } from "lru-cache";

export const MAX_TICK_INDEX = 443636;
export const MIN_TICK_INDEX = -443636;

const wormholeTokens = new Set([
  "0xa198f3be41cda8c07b3bf3fee02263526e535d682499806979a111e88a5a8d0f",
  "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881",
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf",
  "0xe32d3ebafa42e6011b87ef1087bbc6053b499bf6f095807b9013aff5a6ecd7bb",
  "0x909cba62ce96d54de25bec9502de5ca7b4f28901747bbf96b76c2e63ec5f1cba",
  "0xcf72ec52c0f8ddead746252481fb44ff6e8485a39b803825bde6b00d77cdb0bb",
  "0xb231fcda8bbddb31f2ef02e6161444aec64a514e2c89279584ac9806ce9cf037",
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c",
  "0x1e8b532cca6569cab9f9b9ebc73f8c13885012ade714729aa3b450e0339ac766",
  "0xb848cce11ef3a8f62eccea6eb5b35a12c4c2b1ee1af7755d02d7bd6218e8226f",
  "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881",
  "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5",
  "0x6081300950a4f1e2081580e919c210436a1bed49080502834950d31ee55a2396",
  "0x66f87084e49c38f76502d17f87d17f943f183bb94117561eb573e075fdc5ff75",
  "0xdbe380b13a6d0f5cdedd58de8f04625263f113b3f9db32b3e1983f49e2841676",
  "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8",
]);

export function getBridgeInfo(address: string) {
  if (wormholeTokens.has(address)) {
    return "wormhole";
  } else {
    return "native";
  }
}

//get coin address without suffix
export function getCoinObjectAddress(type: string) {
  let coin_a_address = "";
  let coin_b_address = "";
  const regex = /0x[a-fA-F0-9]+:/g;
  const matches = type.match(regex);
  if (matches && matches.length >= 2) {
    coin_a_address = matches[1].slice(0, -1);
    coin_b_address = matches[2].slice(0, -1);
  }
  return [coin_a_address, coin_b_address];
}

//get full coin address with suffix
export function getCoinFullAddress(type: string) {
  let coin_a_address = "";
  let coin_b_address = "";
  const regex_a = /<[^,]+,/g;
  const regex_b = /, [^\s>]+,/g;
  const matches_a = type.match(regex_a);
  const matches_b = type.match(regex_b);
  if (matches_a) {
    coin_a_address = matches_a[0].slice(1, -1);
  }
  if (matches_b) {
    coin_b_address = matches_b[0].slice(2, -1);
  }
  return [coin_a_address, coin_b_address];
}

// cache object
const poolCache = new LRUCache({
  max: 2000,
  maxSize: 5000,
  ttl: 1000 * 60 * 5,
});

export async function setOrGetPoolObject(
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  version?: string
) {
  let poolInfo = poolCache.get(`${pool}${version}`);
  if (!poolInfo) {
    poolInfo = getPoolObject(ctx, pool, version);
    poolCache.set(pool, poolInfo);
    console.log("set pool object for: " + pool + ", version: " + version);
  }
  return await poolInfo;
}

export async function getPoolObject(
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  version?: string
) {
  let obj;
  if (version) {
    const postObj = await ctx.client.tryGetPastObject({
      id: pool,
      version: Number(version),
      options: { showType: true, showContent: true },
    });
    obj = {
      data: postObj.details,
    };
  } else {
    obj = await ctx.client.getObject({
      id: pool,
      options: { showType: true, showContent: true },
    });
  }

  return obj;
}

interface poolInfo {
  name_a: string;
  name_b: string;
  type_a: string;
  type_b: string;
  symbol_a: string;
  symbol_b: string;
  decimal_a: number;
  decimal_b: number;
  pairName: string; //symbol_a + symbol_b + fee
  pairFullName: string; //name_a + name_b + fee
  type: string;
  current_tick: number;
}

let poolInfoMap = new Map<string, Promise<poolInfo>>();
let coinInfoMap = new Map<string, Promise<token.TokenInfo>>();

export async function buildCoinInfo(
  ctx: SuiContext | SuiObjectContext,
  coinAddress: string
): Promise<token.TokenInfo> {
  let [symbol, decimal, name] = ["unk", 100, "unk"];
  try {
    const metadata = await ctx.client.getCoinMetadata({
      coinType: coinAddress,
    });
    symbol = metadata!.symbol;
    decimal = metadata!.decimals;
    name = metadata!.name;
    console.log(`build coin metadata ${symbol} ${decimal} ${name}`);
  } catch (e) {
    console.log(`Build coin error ${e.message}}`);
  }
  return {
    symbol,
    name,
    decimal,
  };
}

export const getOrCreateCoin = async function (
  ctx: SuiContext | SuiObjectContext,
  coinAddress: string
): Promise<token.TokenInfo> {
  let coinInfo = coinInfoMap.get(coinAddress);
  if (!coinInfo) {
    coinInfo = buildCoinInfo(ctx, coinAddress);
    coinInfoMap.set(coinAddress, coinInfo);
    console.log("set coinInfoMap for " + coinAddress);
  }
  return await coinInfo;
};

export async function buildPoolInfo(
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  version?: string
): Promise<poolInfo> {
  //pool not in list
  // if (!constant.POOLS_INFO_MAINNET.includes(pool)) {
  //     console.log(`Pool not in array ${pool}`)
  // }

  let [
    name_a,
    name_b,
    type_a,
    type_b,
    symbol_a,
    symbol_b,
    decimal_a,
    decimal_b,
    pairName,
    pairFullName,
    type,
    fee_label,
    current_tick,
  ] = ["", "", "", "", 0, 0, "", "", "", "", "NaN", ""];
  let obj;
  try {
    // @ts-ignore
    if (version) {
      const postObj = await ctx.client.tryGetPastObject({
        id: pool,
        version: Number(version),
        options: { showType: true, showContent: true },
      });
      obj = {
        data: postObj.details,
      };
    } else {
      obj = await ctx.client.getObject({
        id: pool,
        options: { showType: true, showContent: true },
      });
    }
    console.log(
      `buildPoolInfo ${pool}, getObject value:  ${obj}, ${JSON.stringify(obj)}`
    );
    // @ts-ignore
    type = obj!.data.type;
    // @ts-ignore
    if (obj!.data.content.fields.fee) {
      fee_label =
        (Number(obj!.data.content.fields.fee) / 10000).toFixed(2) + "%";
    }

    if (obj!.data.content.fields.tick_current_index.fields.bits) {
      current_tick = obj!.data.content.fields.tick_current_index.fields.bits;
    }

    let [coin_a_full_address, coin_b_full_address] = ["", ""];
    if (type) {
      [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(type);
    }
    console.log(
      `buildPoolInfo ${pool}, coin type:  ${coin_a_full_address}, ${coin_b_full_address}`
    );
    const coinInfo_a = await getOrCreateCoin(ctx, coin_a_full_address);
    const coinInfo_b = await getOrCreateCoin(ctx, coin_b_full_address);
    type_a = coin_a_full_address;
    type_b = coin_b_full_address;
    symbol_a = coinInfo_a.symbol;
    symbol_b = coinInfo_b.symbol;
    decimal_a = coinInfo_a.decimal;
    decimal_b = coinInfo_b.decimal;
    name_a = coinInfo_a.name;
    name_b = coinInfo_b.name;
    pairName = symbol_a + "-" + symbol_b + " " + fee_label;
    pairFullName = coinInfo_a.name + "-" + coinInfo_b.name + " " + fee_label;
  } catch (e) {
    console.log(
      `Build pool error ${
        e.message
      } pool: ${pool} ,version: ${version} obj : ${obj} ${JSON.stringify(obj)}`
    );
    throw new Error(
      `Build pool error ${
        e.message
      } pool: ${pool}, version: ${version}, obj : ${obj} ${JSON.stringify(obj)}`
    );
  }

  return {
    name_a,
    name_b,
    type_a,
    type_b,
    symbol_a,
    symbol_b,
    decimal_a,
    decimal_b,
    pairName,
    pairFullName,
    type,
    current_tick,
  };
}

export const getOrCreatePool = async function (
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  version?: string
): Promise<poolInfo> {
  let infoPromise = poolInfoMap.get(pool);
  if (!infoPromise) {
    infoPromise = buildPoolInfo(ctx, pool, version);
    poolInfoMap.set(pool, infoPromise);
    console.log("set poolInfoMap for " + pool);
  }
  return await infoPromise;
};

export async function getPoolPrice(
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  version?: string
) {
  let coin_a2b_price = 0;
  try {
    // @ts-ignore
    let obj;
    if (version) {
      const postObj = await ctx.client.tryGetPastObject({
        id: pool,
        version: Number(version),
        options: { showType: true, showContent: true },
      });
      obj = {
        data: postObj.details,
      };
    } else {
      obj = await ctx.client.getObject({
        id: pool,
        options: { showType: true, showContent: true },
      });
    }
    const sqrt_price = Number(obj!.data.content.fields.sqrt_price);
    if (!sqrt_price) {
      console.log(`get pool price error at ${ctx}`);
    }
    const poolInfo = await getOrCreatePool(ctx, pool);

    const pairName = poolInfo.pairName;
    const pairFullName = poolInfo.pairFullName;
    const coin_b2a_price =
      (1 / Number(sqrt_price) ** 2) *
      2 ** 128 *
      10 ** (poolInfo.decimal_b - poolInfo.decimal_a);
    coin_a2b_price = 1 / coin_b2a_price;
    ctx.meter
      .Gauge("a2b_price")
      .record(coin_a2b_price, { pairName, pairFullName, poolId: pool });
    ctx.meter
      .Gauge("b2a_price")
      .record(coin_b2a_price, { pairName, pairFullName, poolId: pool });
  } catch (e) {
    console.log(
      `get pool price error ${
        e.message
      }},pool ${pool}, version ${version}, obj:${obj} , ${JSON.stringify(obj)}`
    );
    throw new Error(
      `get pool price error ${
        e.message
      }},pool ${pool}, version ${version}, obj:${obj} , ${JSON.stringify(obj)}`
    );
  }
  return coin_a2b_price;
}

export async function calculateValue_USD(
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  amount_a: number,
  amount_b: number,
  date: Date,
  version?: string
) {
  let [value_a, value_b] = [0, 0];
  try {
    const poolInfo = await getOrCreatePool(ctx, pool);
    const [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(
      poolInfo.type
    );
    const price_a = await getPriceByType(
      SuiNetwork.MAIN_NET,
      coin_a_full_address,
      date
    );
    const price_b = await getPriceByType(
      SuiNetwork.MAIN_NET,
      coin_b_full_address,
      date
    );
    console.log(`sentio sdk price_a ${price_a}, price_b ${price_b}`);
    const coin_a2b_price = await getPoolPrice(ctx, pool, version);

    if (price_a) {
      value_a = amount_a * price_a;
      //handle the case of low liquidity
      if (price_b) {
        value_b = amount_b * price_b;
      } else {
        value_b = (amount_b / coin_a2b_price) * price_a;
      }
    } else if (price_b) {
      value_a = amount_a * coin_a2b_price * price_b;
      value_b = amount_b * price_b;
    } else {
      console.log(
        `price not in sui coinlist, calculate value failed at coin_a: ${coin_a_full_address},coin_b: ${coin_b_full_address}}`
      );
    }
  } catch (e) {
    console.log(`calculate value error ${e.message} , pool : #${pool}`);
  }
  return [value_a, value_b];
}

export async function calculateSwapVol_USD(
  type: string,
  amount_a: number,
  amount_b: number,
  atob: Boolean,
  date: Date
) {
  let vol: number = 0;
  let price_a;
  let price_b;

  console.log(`calculateSwapVol_USD type: ${type}`);
  try {
    const [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(type);
    price_a = await getPriceByType(
      SuiNetwork.MAIN_NET,
      coin_a_full_address,
      date
    );
    price_b = await getPriceByType(
      SuiNetwork.MAIN_NET,
      coin_b_full_address,
      date
    );

    if (price_a) {
      vol = amount_a * price_a;
    } else if (price_b) {
      vol = amount_b * price_b;
      // use exchange rate to try to fill price_a
      if (amount_a != 0) {
        price_a = (amount_b / amount_a) * price_b;
      }
    } else {
      console.log(
        `price not in sui coinlist, calculate vol failed for pool w/ ${type}`
      );
    }
  } catch (e) {
    console.log(` calculate swap value error ${e.message} at ${type}`);
  }
  return [vol, price_a, price_b];
}

// export async function getPoolRewardCoinType(
//   ctx: SuiContext | SuiObjectContext,
//   objectId: string
// ) {
//   const rewardCoin = {
//     type: "",
//     symbol: "",
//     decimals: 9,
//   };
//   let obj;
//   try {
//     // @ts-ignore
//     obj = await ctx.client.getObject({
//       id: objectId,
//       options: { showType: true, showContent: true },
//     });
//     const type = obj!.data.content.type;
//     const typeArray = type.match(/\<([^)]*)\>/);
//     const coinType = typeArray[1];
//     const coin = await ctx.client.getCoinMetadata({ coinType });

//     rewardCoin.type = coinType;
//     rewardCoin.symbol = coin!.symbol;
//     rewardCoin.decimals = coin!.decimals;
//   } catch (e) {
//     console.log(
//       `get pool reward coin type error ${
//         e.message
//       }, objectId:${objectId}, obj:${obj}, ${JSON.stringify(obj)}`
//     );
//     throw new Error(
//       `get pool reward coin type error ${
//         e.message
//       }, objectId:${objectId}, obj:${obj}, ${JSON.stringify(obj)}`
//     );
//   }
//   return rewardCoin;
// }

export async function calculateTokenValue_USD(
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  date: Date,
  version?: string
) {
  let [value_a, value_b] = [0, 0];

  // When the pool is broken through, it is not recorded
  if (await getCurrentTickStatus(ctx, pool, version)) {
    return;
  }

  try {
    // @ts-ignore
    let obj;
    if (version) {
      const postObj = await ctx.client.tryGetPastObject({
        id: pool,
        version: Number(version),
        options: { showType: true, showContent: true },
      });
      obj = {
        data: postObj.details,
      };
    } else {
      obj = await ctx.client.getObject({
        id: pool,
        options: { showType: true, showContent: true },
      });
    }
    const coin_a = Number(obj!.data.content.fields.coin_a || 0);
    const coin_b = Number(obj!.data.content.fields.coin_b || 0);

    const poolInfo = await getOrCreatePool(ctx, pool);

    const [coin_a_full_address, coin_b_full_address] = getCoinFullAddress(
      poolInfo.type
    );

    const pairName = poolInfo.pairName;
    const pairFullName = poolInfo.pairFullName;
    const name_a = poolInfo.name_a;
    const name_b = poolInfo.name_b;

    const price_a = await getPriceByType(
      SuiNetwork.MAIN_NET,
      coin_a_full_address,
      date
    );
    const price_b = await getPriceByType(
      SuiNetwork.MAIN_NET,
      coin_b_full_address,
      date
    );
    const coin_a2b_price = await getPoolPrice(ctx, pool, version);

    const amount_a = Number(coin_a) / 10 ** poolInfo.decimal_a;
    const amount_b = Number(coin_b) / 10 ** poolInfo.decimal_b;

    if (price_a) {
      value_a = amount_a * price_a;
      //handle the case of low liquidity
      if (price_b) {
        value_b = amount_b * price_b;
      } else {
        value_b = (amount_b / coin_a2b_price) * price_a;
      }
    } else if (price_b) {
      value_a = amount_a * coin_a2b_price * price_b;
      value_b = amount_b * price_b;
    } else {
      console.log(
        `price not in sui coinlist, calculate value failed at coin_a: ${coin_a_full_address},coin_b: ${coin_b_full_address}}`
      );
    }

    const turbosPool = await getTurbosPool(pool);

    if (turbosPool.data?.is_risk || turbosPool.data?.flag !== 1) {
      value_a = 0;
      value_b = 0;
    }

    ctx.meter.Gauge("TVL_by_Token_USD").record(value_a, {
      pairName,
      pairFullName,
      name: name_a,
      symbol: poolInfo.symbol_a,
      type: poolInfo.type_a,
      poolId: pool,
    });
    ctx.meter.Gauge("TVL_by_Token_USD").record(value_b, {
      pairName,
      pairFullName,
      name: name_b,
      symbol: poolInfo.symbol_b,
      type: poolInfo.type_b,
      poolId: pool,
    });

    ctx.meter.Counter("TVL_by_Token_USD_Counter").add(value_b!, {
      pairName,
      pairFullName,
      name: name_b,
      symbol: poolInfo.symbol_b,
      type: poolInfo.type_b,
      poolId: pool,
    });
    ctx.meter.Counter("TVL_by_Token_USD_Counter").add(value_a!, {
      pairName,
      pairFullName,
      name: name_a,
      symbol: poolInfo.symbol_a,
      type: poolInfo.type_a,
      poolId: pool,
    });

    ctx.meter.Gauge("TVL_by_Token").record(amount_a, {
      pairName,
      pairFullName,
      name: name_a,
      symbol: poolInfo.symbol_a,
      type: poolInfo.type_a,
      poolId: pool,
    });
    ctx.meter.Gauge("TVL_by_Token").record(amount_b, {
      pairName,
      pairFullName,
      name: name_b,
      symbol: poolInfo.symbol_b,
      type: poolInfo.type_b,
      poolId: pool,
    });

    ctx.meter.Counter("TVL_by_Token_Counter").add(amount_a!, {
      pairName,
      pairFullName,
      name: name_a,
      symbol: poolInfo.symbol_a,
      type: poolInfo.type_a,
      poolId: pool,
    });
    ctx.meter.Counter("TVL_by_Token_Counter").add(amount_b!, {
      pairName,
      pairFullName,
      name: name_b,
      symbol: poolInfo.symbol_b,
      type: poolInfo.type_b,
      poolId: pool,
    });
  } catch (e) {
    console.log(`calculate token liquidity usd error ${e.message} at ${pool}`);
    throw new Error(
      `calculate token liquidity usd error ${e.message} at ${pool}, version: ${version}`
    );
  }
}

export async function getCurrentTickStatus(
  ctx: SuiContext | SuiObjectContext,
  pool: string,
  version?: string
) {
  let current_tick = "";
  // @ts-ignore
  let obj;
  try {
    if (version) {
      const postObj = await ctx.client.tryGetPastObject({
        id: pool,
        version: Number(version),
        options: { showType: true, showContent: true },
      });
      obj = {
        data: postObj.details,
      };
    } else {
      obj = await ctx.client.getObject({
        id: pool,
        options: { showType: true, showContent: true },
      });
    }
  } catch (err) {
    console.log(`get pool current tick error: ${err.message}, pool: ${pool}`);
    throw new Error(
      `get pool current tick error: ${err.message}, pool: ${pool}, version: ${version}`
    );
  }

  // console.log(`getCurrentTickStatus poolId: ${pool}; version: ${version}, ${JSON.stringify(obj)}`);
  if (obj!.data.content.fields.tick_current_index.fields.bits) {
    current_tick = obj!.data.content.fields.tick_current_index.fields.bits;
  }

  return current_tick === MAX_TICK_INDEX || current_tick === MIN_TICK_INDEX;
}

let cachePool = new Map();

export async function getTurbosPool(pool: string) {
  if (!pool) {
    return {
      error: true,
    };
  }

  let ttl = 1 * 60 * 30;
  let nowSec = Math.floor(Date.now() / 1000);
  let key = pool + Math.floor(nowSec / ttl); // 30分钟缓存

  let value = cachePool.get(key);
  if (!value) {
    let promise = axios.get(`https://api.turbos.finance/pools/ids?ids=${pool}`);
    value = {
      promise,
      updateTime: nowSec,
    };

    cachePool.set(key, value);
  }

  try {
    let response = await value.promise;
    if (Math.floor(Date.now() / 1000) - nowSec > ttl) {
      cachePool.delete(key);
    }

    return {
      data: response.data.data[0],
    };
  } catch (err) {
    console.log(`get pools info, ${err.message}`);
  }

  return {
    error: true,
  };
}

// cache VaultCoinType
interface VaultCoinType {
  type: string;
  symbol: string;
  decimals: number;
}

let vaultCoinTypeMap = new Map<string, Promise<VaultCoinType>>();

export async function setOrGetCoinType(
  ctx: SuiContext | SuiObjectContext,
  objectId: string
) {
  let vaultCoinInfo = vaultCoinTypeMap.get(objectId);
  if (!vaultCoinInfo) {
    vaultCoinInfo = getVaultCoinType(ctx, objectId);
    vaultCoinTypeMap.set(objectId, vaultCoinInfo);
    console.log("set vaultCoinType for " + objectId);
  }
  return await vaultCoinInfo;
}

export async function getVaultCoinType(
  ctx: SuiContext | SuiObjectContext,
  objectId: string
) {
  const rewardCoin = {
    type: "",
    symbol: "",
    decimals: 9,
  };
  try {
    // @ts-ignore
    const obj = await ctx.client.getObject({
      id: objectId,
      options: { showType: true, showContent: true },
    });
    const type = obj!.data.content.type;
    const typeArray = type.match(/\<([^)]*)\>/);
    const coinType = typeArray[1];
    const coin = buildCoinInfo(ctx, coinType);
    // const coin = await ctx.client.getCoinMetadata({ coinType });

    rewardCoin.type = coinType;
    rewardCoin.symbol = coin!.symbol;
    rewardCoin.decimals = coin!.decimals;
  } catch (e) {
    console.log(
      `get pool or vault reward coin type error ${e.message} objectId: ${objectId}`
    );
    throw new Error(
      `get pool or vault reward coin type error ${e.message} objectId: ${objectId}`
    );
  }
  return rewardCoin;
}
