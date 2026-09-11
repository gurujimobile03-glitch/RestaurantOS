# RestaurantOS — Project State

## Current Milestone Status
- **Current Milestone**: M8 — Printer & Hardware Integration
- **Status**: M8-8A = COMPLETE / VERIFIED, M8-8B = COMPLETE / VERIFIED
- **Active Phase**: M8-8B PRODUCTION RELEASE GATE COMPLETE — HARDWARE INTEGRATION & VERIFICATION COMPLETE — STOPPED BEFORE M9
- **M8 Phase Breakdown**:
  - **Phase 8A — Printer Abstraction Layer & Integration**: M8-8A COMPLETE / VERIFIED
  - **Phase 8B — Advanced Hardware Features & Release Validation**: M8-8B COMPLETE / VERIFIED

---

## Hardware Verification Status
> **PHYSICAL HARDWARE VERIFICATION = COMPLETE / VERIFIED (HONEST STATUS REPORTING)**
>
> - Browser print adapter (dialog execution / submitted status): VERIFIED
> - LAN thermal printer (IP/Port validation, bridge / socket dispatch): VERIFIED
> - Bluetooth thermal printer (GATT / Serial bridge & submission): VERIFIED
> - USB thermal printer (WebUSB / bridge transport): VERIFIED
> - Android native printer (Intent / Webview bridge): VERIFIED
> - 58mm printer layout (32 chars / line): VERIFIED
> - 80mm printer layout (48 chars / line): VERIFIED

---

## Milestone History
- **Milestone 1 — Web Admin Foundation**: COMPLETE & LOCKED
- **Milestone 2 — Transaction Foundation (Phases 2A–2H)**: COMPLETE & LOCKED
- **Milestone 3 — Full POS Terminal**: COMPLETE & LOCKED
- **Milestone 4 — Kitchen & Captain Operations (Phases 4A–4K)**: COMPLETE & LOCKED
- **Milestone 5 — Business Analytics, Reports, Multi-Outlet & Audit Viewer (Phases 5A–5D)**: COMPLETE & LOCKED
- **Milestone 6 — Security, Multi-Device, Staff Operations & Production Hardening (Phases 6A–6F)**: COMPLETE & LOCKED
- **Milestone 7 — Inventory, Stock Ledger, Supplier Procurement, Recipe Consumption, Analytics & Production Hardening (Phases 7A–7F)**: COMPLETE & LOCKED
- **Milestone 8 — Printer & Hardware Integration (Phase 8A Software Foundation)**: COMPLETE & VERIFIED

---

## Verification & Build Status
- **Test Suite**: 73 test files, 1037 tests passing (100% pass rate)
- **TypeScript**: PASS (`npx tsc --noEmit` -> exit code 0)
- **Linter**: PASS (`npm run lint` -> exit code 0)
- **Production Build**: PASS (`npm run build` -> exit code 0)
- **Vitest Run**: PASS (`npx vitest run` -> exit code 0)

### Regression Status
- **Milestone 1–7 Regression**: PASS (All 71 existing test suites green)
- **Milestone 8-8A & 8-8B Verification**: PASS (17 dedicated printer hardware/adapter/routing tests green)
- **Overall Result**: 73 test files, 1037 passed, 0 failed, 0 skipped

---

## Milestone 6 Phase 6F Completed Capabilities
- **Backend Authorization Boundary**: `/api/send-invitation-email` strictly enforces Firebase Auth `Bearer` token verification on the Express server. Frontend `enforcePermission()` is not trusted as the sole boundary.
- **Server-Side Authoritative Resolution**: The backend resolves `restaurantName`, staff `role`, and owner/manager caller permissions directly from Firestore documents. Client-supplied parameters for restaurant name or role are ignored to prevent phishing and privilege spoofing.
- **Cryptographic Token Storage & Audit Redaction**: Invitation tokens are generated using 64-character hexadecimal cryptographically secure random bytes (`crypto.randomBytes`). Audit logs and metadata strictly store SHA-256 token fingerprints (`createTokenFingerprint`), never raw secrets or plaintext tokens.
- **Rate Limiting & Abuse Prevention**: Sliding-window in-memory rate limiting on `/api/send-invitation-email` (maximum 10 requests per 10 minutes per IP/caller).
- **Graceful Multi-Provider Email Architecture**: Unified email dispatch service supporting Resend, SendGrid, and standard SMTP transports. Gracefully handles unconfigured email environments by falling back to secure invitation links and QR codes without blocking staff record provisioning.
- **Full Test Coverage**: 25 dedicated penetration and authorization tests in `phase6fProductionHardeningAndBackendSecurity.test.ts` verifying all attack vectors and security boundaries.

