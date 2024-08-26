import { readFileSync, writeFileSync } from "node:fs";

const content = readFileSync(
  "../../node_modules/@mysten/deepbook-v3/src/utils/constants.ts",
  "utf8"
);

writeFileSync(
  "./src/helper/constants.ts",
  content
    .replace("../types/index.js", "@mysten/deepbook-v3")
    .replaceAll(
      "0x0000000000000000000000000000000000000000000000000000000000000002",
      "0x2"
    )
);
