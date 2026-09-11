# RestaurantOS — Master Project Specification
Version: 0.2
Status: Active Master Specification / Requirements + Roadmap
Primary goal: Build a production-grade restaurant management ecosystem with a Web Admin, POS, Kitchen/KOT, and future AI capabilities.

---

## 0. HOW THIS SPEC MUST BE USED

This document is the single source of truth for development.

AI development agents MUST:
1. Read this file before changing code.
2. Follow the current milestone only.
3. Never silently change architecture, database contracts, naming conventions, or business rules.
4. Never implement future milestones unless explicitly activated.
5. Before every implementation cycle:
   - inspect the existing code;
   - inspect the current database/types/interfaces;
   - identify dependencies;
   - make a short implementation plan;
   - implement the smallest safe change.
6. After implementation:
   - run/build/test the affected area;
   - inspect for regressions;
   - fix errors;
   - report exactly what changed.
7. Never delete or rewrite working functionality merely to simplify implementation.
8. Never invent missing business requirements. Mark them as `OPEN_DECISION`.
9. If a requirement conflicts with this document, this document wins unless the human owner explicitly changes it.

### LOOPING DEVELOPMENT PROTOCOL

For every task, execute this loop:

LOOP START
  A. Read relevant sections of PROJECT_SPEC.md.
  B. Inspect current repository state.
  C. Inspect related files before editing.
  D. State:
       - objective
       - files likely affected
       - risks
       - acceptance criteria
  E. Implement only the requested scope.
  F. Run formatting/lint/type checks/tests/build as applicable.
  G. If failure occurs:
       - identify root cause;
       - fix it;
       - rerun checks.
  H. Perform a regression review.
  I. Confirm all acceptance criteria.
  J. Update documentation if the architecture/contract changed.
LOOP END

Do not exit the loop while there are known build/type/lint/test errors caused by the current change, unless the environment itself prevents execution. If blocked by the environment, clearly report the blocker.

---

# 1. PRODUCT VISION

RestaurantOS is a restaurant operations platform designed to be fast enough for real-time restaurant billing while remaining easy for owners and staff to operate.

The ecosystem will eventually contain:

1. Web Admin
2. POS
3. Kitchen Display / KOT
4. Staff/Captain interface
5. Reports
6. Inventory
7. Multi-device synchronization
8. Multi-branch support
9. AI item recognition
10. Voice ordering
11. Online/customer ordering

The product must have its own visual identity. It may learn from common restaurant POS workflows but MUST NOT copy another company's exact UI, branding, assets, or proprietary implementation.

---

# 2. DEVELOPMENT PRINCIPLES

## 2.1 Reliability first
Billing, order totals, taxes, payment status, and order state transitions must be deterministic.

## 2.2 Offline-first POS
The future POS must continue core operations during temporary internet loss. The Web Admin can be primarily online, but shared data contracts must not prevent future offline synchronization.

## 2.3 Single source of truth
Business entities and rules must be represented through typed models and repositories/services, not duplicated across screens.

## 2.4 No hardcoded business data
Menu items, prices, taxes, restaurant settings, tables, staff, etc. must come from persistent data/configuration.

## 2.5 Safe changes
Prefer additive, modular changes over destructive rewrites.

## 2.6 Human confirmation for AI
AI suggestions must never silently create an irreversible financial transaction. AI recognition must produce a suggestion that can be confirmed/edited by an authorized user.

## 2.7 Security
Client applications must not be trusted for authorization. Firebase security rules/backend validation must enforce access.

---

# 3. CURRENT MILESTONE

## CURRENT PROJECT STATUS
Completed and locked milestones/modules:
- M1 — Web Admin Foundation — COMPLETE / LOCKED
- M2 — Transaction + Billing Engine — COMPLETE / LOCKED
- M3 — Full POS + Bill/Receipt — COMPLETE / LOCKED
- M4 — Kitchen/KOT + Captain/Staff Foundation — COMPLETE / LOCKED
- M5 — Reports + Audit + Multi-Outlet — COMPLETE / LOCKED
- Table Management — COMPLETE / LOCKED

The existing completed functionality must be preserved. Future work must be additive and must not silently rewrite completed milestone contracts.

## ACTIVE MILESTONE — M6: FULL MULTI-DEVICE + STAFF OPERATIONS

M6 completes the production-grade operational experience for multiple authorized devices and staff roles. M4 already established the Kitchen/KOT + Captain/Staff foundation and realtime/multi-device foundations; M6 must build on those foundations rather than duplicate or replace them.

