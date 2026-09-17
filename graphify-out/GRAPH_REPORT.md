# Graph Report - Hack_Celestial  (2026-09-05)

## Corpus Check
- Large corpus: 345 files · ~911,355 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 402 nodes · 1080 edges · 20 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 25 edges (avg confidence: 0.83)
- Token cost: 42,000 input · 5,108 output

## Community Hubs (Navigation)
- API Server Core & Routes
- App Shell & Navigation
- Client Dependencies
- Server Dependencies
- Database Models & Seeding
- Product Concepts & Rationale
- Requests & Requirements UI
- Cart, Forms & Date Utilities
- API Client & Analytics Dashboard
- UI Primitives
- Resource Cards & Match Display
- Ranking & Scoring Engine
- Booking Detail & Negotiation
- Availability Calendar
- Client State & Auth Model

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 37 edges
2. `errorMessage()` - 31 edges
3. `inr()` - 26 edges
4. `resourceImage()` - 20 edges
5. `Spinner()` - 19 edges
6. `relative()` - 17 edges
7. `dateRange()` - 16 edges
8. `ResourceDetail()` - 14 edges
9. `toLocalInput()` - 13 edges
10. `Alert()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Document Metadata (title and description)` --references--> `Indulge — B2B Hospitality Resource Exchange`  [INFERRED]
  client/index.html → README.md
- `Client HTML Shell (#root mount point)` --conceptually_related_to--> `React Query Owns Server State (30s poll behind Socket.io)`  [INFERRED]
  client/index.html → README.md
- `ReviewForm()` --calls--> `errorMessage()`  [EXTRACTED]
  client/src/pages/BookingDetail.jsx → client/src/api/client.js
- `RequireAuth()` --calls--> `useAuth()`  [EXTRACTED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `BookingDetail()` --calls--> `errorMessage()`  [EXTRACTED]
  client/src/pages/BookingDetail.jsx → client/src/api/client.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Five weighted factors forming the match score** — readme_ranking, readme_price_factor, readme_distance_factor, readme_availability_factor, readme_capacity_factor, readme_urgency_factor, readme_match_breakdown [EXTRACTED 1.00]
- **Availability enforcement across every write path** — readme_sweep_line_availability, readme_total_quantity, readme_availability_windows, readme_recheck_before_write, readme_cart, readme_reverse_marketplace [INFERRED 0.85]
- **Zero-setup demo and verification stack** — readme_in_memory_mongodb, readme_seeded_demo_accounts, readme_verify_suite, readme_port_5050, readme_simulated_payments [INFERRED 0.85]

## Communities (20 total, 0 thin omitted)

### Community 0 - "API Server Core & Routes"
Cohesion: 0.07
Nodes (43): createApp(), optionalAuth(), requireAuth(), signToken(), asyncHandler(), errorHandler(), HttpError, notFound() (+35 more)

### Community 1 - "App Shell & Navigation"
Cohesion: 0.07
Nodes (42): TOKEN_KEY, App(), RequireAuth(), Footer(), GROUPS, ACCOUNT_LINKS, Header(), NAV (+34 more)

### Community 2 - "Client Dependencies"
Cohesion: 0.05
Nodes (39): autoprefixer, axios, dependencies, axios, date-fns, react, react-dom, react-hot-toast (+31 more)

### Community 3 - "Server Dependencies"
Cohesion: 0.06
Nodes (35): bcryptjs, cors, dotenv, express, jsonwebtoken, mongoose, morgan, nodemon (+27 more)

### Community 4 - "Database Models & Seeding"
Cohesion: 0.12
Nodes (21): connectDB(), disconnectDB(), env, cartItemSchema, cartSchema, negotiationSchema, offerSchema, requirementSchema (+13 more)

### Community 5 - "Product Concepts & Rationale"
Cohesion: 0.11
Nodes (26): Document Metadata (title and description), Utilisation Analytics as the Pitch, Availability Factor (rewards slack), Availability Windows, Capacity Factor (tight-fit reward), Multi-Provider Cart with Checkout Fan-Out, Distance Factor ($geoNear linear decay), Double-Booking Prevention (+18 more)

### Community 6 - "Requests & Requirements UI"
Cohesion: 0.22
Nodes (18): StatusBadge(), useMyRequirements(), useRequirement(), useRequirementActions(), useUserReviews(), resourceImage(), dateRange(), inr() (+10 more)

### Community 7 - "Cart, Forms & Date Utilities"
Cohesion: 0.21
Nodes (14): errorMessage(), useCartMutations(), useResource(), defaultWindow(), durationHours(), toLocalInput(), Cart(), ListingForm() (+6 more)

### Community 8 - "API Client & Analytics Dashboard"
Cohesion: 0.19
Nodes (11): api, baseURL, EmptyState(), useAnalytics(), useMyListings(), CATEGORY_LABELS, Analytics(), PALETTE (+3 more)

### Community 9 - "UI Primitives"
Cohesion: 0.18
Nodes (9): Alert(), ALERT_TONE, Panel(), Price(), PRICE_SIZE, Spinner(), STATUS_LABELS, STATUS_TONE (+1 more)

### Community 10 - "Resource Cards & Match Display"
Cohesion: 0.19
Nodes (11): MatchBreakdown(), ResourceCard(), DealBadge(), Stars(), CATEGORIES, FACTOR_LABELS, FACTOR_WEIGHTS, PRICE_UNIT_LABELS (+3 more)

### Community 11 - "Ranking & Scoring Engine"
Cohesion: 0.37
Nodes (12): rankResources(), scoreSingleResource(), availabilityFit(), capacityFit(), clamp01(), combineScore(), distanceFit(), explain() (+4 more)

### Community 12 - "Booking Detail & Negotiation"
Cohesion: 0.26
Nodes (11): useBooking(), useBookingActions(), useNegotiation(), useSendNegotiation(), dateTime(), BookingDetail(), NegotiationThread(), ProgressTracker() (+3 more)

### Community 13 - "Availability Calendar"
Cohesion: 0.50
Nodes (4): AvailabilityCalendar(), MONTHS, WEEKDAYS, useAvailability()

### Community 14 - "Client State & Auth Model"
Cohesion: 0.67
Nodes (3): Client HTML Shell (#root mount point), JWT in localStorage, Context Holds Only the Session, React Query Owns Server State (30s poll behind Socket.io)

## Knowledge Gaps
- **100 isolated node(s):** `name`, `version`, `private`, `type`, `description` (+95 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `App Shell & Navigation` to `Requests & Requirements UI`, `Cart, Forms & Date Utilities`, `API Client & Analytics Dashboard`, `UI Primitives`, `Booking Detail & Negotiation`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `errorMessage()` connect `Cart, Forms & Date Utilities` to `App Shell & Navigation`, `Requests & Requirements UI`, `API Client & Analytics Dashboard`, `UI Primitives`, `Resource Cards & Match Display`, `Booking Detail & Negotiation`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _100 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `API Server Core & Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.07204968944099378 - nodes in this community are weakly interconnected._
- **Should `App Shell & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.06885245901639345 - nodes in this community are weakly interconnected._
- **Should `Client Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Server Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._