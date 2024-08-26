import { SuiNetwork } from "@sentio/sdk/sui";

export const network = SuiNetwork.TEST_NET;
export const address =  "0xfea145c1608cd5366ffcf278c0124d9f416b30e33a6a47ee12c615420ee0224c"
// https://testnet.suivision.xyz/package/0xfea145c1608cd5366ffcf278c0124d9f416b30e33a6a47ee12c615420ee0224c
// First event: https://testnet.suivision.xyz/txblock/8UEqQsENXMgWRfcsC8b4h4twUGFQ2ZHfcbU3R6MiJmQS
export const startCheckPoint = 90_000_000n;
export const skipStartBlockValidation = true;

export * as turbos from '../types/sui/testnet/turbos.js';
