# Evidara

Research with the evidence in view. Evidara is the new identity for Abstractify: a calm workspace for discovering papers, comparing studies, inspecting citations, and creating research briefs.

The owner selected [Evidence Studio](docs/rebrand/concepts/01-evidara-evidence-studio.png). Existing repository and deployment addresses retain their names until their owner changes them. This implementation has not been deployed.

## Research workspace

| View         | Capabilities                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Discover     | Existing Semantic Scholar/OpenAlex search, abstract-based stance synthesis, sorting, source links, paper selection      |
| Library      | Save and remove papers within a project                                                                                 |
| Evidence     | Compare dataset size, methodology, outcomes, and limitations                                                            |
| Citation map | Interactive network and an accessible relationship list                                                                 |
| Reader       | Abstracts, citation context, PDF extraction, document/search chat, extracted and manually entered equation explanations |
| Brief        | Synthesis, working notes, Markdown/CSV/JSON/BibTeX exports, matrix and graph exports                                    |

Projects, saved papers, and notes persist in this browser, with a maximum of 20 projects. PDF text stays in the current tab and clears on reload or project change. This is local persistence, not a cloud account or collaborative sync service.

Gemini credentials come from the server or BYOK settings. User keys remain in memory unless the user explicitly chooses device storage. Legacy remembered Gemini/Groq keys are read for compatibility; Groq and Ollama synthesis are not connected. Provider usage may incur costs. Missing Gemini credentials produce limited metadata/keyword fallbacks, not equivalent AI results.

## Run locally

Use Node 22.16.0 or a compatible Node 22 release. In Windows PowerShell, use `npm.cmd` if script policy blocks `npm.ps1`.

```sh
npm ci
npm run repo:init
npm run dev -- --offline
```

Open **http://localhost:8888**. Netlify serves the frontend and local functions. Add real server credentials to a private `.env` based on [.env.example](.env.example), or configure Gemini through the interface. Do not use example placeholder values as credentials. `WORKSPACE_PASSCODE` is currently not enforced; see the security findings before public deployment.

For a frontend-only preview, use `npm run preview` at http://127.0.0.1:4173. API features need Netlify Dev. `npm run build` copies locally installed Inter, Phosphor icons, and vis-network assets into ignored `public/vendor/`; deployment runs this build automatically. No runtime CDN is required.

## Verification

```sh
npm run build
npm run typecheck
npm run lint
npm run lint:ui
npm test
npm run test:ui
```

Browser checks use synthetic API fixtures, installed Chrome, and no provider credentials. Set `EVIDARA_CHROME` to your Chrome/Chromium executable on another platform. Screenshots go to ignored `logs/audit/`. Checks cover desktop/mobile behavior, search/error/empty states, inert source rendering, PDF/chat/math flows, exports, and local project persistence. They do not establish live provider availability. See [design-qa.md](design-qa.md).

Repository-wide backend formatting has pre-existing failures documented in the audit. New frontend and verification files have a separate ESLint configuration.

## Analysis and decisions

[Documentation index](docs/README.md) links the deep audit, exact security findings, architecture, delivery plan, and proposed research skills. [Implementation record](docs/rebrand/IMPLEMENTATION.md) distinguishes delivered features from proposals. No confirmed malicious instruction or audit-hijacking prompt was found in inspected source; application prompt-injection risks remain documented.

```sh
npm run log:decision -- "Decision" "Reason"
```

Decisions and reasons go to `logs/decisions/decisions.jsonl`. Logs, credentials, uploads, generated assets, caches, and private research data are ignored. Public documentation and safe configuration examples remain versioned. Ignore rules are not access controls or retroactive secret removal.

The project is [MIT licensed](LICENSE). Contribution guidance, wiki, and historical issue specifications remain available and may describe the former Abstractify product. The frontend rebrand does not repair existing backend authentication, session ownership, rate limiting, or model source-boundary issues; see [security findings](docs/security/SECURITY-FINDINGS.md).
