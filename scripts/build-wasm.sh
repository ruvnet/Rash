#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
rustup target add wasm32-unknown-unknown
RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=--max-memory=67108864" cargo build --locked --release --target wasm32-unknown-unknown -p rash-runtime
mkdir -p web/runtime/pkg
cp target/wasm32-unknown-unknown/release/rash_runtime.wasm web/runtime/pkg/rash_runtime.wasm
node web/runtime/provenance.mjs
node web/runtime/verify.mjs
