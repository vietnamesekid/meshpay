---
"@meshpay/adapters": minor
---

Introduce `MeshpayClient` builder pattern via `meshpay()` factory.

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
