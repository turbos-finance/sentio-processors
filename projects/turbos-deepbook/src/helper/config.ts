import { SuiChainId } from "@sentio/chain";

export const skipStartBlockValidation = false;

export const startCheckPoint = 57_500_000n;

export const chainId = SuiChainId.SUI_MAINNET;

export * as deepbook from "../types/sui/deepbook.js";
export {
  mainnetPools as originPools,
  mainnetCoins as originCoins,
} from "./constants.js";