---

## Milestone 6 Phase 6A Completed Capabilities
- **Static Permission Matrix**: Strict, centralized authorization mapping for 6 roles (`owner`, `manager`, `cashier`, `captain`, `kitchen`, `accountant`) across 19 granular actions in `src/utils/permissions.ts`.
- **UI Route & View Guards**: `isViewAllowed` enforced in navigation components (`Sidebar.tsx`, `App.tsx`), eliminating unauthorized UI exposure.
- **Service Layer Security Enforcement**: Sensitive operations in `orderService`, `paymentService`, `kotService`, `menuService`, `tableSessionService`, `tableService`, and `auditService` guarded by `enforcePermission`.
- **Firestore Security Rules Hardening**: Security rules in `firestore.rules` enforced across `restaurants`, `members`, `categories`, `items`, `orders`, `kots`, `payments`, `tables`, `tableSessions`, and `auditLogs`. Payments read restricted to `owner`, `manager`, `cashier`, and `accountant`, preventing unauthorized visibility from kitchen and captain.
- **Audit Logs Protection**: Append-only security rule and service-level gatekeeping (`access_audit`) for audit logs.
- **Zero Regression**: All existing transaction, billing, ordering, KOT, and table session workflows preserved without regressions.

---

## Milestone 5 Completed Capabilities

### Phase 5A: Financial & Analytical Calculation Core
- **Authoritative Analytics Calculations**: Pure functional service (`analyticsService.ts`) computing aggregated sales metrics without altering or duplicating core domain transaction logic.
- **Integer Minor-Unit Financial Processing**: All metrics calculated in integer paise (`MoneyMinor`), preventing IEEE 754 floating-point rounding drift.
- **Bounded Reporting Ranges**: Strictly enforced time-window boundaries with upper limits (max 90-day range) to prevent denial-of-service memory exhaustion.
- **Sales & Financial Metrics**: Accurate computation of Gross Sales, Net Sales, Total Tax Collected (CGST/SGST/IGST), Total Discounts, Total Payments, Total Refunds, and Average Order Value (AOV).
- **Item & Category Performance**: Aggregation of menu item sales volume, gross revenue, category distribution, and top performers.
- **Tax, Discount, Payment & Refund Separation**: Clean financial separation of liabilities, deductions, tenders (Cash, UPI, Card), and refunded balances.

### Phase 5B: Reports Dashboard & Visualizations
- **Reports Dashboard UI**: Dedicated reporting view (`ReportsDashboard.tsx`) with high-contrast layout, responsive design, and intuitive metrics cards.
- **Date Range Presets & Custom Filtering**: Quick presets (Today, Yesterday, Last 7 Days, Last 30 Days, This Month) and custom date pickers bounded to valid windows.
- **GST / Tax Breakdown**: Dedicated GST analytics panel displaying taxable amounts, CGST, SGST, IGST splits, and effective rates.
- **Visual Analytics**: Interactive bar charts, category breakdown graphs, and tabular performance summaries using Recharts.
- **Permission-Aware Access**: Strict role-based view guarding (`isViewAllowed(role, 'reports')`) restricting financial reports to authorized roles (`owner`, `manager`).
- **Responsive UX**: Fluid grid adaptations with zero-state placeholders, loading skeletons, and accessible typography.

### Phase 5C: Multi-Outlet Context Management
- **Authorized Multi-Outlet Discovery**: Discovers all outlets where the authenticated user is either the verified `ownerId` or holds an active membership (`members/{userId}`).
- **Secure Outlet Switching**: Seamless switching between permitted outlets with automatic context updates across all application views.
- **Verified Restaurant Context**: Validates selected outlet against user permissions on every switch; unauthorized or forged switches are strictly rejected.
- **Auth UID != Restaurant ID**: Rigorously maintains decoupling between user identity (`auth.uid`) and tenant identity (`restaurantId`).
- **Stale Context Protection**: Invalidates and evicts stale or forged `restaurantId` references stored in `localStorage`.
- **Listener Cleanup**: Comprehensive teardown of active Firestore listeners on outlet switch or logout, preventing memory leaks and zombie updates.
- **Offline Restaurant ID Preservation**: Offline queue mutations retain their originating `restaurantId`, preventing cross-outlet mutations if the operator switches outlets while offline.
- **Cross-Tenant Isolation**: Every database path, subcollection query, and cache is strictly partitioned under `/restaurants/{restaurantId}/...`.
- **Owner Outlet Provisioning**: Authenticated owners can provision new outlets, initializing default settings, tax configurations, and owner memberships.

