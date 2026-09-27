# Evidara design verification

**Final result: passed** for the selected frontend design and controlled browser interactions. This is not a live-provider or production-security sign-off.

## Reference and evidence

Selected target: [option 1, Evidence Studio](docs/rebrand/concepts/01-evidara-evidence-studio.png). Its 1487 × 1058 raster was normalized to 1440 × 1024 for comparison with Chrome at the same viewport. The controlled reference state uses the same research question, project title, first three paper subjects, 10-source count, and 6/3/1 stance counts. Synthetic responses exist only in the verification script; normal startup contains no sample research results.

Local evidence, intentionally ignored by Git:

- `logs/audit/evidara-reference-comparison.png`: selected design on the left, implementation on the right.
- `logs/audit/evidara-reference-state.png`: final reference-state browser capture.
- `logs/audit/evidara-empty-desktop.png`, `evidara-discover-desktop.png`: empty and populated product states.
- `logs/audit/evidara-discover-360.png`, `-768.png`, `-1100.png`, `-1280.png`: responsive captures.
- `logs/audit/evidara-reader-desktop.png`, `evidara-evidence-desktop.png`, `evidara-map-desktop.png`, `evidara-brief-desktop.png`, `evidara-settings-desktop.png`: supporting views/dialog.

## Findings resolved

| Finding                                                                                 | Impact                                                          | Resolution                                                                                                      |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Desktop sidebar was 252 px rather than approximately 268 px in the normalized reference | Shifted the workspace and narrowed navigation                   | Set desktop sidebar/workspace offset to 268 px; retain compact tablet and drawer behavior                       |
| Summary/paper typography was too small; overview column was too narrow                  | Reduced readability and changed the reference's content balance | Summary 16 px, paper abstract 14 px, metadata 12 px; overview column 34%; mobile body increased for readability |
| Search field inset was smaller than the target                                          | Weakened the centered search composition                        | Increased desktop horizontal inset to 65 px, adapting below 1250 px                                             |
| Unsupported filled-circle icon names produced empty legend slots                        | Stance legend lost its visual markers                           | Use actual locally installed Phosphor circle glyphs, with labels and counts                                     |
| Static welcome markup inherited preserved whitespace                                    | Produced broken line positioning in Reader                      | Restrict normal whitespace to the static welcome; preserve model-response paragraph whitespace                  |
| Library graph navigation controls were bright green                                     | Departed from Evidara palette and lacked native control labels  | Add native labeled zoom/fit controls and preserve drag/keyboard navigation                                      |
| Long source strings and mobile excerpts needed wrapping                                 | Risked clipping at phone widths                                 | Wrap titles/tags, shorten labeled excerpts, enlarge mobile reading text, and verify each view's page width      |

Graph labels also use bounded two-line text with greater node spacing, resolving label collisions seen in the initial small-network screenshot. No unresolved P0/P1/P2 frontend fidelity or interaction issue was found in the final reviewed states. Dense real citation networks may need manual pan/zoom; the accessible relationship list is available alongside the canvas.

## Intentional product adaptations

The reference's illustrative scientific quote becomes a clearly labeled excerpt of the returned abstract. Its sample avatar becomes a real profile/settings control because no user-account identity exists. Save controls, browser-save status, provider/fallback messages, and a caution about abstract-based counts describe implemented behavior. Dynamic scientific content and result length naturally change row height. These adaptations preserve the selected white/navy/cobalt direction without presenting invented evidence as verified output.

Fonts and graph/icon assets load locally. Native dialogs, labels, landmarks, skip link, visible keyboard focus, reduced-motion styling, inert closed mobile navigation, and a text relationship list support accessibility. Visual review covered typography, spacing, surfaces, palette, icons, copy, wrapping, empty/selected states, and the supporting view screenshots. This was not a comprehensive assistive-technology audit.

## Validation

- Build, TypeScript, frontend ESLint, syntax, changed-frontend formatting, and Git whitespace checks passed.
- The original rebrand passed 107 unit tests across 8 files. The subsequent search-limit expansion passed 121 tests across 9 files, covering default/requested/invalid limits, fallback provider sizing, cache partitioning, sparse abstracts, and embedding concurrency.
- Chrome interaction checks passed: search/sorting/empty/error/stale results, inert executable-looking source text, saved library, comparison, network controls, citation context, PDF extraction/removal, formula selection/manual entry, chat, BYOK forwarding/opt-in/clearing, dialog Escape, 13 export combinations, secret-free exports, project switching, notes/reload, and every view at 360/768/1100/1280 px.
- No browser runtime errors were observed in the verification suite.
- Actual local Netlify frontend returned HTTP 200; search and PDF invalid-input checks returned the expected HTTP 400 without provider calls. Static Netlify Dev mode avoids the initial framework misdetection and observed Windows/OneDrive watcher failure. An unused Netlify Database startup warning remains environmental; the app does not depend on Netlify Database.
- Backend ESLint passed with 97 pre-existing warnings. The repository-wide backend formatting check still reports 19 pre-existing files; the overall `validate` command therefore is not fully green.

Authentication, session ownership, model source isolation, and server request budgets remain outside this frontend sign-off. Exact baseline/current locations and frontend remediation status are recorded in [security findings](docs/security/SECURITY-FINDINGS.md).

The subsequent search-limit change adds a labeled 10/25/50 control and a usage notice beneath the search field. This intentionally increases the search section's height relative to the original mockup. Browser checks verify the 25-paper default, forwarding a 50-paper request, restoring the project setting, and maintaining all-view responsive layout checks. Synthetic fixtures continue to contain only their prescribed sample records; actual result counts and the API cap are verified independently by endpoint tests.

The first-search reliability repair subsequently passed 132 unit tests and added browser regressions for one-submission recovery after an HTML 502, malformed search output, persistent failure, missing abstracts, and a server-requested cooldown. Direct unauthenticated provider checks for “Open Knowledge Format” returned HTTP 429 from both sources; this observation does not establish deployed-site behavior or eliminate the need for provider credentials/quota availability. See [the reliability review](docs/audit/SEARCH-RELIABILITY.md).
