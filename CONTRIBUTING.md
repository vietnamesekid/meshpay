# Contributing to MeshPay

Thank you for your interest in contributing. This document covers everything you need to get started.

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Project structure](#project-structure)
- [Making changes](#making-changes)
- [Submitting a pull request](#submitting-a-pull-request)
- [Release process](#release-process)

---

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Please report unacceptable behavior to the maintainers.

---

## Getting started

**Prerequisites:** Node ≥ 20, pnpm 10

```bash
git clone https://github.com/vietnamesekid/meshpay.git
cd meshpay
pnpm install
pnpm build
pnpm test:ci
```

If all tests pass, you're ready.

---

## Development workflow

```bash
# Watch mode — rebuilds affected packages on save
pnpm dev

# Type check all packages
pnpm typecheck

# Lint
pnpm lint

# Run tests (watch mode)
pnpm test

# Run tests (single pass, used in CI)
pnpm test:ci
```

Turbo caches build outputs — only changed packages rebuild.

---

## Project structure

```
meshpay/
├── packages/
│   ├── core/          # Types, spend guards, error classes
│   ├── wallet/        # SessionWallet — EIP-3009 signing, spend caps
│   ├── protocols/     # x402 and AP2 protocol implementations
│   ├── adapters/      # Framework integrations (Vercel AI, Mastra, OpenAI)
│   └── cli/           # meshpay CLI
├── internal/          # Private workspace packages (not published)
├── examples/
│   └── vercel-agent/  # End-to-end reference implementation
└── docs/
```

Dependencies flow in one direction: `core` ← `wallet`, `protocols` ← `adapters`, `cli`.

---

## Making changes

### Branching

Branch from `master`:

```bash
git checkout -b feat/your-feature
# or
git checkout -b fix/issue-number-short-description
```

### Commit style

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(adapters): add Langchain adapter
fix(wallet): reset daily cap at UTC midnight
docs: update CONTRIBUTING
chore: upgrade tsup to 9.x
```

Scopes match package names: `core`, `wallet`, `protocols`, `adapters`, `cli`, `examples`.

### Adding a changeset

Every change that affects a published package needs a changeset:

```bash
pnpm changeset
```

Select the affected packages, choose the bump type (`patch` / `minor` / `major`), and write a one-sentence summary. The changeset file goes in `.changeset/` — commit it with your changes.

**When to bump:**
- `patch` — bug fix, internal refactor, docs
- `minor` — new feature, new export, new adapter
- `major` — breaking API change

### Tests

- Unit tests live in `src/__tests__/` or alongside source as `*.test.ts`
- Tests use [Vitest](https://vitest.dev/)
- Do not mock core domain logic (wallet signing, spend guards) — test it directly
- Keep tests fast; avoid real network calls in unit tests

### TypeScript

- Strict mode is enabled everywhere
- No `any` — use `unknown` and narrow
- Exported types must be documented with JSDoc if non-obvious

---

## Submitting a pull request

1. Push your branch and open a PR against `master`
2. Fill in the PR template
3. Ensure CI is green (typecheck, lint, build, test)
4. Include a changeset if your change affects a published package
5. Request a review — maintainers aim to respond within 48 hours

PRs that introduce breaking changes must:
- Use a `major` changeset
- Document the migration path in the PR description

---

## Release process

Releases are automated via [Changesets](https://github.com/changesets/changesets) and GitHub Actions.

1. Merging to `master` triggers the Release workflow
2. If there are pending changesets, the workflow opens (or updates) a "Release PR" that bumps versions and updates changelogs
3. Merging the Release PR triggers `pnpm release` → publishes to npm

Maintainers control what goes out by deciding when to merge the Release PR.

---

## Questions?

Open a [Discussion](https://github.com/vietnamesekid/meshpay/discussions) — issues are for bugs and feature requests.