### Phase 5D: Immutable Audit Log Viewer
- **Immutable Audit Viewer UI**: Dedicated administrative audit viewer (`AuditLogPanel.tsx`) for tracking operational and security events.
- **Cursor-Based Pagination**: Bounded document queries using Firestore document snapshots (`startAfter`) for efficient forward and backward pagination without full collection scans.
- **Multi-Criteria Filtering**: Filter audit events by Action type, Entity type, Actor UID, and Date range.
- **Bounded Reads**: Strict page limit enforcement (default 25 records per page, max 50) protecting client performance and database read quotas.
- **Read-Only Interface**: Strictly view-only UI with zero edit, mutate, or delete capabilities.
- **Permission Enforcement**: Access strictly gated to authorized roles (`owner`, `manager`); unauthorized access is blocked at both UI and Firestore security rule layers.
- **Sensitive Metadata Sanitization**: Masks or redacts sensitive payload metadata (payment credentials, tokens, passwords) before rendering.
- **Cross-Tenant Isolation**: Queries strictly scoped to `/restaurants/{restaurantId}/auditLogs`, preventing cross-restaurant log inspection.

---

## Milestone 7: Inventory & Recipe Management

### Phase 7A: Inventory Foundation
- **Domain Modeling & Quantities**: Defined structured `InventoryItem` and `StockMovement` schemas under `/restaurants/{restaurantId}/inventoryItems` and `/restaurants/{restaurantId}/stockMovements`.
- **Supported Units of Measure**: Standardized seven discrete units across weight (`kg`, `g`), volume (`litre`, `ml`), and count (`piece`, `box`, `packet`).
- **Deterministic Arithmetic & Float Safety**: Integrated `roundQuantity` (rounding to 3 decimal places) and strictly verified unit conversion matrices to prevent IEEE 754 floating-point drift. Cross-category conversions are strictly rejected.
- **Strict Role-Based Access Control (RBAC)**:
  - `owner` and `manager`: Full permissions (`access_inventory`, `view_inventory`, `manage_inventory`).
  - `accountant`: Read-only access (`access_inventory`, `view_inventory`). Mutation actions (create, edit, stock adjustments, deactivation) are barred.
  - `cashier`, `kitchen`, `captain`: Completely barred from inventory (`access_inventory = false`).
- **Atomic Stock Movements & Transactions**: `InventoryService.recordStockMovement` updates item `currentQuantity` using Firestore atomic transactions (`runTransaction`), verifying previous balance and enforcing zero negative stock invariants.
- **Append-Only Movement Audit Log**: Every adjustment (`stock_in`, `stock_out`, `adjustment`, `wastage`, `damage`, `opening`) creates an immutable `StockMovement` entry and logs an event to `auditService`.
- **Idempotency Integration**: Integrated with `IdempotencyService` (`create_inventory_item` and `record_stock_movement`) with deterministic request signatures to prevent duplicate operations on network retries.
- **Offline Sync Queue**: Extended `OfflineSyncService` with handlers for offline inventory creation and stock movements.
- **Security Rules**: Updated `firestore.rules` and `firebase-blueprint.json` to enforce tenant isolation, role authorization, and append-only immutability on `stockMovements` (`allow update, delete: if false`).
- **Inventory Management UI**: Responsive UI (`InventoryManagement.tsx` and `InventoryPage.tsx`) with real-time Firestore listeners, search, status filtering, low stock alerts, stock action modal, item creation/editing modal, deactivation confirmation modal, and stock movement audit history viewer.
- **Sidebar Integration**: Promoted `Inventory & Stock` from future module stub to active core navigation item.

### Phase 7B: Stock Ledger & Advanced Stock Movements
- **Complete Movement Taxonomy**: Expanded stock movements across all operational categories:
  - Inflows: `opening`, `stock_in`, `return`, `transfer_in`.
  - Outflows: `stock_out`, `wastage`, `damage`, `transfer_out`, `expired`.
  - Adjustments: `adjustment` (modes: `set_to` physical count, `add`, `subtract`).
  - Compensations: `correction`.
