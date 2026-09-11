# Project Architectural & Business Decisions — RestaurantOS

## Milestone 3 Architectural Decisions

### 1. Existing Phase 2 Service Reuse
- **Decision**: The POS Terminal utilizes existing Phase 2 domain services (`OrderService`, `KOTService`, `PaymentService`, `TableSessionService`, `OfflineSyncService`) rather than duplicating business logic inside React components.
- **Rationale**: Ensures a single source of truth for financial rules, state transitions, security scoping, and data contracts.

### 2. Authoritative Financial Engine
- **Decision**: All financial calculations (subtotals, CGST/SGST/IGST taxes, percentage/flat discounts, grand totals) are computed authoritatively by `calculateOrderTotals` in minor integer units (paise).
- **Rationale**: Completely eliminates floating-point rounding errors and client-side financial manipulation.

### 3. Historical Price & Tax Snapshots
- **Decision**: Item names, short names, unit prices, and tax rates are snapshotted on `OrderItem` at the time of cart submission.
- **Rationale**: Protects historical orders and financial reporting from subsequent menu price or tax configuration edits.

### 4. Minor Unit Settlement & Overpayment Protection
- **Decision**: Payments are recorded in integer paise. `PaymentService.recordPayment` rejects any payment that would cause `paidAmountMinor > grandTotalMinor`.
- **Rationale**: Guarantees accounting integrity and prevents accidental double-charging or over-settlement.

### 5. Offline Synchronization & Payment Gateway Safeguards
- **Decision**: Offline operations are queued via `OfflineSyncService` with deterministic idempotency keys and processed chronologically upon network recovery.
- **Safeguard**: External digital payments (Card/UPI) cannot be marked as "completed" while offline without online payment gateway authorization.

### 6. Idempotency Key Binding
- **Decision**: Retry-sensitive operations (`create_order`, `create_kot`, `record_payment`) accept a `clientRequestId` / `idempotencyKey`.
- **Rationale**: Prevents duplicate database records or multiple kitchen print runs during network retries or client reconnection loops.

### 7. Identity Decoupling
- **Decision**: `auth.uid` is treated strictly as an actor identity and is NEVER assumed to equal `restaurantId`. All operations explicitly require and validate `restaurantId`.
- **Rationale**: Essential for multi-tenant isolation, staff access roles, and audit trail fidelity.

### 8. Held Orders Local Draft Isolation
- **Decision**: Held cart drafts are maintained in local state/storage and do NOT create uncommitted order documents in Firestore.
- **Rationale**: Prevents database clutter and corrupt financial metrics from abandoned or draft carts.

### 9. Immutable Financial Audit Trail for Refunds
- **Decision**: Payment documents are never deleted upon refund. `refundPayment` transitions the payment status to `refunded` and updates the order's `paidAmountMinor` and `dueAmountMinor`.
- **Rationale**: Preserves complete historical audit trail for financial accounting and reporting.

---

## Milestone 5 Architectural Decisions

### 10. Auth UID and Restaurant ID Decoupling
- **Decision**: `auth.uid` is strictly an actor/user identity and is NEVER conflated with `restaurantId`.
- **Rationale**: Preserves multi-tenant isolation, supports multi-outlet operators, and allows staff members to belong to different restaurants with distinct roles.

### 11. Strict Subcollection Partitioning & Cross-Tenant Isolation
- **Decision**: All business entities (categories, items, tables, tableSessions, orders, kots, payments, auditLogs, members) are strictly partitioned under `/restaurants/{restaurantId}/...`.
- **Rationale**: Guarantees zero data leakage across different restaurant outlets, enforces deterministic security boundaries in `firestore.rules`, and simplifies tenant maintenance.

### 12. Client Storage Is NOT an Authorization Mechanism
- **Decision**: `localStorage` (e.g., cached `restaurantId` or UI preferences) is strictly treated as a non-authoritative client cache.
- **Rationale**: Any cached outlet identifier is always re-verified against the user's active membership or ownership in Firestore. Forged or stale storage keys are automatically evicted upon discovery failure.

