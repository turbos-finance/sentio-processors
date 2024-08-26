import { SuiNetwork } from "@sentio/sdk/sui";

export const network = SuiNetwork.MAIN_NET;
export const address = "0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1";
export const startCheckPoint = 1_500_000n;
export const skipStartBlockValidation = false;

export * as turbos from '../types/sui/turbos.js';
