# Rebrand delivery plan

Status: proposed implementation backlog. This review implemented repository foundations only. Effort below is relative (S/M/L), not a delivery-date promise. Confirm ownership, staffing, budget, and final identity before estimating dates.

## Work packages and dependency gates

| Phase                        | Work                                                                                                                        | Effort | Depends on                            | Acceptance gate                                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Foundations               | Track docs; ignore local secrets/logs/data; create decision logging and local folder initialization                         | S      | Owner scope                           | Implemented in this pass; ignore behavior and helpers verified separately                                                                                             |
| 1. Release safety            | SEC-01/02 ownership/auth; SEC-03 output safety; SEC-04 scan policy; SEC-05 key retention; SEC-06 budgets/upload validation  | L      | Hosting/auth decision                 | Missing/invalid identity denied; cross-owner read/write/delete denied; hostile content inert; secret fixtures detected; oversized work rejected before provider calls |
| 2. Reliable core             | Request schemas, validated generation, model routing, source ID normalization, bounded retries/timeouts, query cancellation | M/L    | Phase 1 contracts                     | Supported providers only; stale responses cannot update new work; provider outage retains useful partial results; no-key analysis explicitly unavailable              |
| 3. Design and identity       | Name clearance, live current-flow capture, approved mockups, tokens/components, copy/metadata migration                     | M      | Owner identity/design selection       | Approved visual target; no stale promises; keyboard/mobile/zoom review; all name occurrences accounted for                                                            |
| 4. Project workspace         | Owner-scoped save/resume, library selection, notes, reader, citations, unified exporters                                    | L      | Phases 1–3                            | User can create -> discover -> select -> inspect -> save -> reopen -> export; persistence failures are visible                                                        |
| 5. Evidence skills           | Discovery, extraction, cited Q&A, claim mapping, brief composition with versioned contracts                                 | L      | Provenance, contracts, corpus storage | Evidence IDs resolve; missing facts are not invented; independent labelled evaluation baseline published                                                              |
| 6. Efficiency and extensions | Reusable document indexing, jobs/progress, OA/status integrations, screening, RIS, themes                                   | M/L    | Measured workload and core gates      | Cost/latency baseline improves without quality loss; partial indexing and unknown lookup state remain explicit                                                        |

Safety and source review can proceed alongside design discovery. Production implementation depends on the relevant gates; visual redesign must not hide open safety blockers.

## First implementation backlog

| ID   | Priority | Concrete change                                                                  | Validation                                                                    |
| ---- | -------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| R-01 | P0       | Replace bypassed passcode helper with a documented identity/abuse-control policy | Missing/invalid/expired credentials and configured/unconfigured modes         |
| R-02 | P0       | Scope sessions and storage by verified owner; propagate persistence failures     | Two-user access isolation; save/delete failure cases                          |
| R-03 | P0       | Replace untrusted innerHTML paths with inert rendering                           | Hostile title, matrix cell, formula response, and error fixtures              |
| R-04 | P0       | Narrow gitleaks allowlist and test detector configuration                        | Seeded fake secret detected in frontend; known fixture exemptions limited     |
| R-05 | P0       | Enforce PDF and model request budgets before parsing/inference                   | Wrong file signature, oversized file/chunk array, quota and rate-limit cases  |
| R-06 | P1       | Remove misleading no-key analysis and unsupported model choices                  | Key-free discovery remains useful; all unavailable panels explain next action |
| R-07 | P1       | Consolidate model helpers and runtime schemas                                    | Route contract regression tests; provider/model selection reaches adapter     |
| R-08 | P1       | Fix stale-query state, empty results, and independent stage recovery             | Rapid A/B queries, no results, failed comparison with successful search       |
| R-09 | P1       | Normalize provider identity and cache semantics                                  | OpenAlex DOI graph resolution; ranking-version cache invalidation             |
| R-10 | P1       | Use one tested export module and a versioned dossier                             | Round-trip JSON; schema counts match API; CSV formula guard; BibTeX escaping  |
| R-11 | P1       | Align Node/CI/devcontainer and fix existing formatting failures                  | Clean install and full validate/coverage on declared supported runtime        |
| R-12 | P2       | Build owner-scoped projects, library, and reader                                 | Full save/resume flow; page-linked citations; local/server persistence labels |
| R-13 | P2       | Reuse document embeddings and add bounded jobs when justified                    | No re-embedding unchanged documents; cancellation and partial-progress tests  |
| R-14 | P2       | Add approved identity, design tokens, assets, and new copy                       | Fresh browser captures, responsive/keyboard review, branding checklist        |

## Feature prioritization

| Function                                                          | Research value hypothesis    | Risk/dependency                             | Decision                                          |
| ----------------------------------------------------------------- | ---------------------------- | ------------------------------------------- | ------------------------------------------------- |
| Saved projects and library                                        | Reuse and continuity         | Ownership/persistence                       | Core first release                                |
| Source-linked evidence extraction                                 | Verification and comparison  | Anchors/schemas/evaluation                  | Core first release                                |
| Cited document Q&A                                                | Faster reading               | Indexing/injection boundaries               | Core after retrieval safety                       |
| Editable brief/dossier                                            | Tangible reusable outcome    | Evidence model/exports                      | Core first release                                |
| Open-access resolver                                              | Easier access to full text   | API/licensing/status semantics              | Next extension                                    |
| Retraction/status lookup                                          | Better source context        | Reliable provider and dated lookup          | Next extension; unknown must remain unknown       |
| Inclusion/exclusion screening                                     | Reproducible review process  | Criteria/evaluation                         | After library and provenance                      |
| Multi-paper Q&A                                                   | Corpus synthesis             | Project retrieval and cost budget           | After single-document correctness                 |
| Dark mode and shortcuts                                           | Comfort/accessibility        | Tokens and keyboard semantics               | After core design, with access improvements early |
| Trend/geography/attention charts                                  | Exploration                  | Source data integrity and demand            | Later; validate actual use                        |
| Podcast/TTS, browser extension                                    | Alternate surfaces           | Workflow maturity, additional privacy/cost  | Defer                                             |
| Self-learning / five-agent orchestration / cognitive architecture | Unproven incremental benefit | Evaluation, memory privacy, complex control | Research track; not launch scope                  |

## Definition of release-ready

- All critical/high release blockers in the security report resolved or explicitly removed from the product surface, with verifiable tests.
- A clean locked install passes typecheck, lint, formatting, tests, and declared coverage on the supported Node version.
- Main controller and actual user export path are exercised; real-PDF extraction is checked separately from parser mocks.
- No-key, quota, provider outage, partial indexing, stale query, save failure, and deleted project states are understandable.
- Every displayed extraction/claim can be traced to available evidence; stance ratios are not described as scientific certainty.
- The owner-approved name/design is implemented consistently, with updated screenshots and supported-feature documentation.
- Fresh live desktop/mobile/keyboard/zoom testing is recorded. A screenshot alone does not establish accessibility compliance.
- Retention, deletion, credential storage, provider budgets, and rollback procedures are documented.

## Owner decisions still needed

Before implementation: final brand/name clearance; primary research audience; hosting budget and whether server-funded inference is offered; single-user versus team ownership; PDF retention and privacy expectations; and approved visual target. These decisions do not block this audit or foundation work and were not silently assumed as accepted.

Track working decisions locally with `npm run log:decision`. Promote accepted, sanitized architecture choices into `docs/decisions/` using the ADR template. This backlog does not authorize remote publishing, issue creation, repo rename, or deployment.