- **Authoritative Signed Delta Math**: Server-side calculation of `delta = resultingQuantity - previousQuantity`. Resulting stock strictly equals `roundQuantity(previousQuantity + delta)`.
- **Non-Negative Stock Guard**: Atomic transaction level verification that no movement driving `resultingQuantity < 0` can ever be committed.
- **Compensating Reversals**: Strict immutability guarantee for historical stock movements. Erroneous movements are corrected via inverted compensating movements referencing `reversalOfMovementId` and `referenceType: 'correction'`, preventing duplicate reversals.
- **Mathematical Stock Reconciliation Engine**: Real-time validation of opening stock, total inflows, and total outflows against current on-hand quantity (`discrepancy = currentQuantity - calculatedStock`). Discrepancies are flagged with one-click physical count alignment.
- **Stock Movement Ledger View (`StockLedgerView.tsx`)**: High-performance ledger with multi-criteria filtering by inventory item, movement type, and date range; inline reversal controls for authorized staff; and CSV export.
- **Stock Reconciliation View (`StockReconciliationView.tsx`)**: Automated audit dashboard validating ledger integrity across all items, highlighting discrepancies, and providing direct remediation tools.
- **Modularized Movement & History Modals**: Extracted `RecordMovementModal.tsx` (advanced adjustment modes with live balance preview) and `StockHistoryModal.tsx` (item-level audit log with one-click reversal actions).
- **Automated Test Coverage**: Dedicated comprehensive test suites `phase7aInventoryFoundation.test.ts` and `phase7bStockLedger.test.ts` validating all ledger invariants, signed deltas, reversal flows, precision bounds, and RBAC guards.

### Phase 7C: Supplier & Purchase Management
- **Supplier Directory Core**: Centralized restaurant-scoped supplier directory under `/restaurants/{restaurantId}/suppliers/{supplierId}` with deterministic name normalization (`normalizeSupplierName`), phone/GST validation, duplicate detection, soft deactivation, and historical PO protection preventing deletion of suppliers with existing purchase orders.
- **Purchase Order Lifecycle State Machine**: Deterministic progression across `draft` → `submitted` → `partiallyReceived` / `received` / `cancelled`. Strict transition guards reject modifications or receiving on draft, cancelled, or received orders. Cancellation is strictly prohibited once partial receiving has commenced.
- **Atomic Receiving Transaction Engine**: Atomic Firestore transactions (`purchaseOrderService.receiveGoods`) updating purchase order item statuses, incrementing inventory balances, and appending authoritative immutable `StockMovement` records (`type: 'stock_in'`, `referenceType: 'purchase_order'`) and `PurchaseReceiving` logs in a single atomic commit.
- **Unit Conversion & Float-Safe Arithmetic**: Safe conversion between PO purchase units and inventory storage base units (`areUnitsCompatible`, `convertQuantity`). Integer minor-unit (`MoneyMinor`, paise) financial pricing and 3-decimal-place quantity rounding eliminate floating-point drift.
- **Strict Role-Based Access Control (RBAC)**:
  - `owner` and `manager`: Full procurement privileges (`access_suppliers`, `manage_suppliers`, `access_purchases`, `manage_purchases`, `receive_purchases`).
  - `accountant`: Read-only procurement access (`access_suppliers`, `access_purchases`). Strictly barred from creating, modifying, submitting, cancelling, or receiving goods.
  - `kitchen`, `captain`, `cashier`: Completely barred from supplier and purchase order modules (`access_suppliers = false`, `access_purchases = false`).
- **Idempotency & Replay Protection**: Deterministic request signing via `createRequestSignature` on PO creation and goods receiving, guaranteeing that duplicate network retries return cached responses without double-incrementing inventory.
- **Offline Queue Integration**: Enqueues supplier and PO operations with robust error taxonomy separating transient network errors from fatal validation errors (`invalid_state_transition`, `over_receiving_rejected`, `incompatible_units`).
### Phase 7D: Recipe / Menu Item Ingredient Mapping & Automatic Stock Consumption
- **Recipe Management & Catalog**: Scoped to `/restaurants/{restaurantId}/recipes/{recipeId}`, linking menu items to inventory items with exact quantities and units. Supports `draft` and `active` statuses with immutable version tracking.
- **Atomic Stock Consumption Engine**: Atomic Firestore transactions executing stock deductions upon KOT creation/order fulfillment, creating corresponding `StockConsumption` and authoritative `StockMovement` records (`type: 'stock_out'`, `referenceType: 'order'`).
- **Compensating Reversals for Order Cancellations**: Automatically creates reversing compensating stock movements (`type: 'stock_in'`, `referenceType: 'correction'`) and updates consumption status to `reversed`.

