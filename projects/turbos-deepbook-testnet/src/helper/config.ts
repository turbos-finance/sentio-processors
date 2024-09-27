import { SuiChainId } from "@sentio/chain";

export const skipStartBlockValidation = true;

export const startCheckPoint = 113_894_469n;

export * as deepbook from "../types/sui/testnet/deepbook.js";

export const chainId = SuiChainId.SUI_TESTNET;

export {
  testnetPools as originPools,
  testnetCoins as originCoins,
} from "./constants.js";
