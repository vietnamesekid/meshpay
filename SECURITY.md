# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.x (latest) | ✓ |

We publish security fixes as patch releases on the latest minor version.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report them privately via [GitHub Security Advisories](https://github.com/vietnamesekid/meshpay/security/advisories/new).

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected package(s) and version(s)
- Any suggested fix, if you have one

We aim to acknowledge reports within **48 hours** and provide an initial assessment within **5 business days**. We'll keep you informed as we work on a fix and coordinate disclosure timing with you.

## Scope

Areas of particular interest:

- **Wallet / key management** — anything that could expose or compromise private keys
- **Spend cap enforcement** — bypasses that allow overspending beyond declared caps
- **Payment flow** — replay attacks, signature malleability, or quote manipulation
- **AP2 token issuance** — forgery or unauthorized token generation
- **Dependency vulnerabilities** — critical CVEs in dependencies we bundle

Out of scope: issues in example code, theoretical attacks with no realistic exploit path, and social engineering.

## Disclosure policy

We follow coordinated disclosure. Once a fix is ready and published, we'll issue a GitHub Security Advisory and credit the reporter (unless they prefer anonymity).
