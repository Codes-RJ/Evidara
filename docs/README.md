# Rebrand and repository review

Review date: 2026-09-27. The owner subsequently approved implementation of option 1, Evidara / Evidence Studio. Baseline findings and future proposals remain historical records; see the [implementation record](rebrand/IMPLEMENTATION.md) and [design verification](../design-qa.md) for delivered behavior.

| Document                                                   | Purpose                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Repository audit](audit/REPOSITORY-AUDIT.md)              | Current implementation, feature truth, architecture, quality, and UX risks     |
| [Security findings](security/SECURITY-FINDINGS.md)         | Exact source locations, severity, injection surfaces, and investigation limits |
| [Rebrand proposal](rebrand/REBRAND-PROPOSAL.md)            | Proposed identity, audience, visual direction, navigation, and output format   |
| [Target architecture](architecture/TARGET-ARCHITECTURE.md) | Incremental structure, contracts, storage, and migration approach              |
| [Delivery roadmap](planning/IMPLEMENTATION-PLAN.md)        | Ordered work packages and release acceptance criteria                          |
| [Research skill catalog](skills/RESEARCH-SKILLS.md)        | Proposed product capabilities and their safety/evaluation contracts            |
| [Decision records](decisions/README.md)                    | Local decision logging and templates for public architecture decisions         |

These documents describe proposals separately from implemented behavior. No deployment, repository rename, issue publication, wiki push, or production API invocation was performed in this review.

## Local workspace

Use Node 22.16.0 for a baseline matching `.nvmrc` and the currently locked tooling. On Windows PowerShell, use `npm.cmd` if script policy blocks `npm.ps1`.

```text
npm run repo:init
npm run log:decision -- "Decision" "Reason"
```

`repo:init` creates `logs/decisions/`, `logs/audit/`, `tmp/`, `data/`, `uploads/`, and `artifacts/`. Their contents are ignored. Git does not preserve empty directories, so the tracked initialization script recreates them for each checkout.

Keep useful public specifications and sanitized architecture decisions in `docs/`. Never put credentials, private papers, customer data, or raw model histories in public documents or local decision logs. Ignore rules prevent normal Git staging; they are not access controls, backups, or retroactive secret removal.