M6 scope:
- role-based operational access for Owner, Manager, Cashier, Captain, Kitchen, and Accountant
- waiter/captain mobile workflow
- kitchen mobile/tablet workflow on multiple devices
- same-restaurant realtime operational synchronization
- multi-device concurrency/conflict handling using existing transaction/idempotency foundations
- offline/reconnect behavior for supported staff operations
- device/session awareness and stale-state handling
- strict tenant isolation and server-enforced authorization
- kitchen/waiter responsive operational UX
- security, regression, concurrency, offline, and permission testing

M6 MUST NOT weaken or bypass existing billing, order, KOT, table/session, audit, idempotency, or security contracts.

## MILESTONE 1 — WEB ADMIN FOUNDATION

ACTIVE SCOPE:
- Authentication
- Protected admin layout
- Dashboard shell
- Restaurant setup
- Menu categories
- Menu items
- Food image upload
- Basic settings
- Firestore data layer
- Firebase Storage integration
- Responsive web UI

NOT IN SCOPE YET:
- POS billing
- KOT
- Kitchen Display
- Inventory
- Customer app
- Online ordering
- AI recognition
- Voice ordering
- Payment gateway
- Multi-branch operations

Future modules may be architected for, but MUST NOT be implemented during Milestone 1. This section describes the original M1 scope and is retained as historical milestone documentation.

---

# 4. WEB ADMIN INFORMATION ARCHITECTURE

Primary navigation:

Dashboard
Restaurant
Menu
  - Categories
  - Items
Tables (placeholder/future)
Orders (placeholder/future)
Kitchen (placeholder/future)
Inventory (placeholder/future)
Reports (placeholder/future)
Staff & Roles (future)
Settings

The sidebar should visually distinguish active, available, and future/disabled modules.

---

# 5. AUTHENTICATION

## Requirements

Login:
- Email
- Password
- Validation
- Loading state
- Error state
- Logout

Protected routes:
- Unauthenticated users must not access admin pages.
- Authenticated users can access only authorized restaurant data.

Do not expose Firebase secrets or service-account credentials in client code.

## Future roles

Owner
Manager
Cashier
Kitchen
Captain
Accountant

The complete role-management and operational access model is implemented/extended only in the milestone that explicitly activates it. M6 is the active milestone for production-grade staff operational access.

---

# 6. RESTAURANT MODEL

A restaurant must have a stable ID.

Suggested Firestore structure:

restaurants/{restaurantId}

Fields:

- name
- legalName
- logoUrl
- phone
- email
- address
- city
- state
- postalCode
- country
- gstNumber
- currency
- timezone
- taxMode
- createdAt
- updatedAt
- isActive

Do not store sensitive credentials inside restaurant documents.

---

# 7. USER / RESTAURANT RELATIONSHIP

Suggested:

users/{userId}

Fields:
- displayName
- email
- photoUrl
- createdAt
- updatedAt

restaurantMembers/{restaurantId_userId}

Fields:
- restaurantId
- userId
- role
- isActive
- createdAt
- updatedAt

The exact collection strategy may be changed only after evaluating Firebase query/security implications.

---

# 8. MENU

## 8.1 Category

Suggested:

restaurants/{restaurantId}/categories/{categoryId}

Fields:
- name
- description
- imageUrl
- sortOrder
- isActive
- createdAt
- updatedAt

Requirements:
- Create
- Read
- Edit
- Delete/archive
- Enable/disable
- Sort order

Avoid hard deletion when an entity may later be referenced by historical orders. Prefer archive/deactivate semantics.

## 8.2 Item

Suggested:

restaurants/{restaurantId}/items/{itemId}

Fields:
- name
- shortName
- description
- categoryId
- imageUrl
- price
- taxRate
- taxInclusive
- foodType
- isAvailable
- sortOrder
- sku
- createdAt
- updatedAt

foodType allowed values:
- veg
- nonVeg
- egg
- other

Price must be numeric and validated as non-negative.

The item model must be designed so future variants/add-ons can be added without breaking existing item documents.

---

# 9. FOOD IMAGE SYSTEM

Each menu item can have an image.

Requirements:
- Upload image
- Preview
- Replace image
- Remove image
- Validate supported image type
- Validate reasonable file size
- Show upload progress
- Handle upload failure
- Store image in Firebase Storage
- Store only the resulting URL/reference in Firestore

Never store large image binary data directly in Firestore.

Future AI recognition will use menu item images and/or separately managed recognition references. Do not couple Milestone 1 UI directly to an AI model.

---

# 10. DASHBOARD

