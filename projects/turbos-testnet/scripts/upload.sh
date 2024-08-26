#!/usr/bin/env sh

set -ex

cp -f $PWD/../turbos/src/helper/turbos-clmm-helper.ts $PWD/src/helper/turbos-clmm-helper.ts
cp -f $PWD/../turbos/src/processor.ts $PWD/src/processor.ts

npx sentio upload "$@"

rm -f $PWD/src/helper/turbos-clmm-helper.ts
rm -f $PWD/src/processor.ts
