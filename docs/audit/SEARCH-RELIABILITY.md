# First-search reliability review

Date: 2026-09-27. Reported topic: “Open Knowledge Format.” The live deployment URL was not supplied, so no deployed request trace was available.

## Reproduced defects

Three regression tests failed before the repair: primary success with zero records skipped OpenAlex; a transient OpenAlex failure was not retried; and exhausted provider failures returned HTTP 200 with an empty paper list. These paths can turn a temporary service failure into a false “no matching papers” message. They do not establish which exact path occurred in the reported deployment.

Cache reads/writes and embedding ranking also lacked stage deadlines. A cold cache requires discovery and ranking whereas a warm result can return quickly. New stalled-dependency tests verify that these optional stages cannot indefinitely hide discovered papers.

## Repairs

- Try OpenAlex in the same user request when Semantic Scholar errors, returns no records, or supplies no usable abstracts.
- Retry transient discovery errors once per provider, with a four-second deadline per attempt. Respect long provider cooldowns by moving to fallback instead of immediately retrying.
- Return HTTP 503 for unavailable/rate-limited discovery, with a useful message and Retry-After. Do not cache failure or empty responses.
- Distinguish genuine zero matches from matching records without usable abstracts.
- Bound optional cache waiting to 400 ms per operation and semantic ranking to six seconds. Abort embedding work on timeout and return discovered papers ranked by citations. Do not store incomplete semantic ranking under a semantic cache key.
- Recover one transient network/gateway/malformed search response in the browser within the same submission, using the existing total request deadline. Do not immediately retry a server-requested cooldown longer than one second.
- Add optional server credentials: Semantic Scholar uses `SEMANTIC_SCHOLAR_API_KEY` in `x-api-key`; OpenAlex uses `OPENALEX_API_KEY` in a bearer header. Neither appears in request URLs, frontend state, or exports.

Credentials follow the providers’ [Semantic Scholar API authentication](https://api.semanticscholar.org/api-docs/snippets) and [OpenAlex authentication guidance](https://help.openalex.org/api/authentication/). Configured keys do not eliminate rate or budget limits.

## Direct provider observation

Read-only, unauthenticated calls for the exact topic returned HTTP 429 from both api.semanticscholar.org and api.openalex.org in this test environment. No Gemini generation or embedding calls were made. This verifies upstream rate limiting for those calls; it does not prove the deployed application’s quota status, credentials, or exact failure cause. External quotas cannot be repaired by fabricating research results or treating a failed call as a successful empty result.

## Validation

132 unit tests passed across nine files, including empty-primary fallback, same-submission retry recovery, provider failure semantics, missing abstracts, cache/ranking/provider stalls, credential routing, and cooldown handling. TypeScript and frontend lint passed. Browser regression checks exercise a first-attempt HTML 502 followed by recovery for “Open Knowledge Format,” persistent failures, malformed responses, missing abstracts, and respect for a 60-second cooldown, alongside the existing views and interactions.

The accompanying search expansion defaults to 25 papers and allows up to 50. These checks validate the local implementation; deployment of this repair has not been verified. Production authentication and other audit findings remain separate open work.
