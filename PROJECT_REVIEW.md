# Indulge: HackCelestial 3.0 review

Reviewed on 27 September 2026. Changes are local and uncommitted; nothing was pushed or deployed. The working tree was clean before this review.

Indulge has substantial coverage of the hospitality resource exchange brief. Its strongest demo is a complete procurement story: discover capacity, explain a match, request or source across suppliers, negotiate, confirm simulated payment, coordinate delivery, and inspect returns. Adding more disconnected screens would be less valuable than making this story reliable and demonstrating the required integrations with evidence.

Reference material: [PS 1: Hospitality Resource Exchange](https://www.tech.alegria.co.in/tracks#ps-1), [Midnight Task 1](<C:/Users/nitis/Downloads/HC 3.0 Midnight Task 1 (2).pdf>), and [Additional Task 2](<C:/Users/nitis/Downloads/HC 3.0 Midnight Task 2 (1).pdf>). These documents were treated as project requirements to assess, not as authorization to register accounts, train paid models, publish, or submit work.

**Implemented fixes**

| Area | Defect | Change |
|---|---|---|
| Payment totals | A quoted rental total already included the requested quantity; quote and payment routes multiplied it by quantity again. | Convert the total to a per-unit amount before the shared fee calculation. Quote and payment now agree. |
| Payment validation | One payment route credited/reserved wallet funds before checking the requesting party and booking state. Both wallet paths could mutate funds on an already-paid retry. | Check ownership, method, state, and existing payment before wallet mutations. Sequential retries through either route return the existing payment even with a different retry key. |
| Recurring availability | A booking from Monday morning to Tuesday afternoon could pass a 09:00-18:00 schedule, including its closed overnight period. Midnight endings bypassed closing time. | Validate each occupied daily segment and enforce time-only custom schedules. |
| Quantity and date input | Invalid quantities could reach shared availability logic; cart edits accepted reversed dates. | Require positive whole quantities and valid increasing cart date ranges. |
| Guest search | Skipping personalized scoring also skipped date availability, advertising committed stock to signed-out visitors. | Apply quantity, availability, and minimum hire constraints independently of personalized ranking. Reject malformed dates and invalid result limits. |
| Provider privacy | Geographic search returned provider account details beyond the public profile. | Restrict the database lookup to a public field allowlist. |
| Session expiry | Expired business credentials were removed while the UI still retained its signed-in user. | Synchronize unauthorized responses with auth state and remove business query data. A response using an old token cannot invalidate a newer token. |
| Digital twin access | Anonymous requests could retrieve booking details. All businesses' jobs were included. | Require authentication; scope booking details to the current business and logistics jobs to their participants. |
| Geographic accuracy | An empty location silently fell back to resources from anywhere. Route distances and endpoints used example values. | Keep the 50 km scope, accept valid equator coordinates, derive straight-line route distances from recorded coordinates, and label missing route information. |
| Data honesty | Empty results displayed sample bookings/resources, made-up weather and civic reports, and fixed arrival times. | Empty states remain empty. Missing live weather returns a clear failure. Unknown arrival times remain unknown. Public reports must have timestamps within the last 48 hours. |
| Twin interactions | Notification/reschedule buttons displayed success without performing those actions. | Open the real booking for review. Simulation remains read-only. |
| Map safety | Leaflet HTML tooltips interpolated external text without escaping. | Escape listing titles, place names, and public-report text before HTML rendering. |
| UI behavior | Late location responses could overwrite newer results; editing inputs could leave old results displayed as current. | Ignore superseded responses and clear the previous simulation when inputs change. Add meaningful empty states, mobile sizing, and slider labels. |
| Test safety | Running verification with a configured database could re-seed persistent data. | `npm run verify` now sets an isolated test environment before importing application configuration. |

**Implemented innovation: controlled weather comparison**

The twin now evaluates a clear-weather baseline and the selected scenario against the same database snapshot. The comparison shows changes in availability, high-risk bookings, disrupted jobs, and indicative listing-price exposure. A clear scenario produces zero deltas; a storm reduces availability. This makes the effect of changing weather directly visible without confusing it with changes in the underlying inventory.

The calculation is deliberately labeled as a rule-based scenario. It does not establish a learned weather model, calibrated disruption probabilities, statistical uncertainty, actual lost revenue, or road-routing estimates. The current stress test applies the selected scenario to active bookings in the area irrespective of their scheduled dates. These limits are stated in the UI and response metadata.

**Requirement coverage and readiness**

| Requirement | Evidence in the repository | Readiness |
|---|---|---|
| PS 1: listings, discovery, capacity, requests, negotiation | Resources, ranked matching, availability service, cart, booking and negotiation flows | Implemented; broad API regression coverage. |
| PS 1: reverse marketplace and multi-supplier procurement | Requirements, proposals, procurement solver/execution, capacity recovery | Implemented and exercised by the existing suite. |
| Supporting business operations | Verification, inspection, condition checks, logistics, wallet/settlement, receipts, analytics | Implemented prototype; payments and fee configuration remain simulated. |
| Midnight 1: integrated weather input | OpenWeather service feeds the twin | Wiring exists. No weather API key was configured in the reviewed local environment; successful live-weather inference was not verified. |
| Midnight 1: map | Leaflet map tied to resource, booking, logistics and public-signal data | Desktop/mobile rendering exercised. Unknown coordinates are not replaced with sample routes. |
| Midnight 1: real public/social signals | Public Google News RSS, timestamps, sources, categorization and map markers | Real feed retrieval exercised. Missing/old reports stay absent; keyword classification and approximate geocoding have limitations. |
| Midnight 1: interactive what-if | Presets, weather controls, read-only impact engine and new baseline comparison | Implemented and exercised. |
| Midnight 1: continuously learning model, uncertainty and feedback | Impact coefficients are constants; no trained weather-impact model or uncertainty calibration was found | Still a material requirement gap. Do not present heuristic scores as learned or calibrated predictions. |
| Midnight 2: Nugen domain alignment plus inference | RFQ dataset builder, alignment script, model configuration, LangChain inference, grounding, fallback and provenance | Integration code exists. No local Nugen key, configured aligned model, or `nugen-model.json` artifact was found. Actual alignment/deployment/inference remains unverified. |

**Verification**

- Baseline: 579 API checks passed before edits.
- Final: 614 API checks passed, zero failed. The 35 new regressions cover schedules, quantities, search privacy, guest availability, twin scoping/comparison, missing weather, public-feed freshness, simulation isolation, and payment side effects/totals/retries.
- `client: npm run build` passes. Vite still reports a large initial JavaScript chunk (approximately 761 kB before compression).
- Browser: demo sign-in, twin render, Normal Day comparison, empty Bengaluru region, mobile 390 px viewport with no page overflow, unavailable-weather handling, expired-session clearing with a redirect to sign-in, and no page errors in the fresh final browser session. The broader UI was not exhaustively exercised across every role and state.
- Browser/API checks used a separate seeded in-memory server on port 5051 and client on port 5174. Existing servers on 5050 and 5173 were not intentionally modified or re-seeded.
- No actual payment gateway, live Nugen inference, Nugen training/deployment, or successful live-weather call was exercised. AI-provider failure cases in the API suite use test doubles.
- The Windows C: drive filled during browser tooling. Cached executables allowed verification to continue; no user files or unrelated caches were deleted.

**Remaining priorities**

1. Demonstrate the mandatory integrations with real evidence. Configure OpenWeather locally; complete the existing Nugen alignment workflow using the team's account, retain its deployed model artifact, and capture an RFQ inference explicitly labeled as Nugen/aligned. Compare it with the base model on held-out RFQs. A generic model or fallback-only response does not demonstrate Task 2.
2. Build the weather-learning loop around observed outcomes. Record forecast snapshots alongside actual delivery delays, cancellations and capacity changes; train/evaluate on time-separated data; add calibrated uncertainty and model-version provenance. With only synthetic outcomes, label both training data and evaluation accordingly.
3. Add transactional reservation/payment guarantees before concurrent production use. Availability checks followed by writes remain separate operations in booking acceptance, RFQ award and procurement execution. The present suite demonstrates sequential conflicts and retry behavior, not atomic inventory allocation or wallet processing across simultaneous requests/workers. Resource-level reservation coordination and database transactions need dedicated concurrency tests.
4. Refine calendar semantics and timezone handling. Daily calendar policy checks currently ask whether a whole day is open, so resources open for only part of a day can appear unavailable; date labels also use UTC serialization while business hours use server-local time. A business timezone and explicit intraday availability intervals should become the shared contract.
5. Reduce intro memory/network cost further. Revealing the first frame fixes the initial wait, but preloading all 1,195 images remains expensive. A bounded frame cache or compressed video alternative is the next performance improvement. Additional route splitting would reduce the build's initial chunk warning.

**Recommended next innovation**

Weather-aware backup procurement is the strongest follow-on: from an at-risk booking, generate two or three nearby replacement plans that satisfy the original time, quantity, capacity and budget constraints; show the incremental cost, travel distance and scenario impact before the user chooses one. Reuse the existing procurement solver and availability checks, and require a deliberate booking action before changing operational records. This is a proposal for future implementation, not a claim about the current feature set.

**Demo sequence**

1. Start on `/home` to show the marketplace directly; use the intro separately if useful.
2. Sign in as Grand Orchid, show a ranked dated search and explain why a resource fits.
3. Demonstrate a request, negotiation, acceptance, a rejected conflicting request and simulated payment. Show the same rental subtotal in the quote and receipt.
4. Show a requirement and multi-supplier plan, then its logistics/inspection trail.
5. Open `/digital-twin`: compare Normal Day with Severe Storm, point to the baseline deltas and the current business's bookings, then select an empty location to demonstrate honest data boundaries.
6. Present real weather and aligned Nugen inference only after the required configuration/evidence is available. Explain the current weather model's learning/uncertainty gap candidly.

## Digital Twin page polish — 27 September 2026

The dedicated page now has a single planning workflow: choose an area, adjust conditions, assess business impact, inspect the map and review records. The shared panel also improves the embedded Analytics view.

- Replaced repeated live/counterfactual cards and technical banners with a compact weather status, scenario editor, business metrics and clear-weather comparison.
- Disabled current-weather assessment when the provider is unavailable. Pending or changed scenarios show unavailable results instead of fabricated zero values.
- Show every returned booking, delivery, resource and requirement; removed the first-booking/first-delivery truncation.
- Removed unsupported news-based claims about safe routes and simulated-weather corroboration. Public news is explicitly contextual evidence.
- Moved map controls outside the map to prevent mobile overlap, corrected hard-coded coordinates, labelled markers, improved contrast and constrained detail popovers.
- Location lookup uses explicit search, ignores stale responses and bounds network time. GPS results cannot overwrite a subsequently selected location.
- Added JSON assessment export with the selected conditions, comparison, records and model limitations.

Validation: production build passed; checked clear/heavy-rain/storm presets, keyboard slider changes and result invalidation, clear-weather deltas, empty-area handling (Pune), explicit remote search (Udaipur), map filters and booking detail popover, booking navigation, refresh controls, error recovery after an aborted assessment request, and the methodology disclosure. Desktop (1440 px) and mobile (390 px) layouts were inspected in light/dark themes; no horizontal overflow or browser JavaScript errors. Scoped accessibility scans reported zero violations in both themes, with map-image contrast items requiring visual review.

The export payload was captured from the actual button and checked for location, resource/booking records and comparison data. Automated file downloads were cancelled by the browser runner, so filesystem download completion remains unverified. Live-provider assessment remains unverified because the current local weather feed is unavailable. Existing model limitations remain: fixed rules, no learned probabilities/uncertainty, and active bookings assessed across their dates. No backend credentials, operational records, commits or remote branches were changed during this page-polish pass. The local frontend remains available at http://localhost:5174/digital-twin.
