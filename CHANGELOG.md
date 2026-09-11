# Changelog — RestaurantOS

All notable changes to RestaurantOS will be documented in this file.

## [Milestone 6 — Phase 6F: Production Hardening, Backend Authorization & Final Verification] - 2026-09-10

### Added & Hardened
- **Server-Side Authorization Boundary**:
  - Implemented `verifyInvitationCaller` in `src/server/invitationAuth.ts` verifying caller identity and roles (`owner`, `manager`) via Firebase Auth ID tokens.
  - Express endpoint `/api/send-invitation-email` requires an `Authorization: Bearer <token>` header; unauthenticated calls return 401 Unauthorized.
- **Authoritative Server Resolution**:
  - Backend derives restaurant name and employee role directly from verified Firestore documents (`restaurants/{restaurantId}` and `restaurants/{restaurantId}/members/{invitationId}`).
  - Client-supplied `restaurantName` and `role` parameters are rejected/overridden, preventing invitation spoofing or phishing.
- **Cryptographic Token Security & Audit Redaction**:
  - Invitation tokens use 64-character hexadecimal CSPRNG random bytes.
  - Added `createTokenFingerprint` and `sanitizeAuditMetadata` in `auditService.ts` ensuring raw invitation tokens are never stored in audit logs.
- **In-Memory Rate Limiting**:
  - Sliding-window rate limiting on invitation dispatch (10 requests per 10 minutes per IP/caller) with automatic cleanup.
- **Automated Security Suite**:
  - Created `src/test/phase6fProductionHardeningAndBackendSecurity.test.ts` with 25 penetration, privilege escalation, and injection tests.
  - Complete repository test suite passes with **763 tests across 58 test files (100% pass rate)**.

## [Milestone 6 — Phase 6E: Staff Accounts + Role Management & Invitation Claiming] - 2026-09-10

### Added & Hardened
- **Staff Invitation Decoupling**:
  - Separated staff invitation records (`status: 'pending_setup'`, `isActive: false`) from Firebase Auth user account creation.
  - Owners no longer create passwords or overwrite Firebase Auth accounts for employees.
  - Employees claim invitations using `/accept-invitation?token=...`, verifying email matching and email verification status.
- **Multi-Tenant Login & Restaurant Assignment**:
  - Implemented `claimPendingInvitationsForUser` linking authenticated employee UIDs to their pending memberships upon login.
  - Preserved root owner immutability; owners cannot be demoted or deactivated via staff management subcollections.
- **Email Delivery Integration**:
  - Integrated Resend, SendGrid, and SMTP providers in `emailService.ts` with fallback to QR code and copyable invitation links.

## [Milestone 6 — Phase 6A: Role & Permission Foundation] - 2026-09-09

### Added & Verified
- **Phase 6A Role & Permission Foundation**:
  - Established and hardened the complete role and permission matrix across all 6 roles: Owner, Manager, Cashier, Captain, Kitchen, and Accountant.
  - Hardened static permission definitions in `src/utils/permissions.ts` across 19 granular operational and administrative actions.
  - Implemented dynamic membership checking with `cleanRestaurantId` validation guard, ensuring blank, forged, or cross-tenant restaurant parameters are safely rejected.
  - Enhanced UI navigation guards (`isViewAllowed`) across `Sidebar.tsx` and `App.tsx` ensuring zero unauthorized feature exposure.
  - Integrated service-layer security enforcement via `enforcePermission` in `orderService`, `paymentService`, `kotService`, `menuService`, `tableSessionService`, `tableService`, and `auditService`.
  - Hardened Firestore Security Rules in `firestore.rules` to restrict payments read access strictly to `owner`, `manager`, `cashier`, and `accountant`, preventing unauthorized financial visibility on Kitchen or Captain devices.
  - Protected audit logs with immutable security rules and service-level access checks.
  - Added comprehensive automated test suite (`src/test/rolePermissions.test.ts`) validating all 20 required verification scenarios for Phase 6A.
  - Verified 100% test pass rate, TypeScript compilation, and zero regression across existing M1-M5, Table Management, and security suites.

## [Milestone 5 — Business Analytics, Reports, Multi-Outlet & Audit Viewer] - 2026-09-09 — Final Completion & Locked Snapshot

### Added & Verified
- **Milestone 5 Completion & Locked Status**:
  - Successfully implemented and verified all four phases of Milestone 5: 5A, 5B, 5C, and 5D.
