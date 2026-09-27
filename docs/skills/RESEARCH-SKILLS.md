# Proposed research skill catalog

Status: specifications only. These are product capabilities to implement inside the application, not installed Codex skills and not active agent integrations.

## Shared contract

Every skill declares an ID/version, purpose, validated input schema, validated output schema, allowed read tools, token/request budget, evidence requirements, failure states, and evaluation fixtures. Stable application rules stay separate from untrusted paper/PDF text. A model cannot expand permissions by writing instructions in its output.

All results carry source IDs, provider/model/prompt version, evidence basis (metadata/abstract/full text), limitations, and review state. Return `insufficient_evidence` when the requested result cannot be supported. Use concise action summaries, never collected step-by-step internal reasoning. Project writes require authenticated ownership; exports/shares remain explicit user actions.

| Skill                    | Input and output                                                                  | Permitted tools                                               | Quality gate                                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `discover-literature/v1` | Question, sources, filters -> normalized candidate papers and provenance          | Search approved scholarly APIs; DOI resolution; deduplication | Provider fixtures normalize consistently; duplicates merge without losing provenance; outages return partial status                   |
| `screen-relevance/v1`    | Papers and inclusion/exclusion criteria -> decisions with source-linked rationale | Read metadata/abstracts; no autonomous deletion               | Human-labelled sample; negation/irrelevance cases; every decision cites criteria and flags abstract-only uncertainty                  |
| `extract-study/v1`       | Paper evidence and selected extraction columns -> matrix cells with excerpts      | Read selected project documents                               | Missing facts become not-reported; values map to supplied evidence IDs; invalid output is rejected                                    |
| `map-claims/v1`          | A question and selected corpus -> supporting/conflicting/unclear claims           | Read selected papers and validated extraction                 | Separate claim overlap from scientific certainty; report denominator and unavailable evidence                                         |
| `ask-document/v1`        | Question and selected document IDs -> cited answer or insufficient evidence       | Owner-scoped retrieval only                                   | Citations resolve to real indexed passages; foreign documents never enter context; adversarial source instructions cannot grant tools |
| `explain-method/v1`      | Equation/method plus surrounding source -> variables, explanation, limits         | Read selected source passages                                 | No fixed unrelated fallback; preserve unknown symbols; validated source links and mathematical notation                               |
| `review-reliability/v1`  | DOI/source ID -> status observations and retrieved dates                          | Approved publication/status services                          | Missing lookup is unknown, not “reliable”; do not substitute citation counts for study quality                                        |
| `compose-brief/v1`       | Reviewed claims and chosen outline -> editable evidence dossier                   | Read project evidence; draft only                             | Every substantive claim points to evidence; unsupported extrapolations are labelled; export preserves citations                       |
| `suggest-gaps/v1`        | Defined corpus and search coverage -> tentative gaps with scope boundaries        | Read project corpus and search metadata                       | Cannot claim exhaustive literature absence; suggestions distinguish missing corpus coverage from actual research opportunities        |

## Delivery order

Implement discovery, extraction, document Q&A, and brief composition first. Add screening and claim mapping after provenance and evaluation datasets exist. Reliability lookup requires a defined provider contract. Gap suggestions are experimental until search coverage is recorded and the limitations are visible.

## Evaluation dataset

Store only licensed/synthetic, sanitized fixtures under a future `tests/fixtures/` folder. Include irrelevant abstracts, contradictory findings, missing metadata, duplicate DOI records, page-linked passages, malformed provider responses, prompt-injection attempts, HTML payloads, CSV formula text, and provider outages. Private PDFs belong in ignored `uploads/` or scoped storage, not fixtures.

Evaluate schema validity and access isolation as hard pass/fail gates. For extraction and relevance, compare against independently labelled expected facts/decisions and publish the sample size and method. For answer generation, measure resolvable citations and whether each claim is supported by its cited passage. Citation presence alone is not correctness.

Create release thresholds only after a representative baseline exists. Track both errors and abstentions so a skill cannot appear accurate by silently skipping difficult cases. Version evaluation results with the skill/prompt/model versions.

## Implementation template

```text
id / version:
purpose:
input schema:
output schema:
allowed tools and ownership rules:
source and provenance requirements:
maximum request, token, and cost budgets:
timeout and partial-result policy:
failure / unavailable / insufficient-evidence states:
adversarial and domain evaluation fixtures:
release acceptance and rollback:
```

Keep the catalog bounded. The backlog's self-learning, cognitive architecture, and multi-agent concepts are research proposals, not requirements to implement before the core workspace becomes dependable.
