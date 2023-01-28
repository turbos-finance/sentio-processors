import { listing } from './types/aptos/seashrine'
import { getPrice, getCoinInfo, scaleDown } from "@sentio-processor/common/dist/aptos/coin"
import { AccountEventTracker, Counter, Gauge } from "@sentio/sdk";
import { timestamp, type_info } from "@sentio/sdk-aptos/lib/builtin/0x1"

export const volOptions = {
  sparse: true,
  aggregationConfig: {
    intervalInMinutes: [60],
    // discardOrigin: false
  }
}
const commonOptions = { sparse: false }

const vol = Gauge.register("volume", volOptions)
const vol_apt = Gauge.register("volume_apt", volOptions)

const accountTracker = AccountEventTracker.register("users")
const totalTx = new Counter("tx", commonOptions)


listing.bind({ startVersion: 6393932 })
  .onEventBuyListingEvent(async (event, ctx) => {
    ctx.meter.Counter('buy_listing').add(1)
    accountTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })
    totalTx.add(ctx, 1)

    const amount = event.data_typed.min_price
    const originalCoinInfo = event.data_typed.coin_type
    const coinType = originalCoinInfo.account_address + "::" + hex_to_ascii(originalCoinInfo.module_name) + "::" + hex_to_ascii(originalCoinInfo.struct_name)
    const coinInfo = getCoinInfo(coinType)
    const timestamp = event.data_typed.at
    const collection = event.data_typed.token_id.token_data_id.collection
    const coinPrice = await getPrice(coinType, Number(timestamp))

    const volume = scaleDown(amount, coinInfo.decimals).multipliedBy(coinPrice)
    const creator = event.data_typed.creator



    vol.record(ctx, volume, { creator: creator, collection: collection })
    vol_apt.record(ctx, scaleDown(amount, coinInfo.decimals), { creator: creator, collection: collection })

  })
  .onEventCancelListingEvent(async (event, ctx) => {
    ctx.meter.Counter('cancel_listing').add(1)
    accountTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })


  })
  .onEventCreateListingEvent(async (event, ctx) => {
    ctx.meter.Counter('create_listing').add(1)
    accountTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })


  })
  .onEventUpdateListingEvent(async (event, ctx) => {
    ctx.meter.Counter('update_listing').add(1)
    accountTracker.trackEvent(ctx, { distinctId: ctx.transaction.sender })
  })

function hex_to_ascii(str1: String) {
  var hex = str1.toString();
  if (hex.startsWith("0x")) {
    hex = hex.substring(2)
  }
  var str = '';
  for (var n = 0; n < hex.length; n += 2) {
    str += String.fromCharCode(parseInt(hex.substr(n, 2), 16));
  }
  return str;
}

function extractTypeName(typeInfo: type_info.TypeInfo) {
  var rawName = hex_to_ascii(typeInfo.struct_name)
  if (rawName.startsWith("Coin<")) {
    return rawName.substring(5, rawName.length - 1)
  } else {
    return rawName
  }
}