- **Phase 5A — Financial & Analytical Calculation Core (`analyticsService.ts`)**:
  - Implemented authoritative, pure functional reporting calculations in integer minor units (paise).
  - Enforced bounded query ranges (maximum 90-day window) to prevent client/database resource exhaustion.
  - Aggregated Gross Sales, Net Sales, Tax (CGST/SGST/IGST), Discounts, Payments by tender (Cash/UPI/Card), Refunds, AOV, and top item/category performance metrics.
- **Phase 5B — Reports Dashboard & Visualizations (`ReportsDashboard.tsx`)**:
  - Built full-featured interactive analytics dashboard with Recharts visualizations, date range presets, and GST liability breakdowns.
  - Enforced permission-aware access guarding (`isViewAllowed(role, 'reports')`) restricting financial reports to owners and managers.
  - Delivered responsive layout with accessible zero-states, metric cards, and loading skeletons.
- **Phase 5C — Multi-Outlet Context Management (`RestaurantContext.tsx`, `firestore.rules`)**:
  - Implemented secure multi-outlet discovery for owners (`ownerId == auth.uid`) and staff via active `members` subcollections.
  - Hardened Firestore Security Rules with a dedicated collection group read rule requiring `isSignedIn() && resource.data.userId == request.auth.uid && resource.data.isActive == true`.
  - Implemented secure outlet switching with full listener teardown, preventing memory leaks or cross-tenant event contamination.
  - Standardized all application components on the canonical `restaurant.restaurantId` property.
  - Enforced automatic eviction of invalid or forged `restaurantId` values stored in `localStorage`.
  - Preserved originating `restaurantId` on all queued offline mutations across context switches.
- **Phase 5D — Immutable Audit Log Viewer (`AuditLogPanel.tsx`)**:
  - Created read-only audit viewer with cursor-based document pagination (`startAfter`) and multi-criteria filtering (Action, Entity, Actor, Date).
  - Enforced strict bounded page sizes (25/50 items) and client-side sanitization/masking of sensitive payload data.
  - Gated access to authorized administrative roles (`owner`, `manager`) with immutable rule enforcement (`allow update, delete: if false`).
- **Security & Multi-Tenant Enforcement**:
  - Rigorously maintained `auth.uid !== restaurantId` decoupling across all subcollections and service calls.
  - Verified that client storage is never treated as an authorization mechanism.
- **Verification & Testing**:
  - Complete repository test suite passed with **100% success rate across 47 test files and 523 individual tests**.
  - TypeScript check: PASS (`tsc --noEmit`).
  - Linter check: PASS (`npm run lint`).
  - Production build: PASS (`npm run build`).
  - All milestone regressions verified: M1 (PASS), M2 (PASS), M3 (PASS), M4 (PASS), M5 5A–5D (PASS).

## [Milestone 4 — Final Security Patch & Acceptance Audit] - 2026-09-08 — Operational UX, Offline Resilience & Security Hardening

### Added & Verified
- **Active Member Security Guard (`firestore.rules`)**:
  - Enforced that only active members (`isActive == true` and `status != 'inactive'`) can query and mutate restaurant subcollections.
- **Table Session Permissions Hardening (`firestore.rules`)**:
  - Captains and cashiers can update physical tables exclusively via session-related locking keys (`activeSessionId` and `updatedAt`) to prevent privilege escalation.
- **Audit Logs Actor Integrity Hardening (`firestore.rules`)**:
  - Restructured client-created audit logs to strictly enforce `request.resource.data.actorUid == request.auth.uid`, preventing any client-side spoofing or impersonating of the `"system"` actor. Documented that future administrative system logs require an authoritative server-side/backend mechanism.
- **Restaurant Root Document Protection (`firestore.rules`)**:
  - Hardened access to `/restaurants/{restaurantId}` so that direct lookup `get` permissions are bound to the authoritative active-membership security model (`isMemberOfRestaurant(restaurantId)`), ensuring inactive or suspended members cannot access private restaurant data.
- **Staff Connection Resolution (`src/context/RestaurantContext.tsx`)**:
  - Fixed a critical connection blocker where non-owner staff members (Captains, Cashiers) were stuck on "Connecting to Firestore..." because Strategy 1 (cached storage lookup) and Strategy 2 (profile lookup) were checking if `found.ownerId === user.uid`. Expanded logic to check active membership status securely via their `members/{userId}` subcollection document to allow full, correct restaurant resolution.
