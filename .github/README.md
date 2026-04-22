# MeshPay

**Micropayment infrastructure for AI agents — spend-guarded, non-custodial, on-chain.**

MeshPay enables AI agents to autonomously pay for APIs and tools using USDC on EVM chains. Per-call and daily spend caps are enforced locally before any transaction reaches the network. Built on [x402](https://x402.org) and AP2 (Agent Payment Protocol v2).

## Why MeshPay

AI agents increasingly need to call paid APIs — web search, browser automation, deep research, compute. Today this requires either pre-funding a server wallet (custodial, risky) or building custom payment logic per tool (slow, error-prone).

MeshPay gives agents a non-custodial wallet with programmable spend limits, and wraps any API call in a payment gate using standard protocols. The agent signs; the facilitator settles; the tool runs.

## Key properties

- **Non-custodial** — private keys never leave the client
- **Spend caps** — per-call and daily limits enforced locally, before signing
- **Framework-native** — drops into Vercel AI SDK, Mastra, and OpenAI Agents SDK with one function call
- **Protocol-based** — built on x402 (HTTP 402 payment flow) and AP2 (agent identity + delegation)
- **Auditable** — every payment produces an on-chain receipt with txHash

## Links

- [Documentation](https://github.com/vietnamesekid/meshpay#readme)
- [npm packages](https://www.npmjs.com/org/meshpay)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Discussions](https://github.com/vietnamesekid/meshpay/discussions)