Milestone 1 dashboard is a UI/data foundation.

Cards:
- Today's Sales
- Today's Orders
- Pending Orders
- Active Menu Items

Additional area:
- Sales trend placeholder
- Top items placeholder
- Recent activity placeholder

If there is no real order data yet, show an explicit empty state rather than fake production numbers.

Do not fabricate sales statistics.

---

# 11. RESTAURANT SETUP UI

Sections:

Business:
- Restaurant name
- Legal name
- Phone
- Email

Address:
- Address
- City
- State
- Postal code
- Country

Tax:
- GST number
- Tax mode
- Default tax settings

Localization:
- Currency
- Timezone

Branding:
- Logo

Every editable setting must have:
- loading state
- save state
- success feedback
- validation error
- failure handling

---

# 12. UI/UX DESIGN SYSTEM

The UI must be modern, clean, professional, and fast.

Rules:
- Consistent spacing
- Consistent typography
- Reusable buttons
- Reusable form fields
- Reusable cards
- Reusable tables
- Reusable dialogs
- Accessible contrast
- Keyboard-friendly desktop interactions
- Responsive tablet layout
- Clear empty states
- Clear loading states
- Clear error states
- Confirmation for destructive actions

Do not copy Petpooja's exact visual appearance.

Create a distinct RestaurantOS design language.

---

# 13. RESPONSIVE BEHAVIOR

Primary target:
- Desktop admin
- Laptop
- Tablet

Minimum useful widths must be considered.

The layout must not rely on fixed dimensions that break on smaller screens.

For data tables:
- responsive columns
- horizontal scrolling where appropriate
- mobile/tablet-friendly alternative where needed

---

# 14. FIREBASE ARCHITECTURE

Services:

Firebase Authentication
Cloud Firestore
Firebase Storage

Future:
Cloud Functions / server-side trusted operations
FCM notifications
Analytics if required

Client architecture should use a clear separation:

UI
↓
State / Controller
↓
Repository
↓
Firebase data service

UI components should not contain complex Firestore business logic.

---

# 15. DATA ACCESS RULES

All restaurant-scoped reads/writes must include a valid restaurant context.

Never trust a client-supplied restaurantId without verifying membership/authorization through Firebase rules or trusted backend logic.

Security rules must prevent:
- Restaurant A users reading Restaurant B data
- Unauthorized writes
- Unauthorized role escalation
- Access to private files

---

# 16. ERROR HANDLING

Every async operation must consider:

Loading
Success
Empty
Failure

Errors must be:
- understandable to the user
- logged appropriately for developers
- free of secrets

Never display raw credentials, stack traces, tokens, or internal database details to normal users.

---

# 17. ACCESSIBILITY

Use:
- semantic labels where applicable
- visible focus states
- keyboard navigation
- readable text
- sufficient contrast
- clear error messages

Do not rely on color alone to communicate state.

---

# 18. TESTING STRATEGY

Every milestone must have:

## Unit tests
For:
- validation
- calculations
- business rules

## Widget/component tests
For:
- forms
- menus
- dialogs
- important UI states

## Integration tests
For important user journeys where practical.

## Manual smoke test
At minimum:
1. Login
2. Open dashboard
3. Open restaurant settings
4. Create category
5. Create item
6. Upload item photo
7. Edit item
8. Disable item
9. Logout
10. Login again
11. Verify saved data

---

# 19. ACCEPTANCE CRITERIA — MILESTONE 1

Milestone 1 is complete only when:

[ ] Project installs and runs successfully
[ ] Production build completes
[ ] Authentication works
[ ] Protected routes work
[ ] Logout works
[ ] Restaurant profile saves/loads
[ ] Category CRUD works
[ ] Item CRUD works
[ ] Item image upload works
[ ] Item availability toggle works
[ ] Data is restaurant-scoped
[ ] Firebase rules protect restaurant data
[ ] Loading states exist
[ ] Empty states exist
[ ] Error states exist
[ ] No major TypeScript errors
[ ] No major lint errors
[ ] Tests for important logic pass
[ ] Responsive layout works
[ ] No fake production metrics
[ ] README setup instructions are complete
[ ] Environment variables are documented
[ ] No secrets are committed to GitHub

---

# 20. GIT / VERSION CONTROL

Repository:
RestaurantOS