- **Complete Phase 4I Offline Resilience Suite (`src/test/phase4iOfflineResilience.test.ts`)**:
  - Fully implemented all 26 distinct operational resilience scenarios including bounded queue capacity, network status tracking, flapping network simulation, duplicate enqueuing prevention, idempotency verification, external card/UPI offline blocking safeguards, and logout cache clears.
- **Comprehensive Security Attack Suite (`src/test/securityAttacks.test.ts`)**:
  - Created a robust, dedicated attack simulation test suite covering 20 security scenarios, 7 audit integrity checks, 6 table/session locking invariants, and formal simulator tests confirming rules evaluation for `actorUid` spoofing and inactive user access.
- **Verification & Testing**:
  - Complete repository test suite passed with **100% success rate across 43 test suites/files, 1 setup file, and 449 individual tests**.

## [Milestone 4 — Phase 4E] - 2026-09-08 — Table & Session Operations

### Added & Verified
- **Table Session Service Enhancements (`src/services/tableSessionService.ts`)**:
  - Implemented `updateGuestCount(restaurantId, sessionId, newGuestCount, updatedBy)` with atomic transaction checks enforcing session state (`'open'`), capacity limits ($1 \le \text{guestCount} \le \text{capacity}$), and operational audit logging.
  - Wired operational audit event creation (`session_opened`, `session_guest_count_updated`, `session_closed`) into `auditService`.
- **Offline & Idempotency Queue Integration (`src/services/offlineSyncService.ts`, `src/types/idempotency.ts`)**:
  - Extended `IdempotencyOperation` and `offlineSyncService` to support `'close_session'` and `'update_guest_count'`.
  - Enables offline queuing and chronological retry dispatch with deterministic client request IDs.
- **Captain / Staff Interactive Session Controls (`ActiveSessionModal.tsx`, `CaptainPage.tsx`)**:
  - Added interactive guest count adjustment controls with immediate validation against physical table capacity.
  - Multi-device realtime subscription updates reflected seamlessly across POS, Captain, and KDS without manual refresh.
- **Verification & Testing**:
  - Comprehensive unit and integration suite created in `src/test/phase4eTableSessionOps.test.ts` (13 tests passing).
  - Complete repository test suite passed: **36/36 test files, 365/365 individual tests passed**.

## [Milestone 4 — Phase 4D] - 2026-09-08 — Captain / Staff Operations Foundation

### Added & Verified
- **Captain / Staff Operational Screen (`src/pages/CaptainPage.tsx`)**:
  - Implemented floor operational interface for dining floor staff and captains to monitor table sessions, guest counts, active orders, and live KOT preparation progress.
  - Reuses existing `tableService`, `tableSessionService`, `orderService`, and `kotService` real-time subscriptions without duplicating domain logic or financial calculations.
- **Captain Navigation & Role Taxonomy**:
  - Added `captain` to `StaffRole` taxonomy (`src/types/auth.ts`) alongside `owner`, `manager`, `cashier`, and `kitchen`.
  - Added Captain / Staff Ops item to main navigation in `Sidebar.tsx` and route handling in `App.tsx`.
- **Interactive Floor Cards & Status Modals**:
  - **`TableCard.tsx`**: Displays floor area, capacity, occupancy badge, active session duration, order items count, and latest KOT kitchen status.
  - **`OpenSessionModal.tsx`**: Touch-friendly modal for opening new table sessions with guest count validation (1 <= guestCount <= capacity) and atomic transaction enforcement.
  - **`ActiveSessionModal.tsx`**: Drawer/modal for viewing active table sessions, ordered items, KOT progress, sending KOTs to kitchen, closing sessions, and linking to POS settlement.
- **Strict Boundary & Multi-Tenant Enforcement**:
  - Multi-tenant isolation enforced under `/restaurants/{restaurantId}/...`.
  - Financial calculations and payment settlement remain authoritatively handled by POS Terminal and Phase 2B/2C calculation engines.
- **Verification & Testing**:
  - Test suite created in `src/test/phase4dCaptainStaffOps.test.ts` verifying real-time subscriptions, atomic session locks, idempotency key generation, and role boundaries.
  - Full test suite passing: 35/35 test files passed (352/352 individual tests passed).

