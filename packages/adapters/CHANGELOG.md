# @meshpay/adapters

## 0.3.0

### Minor Changes

- 4ea88f1: Introduce `MeshpayClient` builder pattern via `meshpay()` factory.

  `paidTool()` across all adapters (Vercel AI SDK, Mastra, OpenAI) now accepts a `MeshpayClient` instance as a required second argument instead of relying on module-level global state set via `setDefaultWallet` / `setDefaultFacilitator`.

  **Migration:**

  ```ts
  // Before
  import { setDefaultWallet, setDefaultFacilitator } from '@meshpay/adapters'
  setDefaultWallet(wallet)
  setDefaultFacilitator(facilitator)
  const tool = paidTool({ ... })

  // After
  import { meshpay } from '@meshpay/adapters'
  const client = meshpay()
    .withWallet(wallet)
    .withFacilitator(facilitator)
  const tool = paidTool({ ... }, client)
  ```

## 0.2.0

### Minor Changes

- Add Polygon Amoy testnet support, EIP-3009 typed-data signing, AP2 authorization layer, and security hardening for v1 readiness. Includes real on-chain x402 agent example with verified on-chain transactions.

### Patch Changes

- Updated dependencies
  - @meshpay/core@0.2.0
  - @meshpay/wallet@0.2.0
  - @meshpay/protocols@0.2.0