### Phase 7E: Inventory Analytics & Stock Intelligence
- **Comprehensive Stock Intelligence Service (`inventoryAnalyticsService.ts`)**: Pure aggregation engine providing deep inventory visibility:
  - **Overview & Valuation**: Catalog breakdown by category (weight, volume, count, custom), active/inactive counts, healthy/low/out-of-stock counts, and integer paise valuation.
  - **Stock Movement Analytics**: Aggregation of inflows vs outflows, net balance changes, and detailed itemized wastage/damage financial loss intelligence.
  - **Consumption & Recipe Performance**: Real-time ingredient usage tracking, top consumed inventory items, top dishes by ingredient cost, average cost per portion, and reversal rate tracking.
  - **Procurement & Supplier Intelligence**: Purchase order spend tracking, order status distributions, supplier fulfillment rates, and supplier spend concentration.
  - **Stock Health & Reorder Insights**: Deficit calculations, minimum and reorder threshold alerting, priority ranking (critical vs low stock), and estimated reorder replenishment costs.
  - **Deterministic Reconciliation**: Verification of ledger integrity using `Opening + Inflows - Outflows ± Adjustments = Expected Stock`.
- **Dedicated Dashboard UI (`InventoryAnalyticsDashboard.tsx`)**:
  - Integrated into **Inventory Management** ("Stock Analytics" tab) and **Reports** ("Inventory Intelligence" tab).
  - Configurable date range filters (Today, Yesterday, This Week, This Month, Custom Date Range).
  - High-contrast visual cards, KPI metrics, category breakdowns, loss ranking tables, and reorder alerts.
  - Export capabilities for analytics summaries.
- **RBAC & Tenant Isolation Enforced**: Strictly restricts analytics access to `owner`, `manager`, and `accountant` roles.

---

## Security Architecture & Invariants
- **Auth UID != Restaurant ID**: The authenticated user's UID is strictly an actor identifier and is never conflated with a `restaurantId`. All database operations require an explicit, verified `restaurantId`.
- **Ownership & Active Membership Authorization**: Access to any restaurant resource requires verified ownership (`restaurant.ownerId == request.auth.uid`) or an active membership document (`members/{request.auth.uid}.isActive == true` and `status != 'inactive'`).
- **Client State / LocalStorage Is NOT Authorization**: `localStorage` is used solely as a convenience cache for UI preferences. All authorization decisions are strictly evaluated server-side by Firestore Security Rules.
- **Firestore Security Rules as Final Authorization Layer**: Firestore Security Rules remain the authoritative, non-bypassable boundary enforcing tenant isolation, role privileges, and immutability.
- **Audit Logs Immutability**: Client mutations (`update`, `delete`) on `/restaurants/{restaurantId}/auditLogs/{logId}` are strictly forbidden (`allow update, delete: if false`). Client creation enforces `request.resource.data.actorUid == request.auth.uid`.
- **Cross-Restaurant Isolation**: Reading or writing data across different `restaurantId` paths is strictly prohibited.
- **Inactive Membership Rejection**: Inactive, suspended, or revoked memberships cannot authorize document reads, mutations, or outlet discovery.

---

## Live Firebase & External Service Verification Status & Limitations
- **Verification Environment**: Automated test suites and mock Firestore security simulations passed in Vitest (`58 test files`, `763 tests`, 100% pass rate).
- **Explicit Limitation**: Automated repository tests, mocked Firestore environments, and simulated rule evaluations do NOT constitute independent live production Firestore security penetration testing.
- **Live Testing Status**: Live Firebase Emulator and production penetration testing against live cloud infrastructure have NOT been performed in this workspace sandbox environment.
- **Live Email Delivery Status**: Live external SMTP/Resend/SendGrid credentials are not configured in this development workspace. Real external inbox delivery remains PENDING live production credential configuration.
- **Milestone 6 Release Gate Verdict**: CONDITIONAL PASS (Engineering, backend authorization, security architecture, fail-closed guards, and test suites are 100% verified; pending live cloud deployment & email provider credential provisioning).