## [Milestone 4 — Phase 4A] - 2026-09-08 — Kitchen Display Foundation (KDS)

### Added & Verified
- **Kitchen Display System Route & Shell (`KitchenPage.tsx`)**:
  - Implemented high-contrast, dark-mode-optimized Kitchen Display System route accessible via `/kitchen` / Sidebar navigation.
  - Reuses existing `kotService.subscribeToKitchenKOTs` for real-time Firestore subscription to active non-terminal KOTs (`confirmed`, `sentToKitchen`, `preparing`, `ready`).
- **Realtime KOT Queue Cards (`KotCard.tsx`)**:
  - Displays ticket identity (`kotNumber`, `orderNumber`), order type badges (`Dine-In`, `Takeaway`, `Delivery`), and physical table identification (`Table X`).
  - Live elapsed preparation timer with visual urgency threshold badges (<10m slate/green, 10–20m amber warning, >20m red overdue alert).
  - High-readability KOT items list displaying quantity badges (`3x`), item short names, item notes, ticket notes, and modifier options.
- **KOT Lifecycle Status Controls**:
  - Authoritative status transition controls (`sentToKitchen` → `preparing` → `ready` → `served`) invoking `kotService.updateKOTStatus`.
  - KOT cancellation modal (`CancelKotModal.tsx`) enforcing mandatory audit reason logging via `kotService.cancelKOT`.
- **Operational UX States**:
  - High-contrast animated skeleton loading grid during initial connection.
  - Dedicated empty state ("Kitchen Queue Clear") when no active tickets remain.
  - Connection error banner with interactive **Retry Connection** button.
  - Embedded `OfflineSyncIndicator` in the header for connectivity and sync queue visibility.
- **Verification & Testing**:
  - Unit/integration test suite created in `src/test/phase4aKitchenDisplay.test.ts` verifying subscription filters, state machine transitions, cancellation validation, and multi-tenant isolation.
  - 33/33 test files passing (329/329 tests passing).

## [Milestone 3] - 2026-09-08 — Full POS Terminal Implementation

### Added & Verified
- **POS Terminal Shell & Layout**:
  - Top navigation bar with multi-tenant restaurant info, user role badge, order type selector, and offline queue indicator.
  - Category bar with horizontal scroll, active filters, and real-time menu item search.
  - Menu grid displaying availability badges, pricing, and category filters.
- **Cart & Order Management**:
  - Dynamic cart panel supporting item quantity updates, per-item custom notes, percentage/flat discounts, and order notes.
  - Integration with Phase 2B authoritative calculation engine (`calculateOrderTotals`) for zero-drift subtotal, tax, discount, and grand total in paise (minor units).
  - Support for Dine-In, Takeaway, and Delivery order types.
  - Table and TableSession integration requiring active session validation for Dine-In orders.
  - Historical price, name, and tax snapshots preserved on every order item.
- **Kitchen Order Tickets (KOT)**:
  - Atomic KOT creation via `kotService.createKOTFromOrder` with thermal short-name snapshots and status routing (`sentToKitchen`).
- **Payments & Settlement**:
  - Payment Modal supporting Cash, UPI, Card, and split payments.
  - Integration with `paymentService.recordPayment` enforcing overpayment prevention, exact balance updates, and transaction atomicity.
  - Printable / downloadable Bill Receipt Modal with QR code and breakdown.
- **Hold & Resume Carts**:
  - Held orders modal allowing staff to stash draft carts locally without creating uncommitted database records, with full resume and delete capabilities.
- **Cancellation & Refunds**:
  - Safe lifecycle order cancellation with mandatory reason logging via `orderService.updateOrderStatus`.
  - Authoritative payment refund mechanism via `paymentService.refundPayment` preserving historical records for financial auditing while updating active paid totals.
- **Offline Synchronization & Idempotency**:
  - Integration with `OfflineSyncService` for offline queuing, real-time status indicators, capacity limits, and exponential backoff retry.
  - Idempotency key binding across order creation, KOT creation, and payment settlement preventing duplicate operations during network re-connects.
- **Security & Multi-Tenant Isolation**:
  - Explicit `restaurantId` scoping across all POS actions, fully decoupled from `auth.uid`.
  - Strict compliance with Firestore security rules and multi-tenant domain boundaries.
- **Verification & Testing**:
  - Full regression test suite passing 32/32 test files (324/324 tests).
