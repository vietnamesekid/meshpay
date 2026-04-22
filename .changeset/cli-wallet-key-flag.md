---
"@meshpay/cli": patch
---

`wallet status` now resolves private key with priority: `--key` flag > `AGENT_PRIVATE_KEY` env > ephemeral