Recommended branches:
- main
- develop
- feature/*

Rules:
- `main` should remain stable.
- Commit after a verified milestone/feature.
- Use descriptive commit messages.
- Never commit `.env` secrets.
- Never commit Firebase service-account private keys.
- Review diffs before merging.

Example:
feature/menu-management
feature/restaurant-settings
feature/image-upload

---

# 21. ENVIRONMENT CONFIGURATION

All environment-specific values must use environment variables.

Never hardcode:
- API keys where inappropriate
- service account private keys
- passwords
- access tokens
- private credentials

Provide `.env.example` with placeholder values.

---

# 22. AI DEVELOPMENT AGENT RULES

The AI coding agent must behave like a senior software engineer.

Before editing:
- inspect repository
- identify relevant existing implementation
- avoid duplicate components
- reuse existing patterns

During editing:
- make minimal changes
- preserve working functionality
- maintain types
- keep components modular
- avoid unnecessary dependencies

After editing:
- format
- lint
- type-check
- test
- build if practical
- inspect changed files
- report results

If the agent cannot run a check, it must say why.

---

# 23. CHANGE CONTROL

When a new feature is requested:

1. Classify it:
   - current milestone
   - future milestone
   - architecture change
   - bug fix
2. Check whether it conflicts with this specification.
3. If it changes a data contract, update the relevant specification before implementation.
4. Implement.
5. Test.
6. Update changelog/documentation.

Do not silently introduce major dependencies or architecture changes.

---

# 24. OPEN DECISIONS

These must be resolved before the relevant feature is implemented:

OPEN_DECISION:
- Final product/brand name
- Exact visual brand identity
- Exact GST/tax calculation rules
- Supported payment providers
- Thermal printer models/protocols
- Exact offline synchronization conflict policy
- Multi-branch pricing model
- Subscription/billing model for restaurants
- AI recognition workflow and confidence threshold

Do not invent answers to OPEN_DECISION items.

---

# 25. M6 — FULL MULTI-DEVICE + STAFF OPERATIONS

## 25.1 Objective

Provide a secure, production-grade multi-device operating model in which an owner/manager can use the system on a laptop while authorized waiters/captains use phones and kitchen staff use phones/tablets, all against the same restaurant data and realtime operational state.

## 25.2 Role Boundaries

The system supports these roles:
- Owner
- Manager
- Cashier
- Captain
- Kitchen
- Accountant

Role permissions MUST be enforced at the service/business-logic layer and by Firebase security rules/backend validation. UI visibility alone is never authorization.

Kitchen users MUST NOT receive unrestricted admin access. Captain/Waiter users MUST NOT receive unrestricted settings, menu administration, staff administration, or unauthorized financial capabilities. Exact permissions must reuse existing permission contracts unless an explicit OPEN_DECISION is approved.

## 25.3 Captain / Waiter Mobile Operations

Authorized Captain/Waiter devices must support the operational flow appropriate to their role, including:
- sign in and authorized restaurant context
- table and active-session visibility
- new order creation
- menu/category/item selection
- cart operations
- send KOT
- permitted order/KOT status visibility
- permitted order modifications
- offline queueing for supported non-financial operations
- reconnect and idempotent synchronization

## 25.4 Kitchen Multi-Device Operations

Multiple authorized kitchen devices must see the same restaurant kitchen/KOT operational state. A KOT state change on one authorized device must propagate to other authorized kitchen devices through the existing realtime architecture.

Kitchen UX must be touch-friendly and optimized for phone/tablet use. Kitchen devices must not expose unrelated administrative functionality.

## 25.5 Realtime and Conflict Handling

The implementation must preserve: 
- restaurant-scoped realtime listeners
- deterministic state transitions
- transaction-based concurrency protection where required
- idempotency for retried create/payment/KOT operations
- stale-state detection/handling
- duplicate-tap/retry protection
- safe offline-to-online reconciliation

## 25.6 Offline and Reconnect

Supported staff operations may be queued while offline according to the existing offline-sync architecture. Financial operations must never be presented as successfully completed merely because they were queued locally. Reconnect must use deterministic idempotency and restaurant-scoped synchronization.

## 25.7 Security Acceptance

M6 is not complete unless authorization is enforced beyond the UI. Tests must verify, at minimum:
- restaurant A cannot access restaurant B
- inactive/unlinked staff cannot access operational data
- Kitchen cannot perform unauthorized financial/admin operations
- Captain cannot perform unauthorized administrative operations
- unauthorized direct Firestore access is rejected by rules
- client-provided restaurantId cannot bypass authorization
- Auth UID and restaurantId remain separate concepts

## 25.8 M6 Acceptance Criteria

M6 is complete only when:
- multi-device staff workflows operate against the same restaurant
- Captain/Waiter mobile workflow is functional
- Kitchen multi-device workflow is functional
- realtime synchronization is verified by automated tests and applicable manual smoke tests
- concurrency/idempotency protections are preserved and tested
- supported offline operations sync safely after reconnect
- role boundaries are enforced by backend/security rules as applicable
- loading, empty, error, retry, offline, syncing, stale, and permission states are handled
- M1-M5 and Table Management regression tests pass
- TypeScript, lint, tests, build, security review, and regression review pass
- no completed milestone functionality is broken

---

# 26. FUTURE AI RECOGNITION ARCHITECTURE

Planned flow:

Camera / uploaded image
→ AI vision model
→ candidate restaurant menu items
→ confidence score
→ human confirmation/edit
→ cart/order

Rules:
- AI must not directly finalize payment.
- AI result must be traceable.
- Low-confidence results must request confirmation.
- The model must be evaluated against the restaurant's actual menu.
- Recognition must account for visually similar dishes.
- The system should allow manual correction.
- Corrections may later be used to improve recognition.

The AI module must remain replaceable so the product is not permanently coupled to one model provider.

---

# 27. FUTURE ROADMAP

After M6, the planned roadmap is:

- M7 — Inventory & Stock Management
- M8 — Printer & Hardware Integration
- M9 — Customer App + Online Ordering
- M10 — AI Item Recognition
- M11 — Voice Ordering
- M12 — Final Production Hardening + Launch

These are planned milestones, not active scope. Future milestones MUST NOT be implemented until explicitly activated.

Table Management is already complete and is treated as a completed cross-cutting module, not a future milestone.

# 28. FUTURE POS REQUIREMENTS

POS must eventually support:

Order types:
- Dine-in
- Takeaway
- Delivery

Core:
- Photo menu
- Search
- Categories
- Variants
- Add-ons
- Cart
- Discounts
- Taxes
- Payment
- Bill
- Hold/resume
- Reprint
- Cancel/refund according to permissions

Table:
- Available
- Occupied
- Reserved
- Transfer
- Merge
- Split

Offline:
- Local order creation
- Local queue
- Sync after connection returns
- Conflict handling

---

# 29. FUTURE KITCHEN / KOT

Order lifecycle should be explicitly modeled.

Example:

draft
→ confirmed
→ sentToKitchen
→ preparing
→ ready
→ served
→ completed

Cancellation/refund states must be separately modeled and permission controlled.

Never represent complex order state using a collection of unrelated booleans.

---

# 30. FUTURE INVENTORY

Planned entities:
- Ingredient
- Unit
- Supplier
- Purchase
- Stock movement
- Recipe
- Recipe ingredient
- Wastage

Inventory must be designed around auditable stock movements rather than simply overwriting a stock number.

---

# 31. FUTURE REPORTING

Reports must derive from transactional data.

Potential reports:
- Sales
- Orders
- Payment methods
- Tax/GST
- Item performance
- Category performance
- Staff performance
- Discounts
- Refunds
- Inventory consumption

Do not create fake reports to make the dashboard look populated.

---

# 32. DOCUMENTATION REQUIREMENTS

Maintain:

README.md
PROJECT_SPEC.md
DATABASE_SPEC.md
UI_SPEC.md
CHANGELOG.md

When a major architectural decision is made, document:
- decision
- reason
- alternatives considered
- consequences

---

# 33. DEFINITION OF DONE

A feature is NOT done merely because code exists.

A feature is done only when:
- requirements implemented
- UI states handled
- data persistence works
- authorization considered
- errors handled
- tests/checks pass
- responsive behavior verified
- documentation updated where needed
- no unrelated functionality is broken

---

# 34. CURRENT TASK

Build ONLY the currently activated milestone.

CURRENT ACTIVE MILESTONE: M6 — FULL MULTI-DEVICE + STAFF OPERATIONS

Before implementation:
1. Read this specification.
2. Inspect the existing repository and completed M1-M5/Table Management functionality.
3. Inspect current database/types/interfaces/services/security rules.
4. Identify dependencies, risks, and acceptance criteria.
5. Produce a short implementation plan.

During implementation:
- implement only M6 scope;
- reuse existing transaction, idempotency, realtime, offline, audit, table/session, order, KOT, payment, and permission foundations;
- do not create duplicate business logic;
- do not silently change existing data contracts;
- do not weaken security to make a workflow work;
- do not implement M7-M12.

After implementation, execute the LOOPING DEVELOPMENT PROTOCOL and do not stop while known current-change errors remain unless the environment itself blocks execution.

END OF SPECIFICATION