### 13. Absolute Immutability of Audit Logs
- **Decision**: Audit log documents (`/restaurants/{restaurantId}/auditLogs/{logId}`) are strictly write-once and append-only.
- **Rationale**: `firestore.rules` enforces `allow update, delete: if false`. Clients are strictly forbidden from modifying or erasing historical audit records, ensuring tamper-evident accountability.

### 14. Architecture Reuse for Analytics & Audit Operations
- **Decision**: Milestone 5 reporting and audit systems reuse existing transactional models (`Order`, `Payment`, `AuditLog`) and offline synchronization architecture (`OfflineSyncService`, `idempotencyService`) rather than introducing duplicate database collections or divergent schemas.
- **Rationale**: Ensures single source of truth for financial numbers, avoids synchronization drift, and keeps data models lean.

### 15. Prohibition of Speculative Hierarchies (Organizations / Branches)
- **Decision**: Maintained the canonical flat restaurant tenant model (`/restaurants/{restaurantId}`) rather than introducing speculative multi-tier schemas (such as `organizations/{organizationId}/branches/{branchId}`).
- **Rationale**: Respects strict scope boundaries, satisfies all multi-outlet discovery and switching requirements via existing ownership and membership models, and avoids unnecessary structural complexity.

---

## Milestone 6 Architectural Decisions

### 16. Three-Layer Role & Permission Defense
- **Decision**: Operational security for all 6 roles (`owner`, `manager`, `cashier`, `captain`, `kitchen`, `accountant`) is enforced at three distinct layers:
  1. **UI Layer (`isViewAllowed`)**: Conditionally renders navigation links and view containers, providing clear role-specific UI and fast client redirection for unauthorized navigation attempts.
  2. **Service / Business-Logic Layer (`enforcePermission`)**: Gating functions inside domain services (`orderService`, `paymentService`, `kotService`, `menuService`, `tableSessionService`, `tableService`, `auditService`) that check active restaurant membership and role prior to performing mutations or fetching restricted data.
  3. **Backend / Security Rules Layer (`firestore.rules`)**: Server-enforced, tamper-proof security rules that reject direct document create, read, update, or delete attempts from unauthenticated, inactive, or unauthorized roles regardless of client state.
- **Rationale**: UI hiding alone is never authorization. Service-level checks ensure safe client execution and provide readable errors, while Firestore security rules guarantee data safety against malicious or direct API tampering.

### 17. Role-Specific Read and Write Isolation
- **Decision**:
  - `payments` read access is restricted to `owner`, `manager`, `cashier`, and `accountant`, preventing unauthorized financial visibility on Kitchen or Captain devices.
  - `auditLogs` read access is restricted to `owner`, `manager`, and `accountant`, with client update and delete permanently blocked (`allow update, delete: if false`).
  - Order cancellation is restricted strictly to `owner` and `manager`, preventing unauthorized cashier or captain cancellations without manager escalation.
  - Category, menu item, and physical table definitions are restricted strictly to `owner` and `manager`.
- **Rationale**: Enforces least-privilege security principle across staff roles while preserving smooth operational workflows for high-frequency kitchen and captain operations.

### 18. Staff Invitation and Identity Decoupling
- **Decision**: Adding a staff member creates a pending invitation record (`status: 'pending_setup'`, `isActive: false`) with a single-use cryptographically secure invitation token, rather than creating or overwriting Firebase Auth users directly from the owner's session.
- **Rationale**: Prevents session hijacking, eliminates plaintext password handling, and preserves identity sovereignty: employees own their Firebase Auth credentials and claim their role assignment via authenticated invitation acceptance (`/accept-invitation`).

### 19. Authoritative Server-Side Dispatch Boundary & Audit Redaction
- **Decision**: All invitation email dispatch requests via `/api/send-invitation-email` must authenticate using Firebase Auth `Bearer` ID tokens. The backend resolves `restaurantName` and staff `role` directly from authoritative Firestore documents, ignoring client-supplied metadata. In addition, raw invitation tokens are never written to audit logs; only truncated SHA-256 fingerprints are logged.
- **Rationale**: Eliminates phishing vectors where attackers pass forged restaurant names or spoofed roles to external recipients, prevents privilege escalation, and ensures audit trails remain secure and tamper-evident.

