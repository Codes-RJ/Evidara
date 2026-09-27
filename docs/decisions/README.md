# Decision trail

Local working decisions and reasons belong in the ignored `logs/decisions/decisions.jsonl`. One JSON object is appended per command, with UTC timestamp, decision, and reason. This file persists on this machine, not in Git.

```text
node scripts/log-decision.js "Keep existing API routes during migration" "Preserve the working frontend while contracts are introduced"
```

Use concise summaries, not source documents, prompts, credentials, private user information, or internal model reasoning. Logging accepts text verbatim; the writer does not automatically redact secrets. Review text before submitting it. Both scripts resolve directories relative to their own location, so running them from another working directory still targets this repo.

Promote durable, sanitized decisions into numbered records here using [the template](ADR-TEMPLATE.md). Status must distinguish proposed from accepted. Only owner-approved naming and architecture decisions should be marked accepted.

Current accepted scope: the completed audit/foundations phase, followed by owner-approved implementation of option 1, Evidara / Evidence Studio, preserving existing features and using local Playwright verification. Evidara is the accepted interface identity. The broader target architecture and future research-skill catalog remain proposals; see [the implementation record](../rebrand/IMPLEMENTATION.md) for delivered boundaries.
