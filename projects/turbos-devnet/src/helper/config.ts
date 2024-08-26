import { SuiNetwork } from "@sentio/sdk/sui";

export const network = SuiNetwork.TEST_NET;
export const address =  "0x800d280a8c03db824964d49e76fc8504c10c2d63b81c962af287e1157f15c920"
// https://testnet.suivision.xyz/package/0x800d280a8c03db824964d49e76fc8504c10c2d63b81c962af287e1157f15c920
export const startCheckPoint = 90_000_000n;
export const skipStartBlockValidation = true;

export * as turbos from '../types/sui/testnet/turbos.js';
