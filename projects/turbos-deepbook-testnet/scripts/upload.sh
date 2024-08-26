#!/usr/bin/env sh

set -ex

cp -f $PWD/../turbos-deepbook/src/processor.ts $PWD/src/processor.ts

npx sentio upload "$@"

rm -f $PWD/src/processor.ts
