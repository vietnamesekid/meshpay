# @meshpay/cli

## 0.3.0

### Minor Changes

- 02cb1e2: Add colored output, interactive framework selector, and fix init templates
  - picocolors for colored terminal output across all commands
  - Interactive framework prompt when `--framework` is not provided
  - Fix `--framework` flag parsing (was silently broken)
  - Fix generated `meshpay.config.ts` to use `meshpay().withWallet().withFacilitator()` builder API
  - Fix generated `.env.local` with correct env vars (`AGENT_PRIVATE_KEY`, `CDP_API_KEY`, `MESHPAY_AP2_KEY`)
  - Fix example tool templates to include `zod` parameters and `client` argument
  - Fix double shebang in built output
  - Color `wallet status` and `wallet probe` output

## 0.2.0

### Minor Changes

- Add Polygon Amoy testnet support, EIP-3009 typed-data signing, AP2 authorization layer, and security hardening for v1 readiness. Includes real on-chain x402 agent example with verified on-chain transactions.

### Patch Changes

- Updated dependencies
  - @meshpay/core@0.2.0
  - @meshpay/wallet@0.2.0
  - @meshpay/protocols@0.2.0
