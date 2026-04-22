---
"@meshpay/cli": minor
---

Add colored output, interactive framework selector, and fix init templates

- picocolors for colored terminal output across all commands
- Interactive framework prompt when `--framework` is not provided
- Fix `--framework` flag parsing (was silently broken)
- Fix generated `meshpay.config.ts` to use `meshpay().withWallet().withFacilitator()` builder API
- Fix generated `.env.local` with correct env vars (`AGENT_PRIVATE_KEY`, `CDP_API_KEY`, `MESHPAY_AP2_KEY`)
- Fix example tool templates to include `zod` parameters and `client` argument
- Fix double shebang in built output
- Color `wallet status` and `wallet probe` output
