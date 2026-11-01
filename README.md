<div align="center">

  <h1>SAPREMO WAREHOUSE</h1>
  <h3>Offline-First Warehouse Management System & High-Fidelity STOMP/REST Telemetry Gateway</h3>

  <p>
    <img src="https://img.shields.io/badge/React-18.2-61DAFB?style=flat-square&logo=react&logoColor=white&labelColor=0a0a0f" alt="React 18" />
    <img src="https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0a0a0f" alt="TypeScript 5.4" />
    <img src="https://img.shields.io/badge/Tauri-2.0_Hybrid-FFC131?style=flat-square&logo=tauri&logoColor=white&labelColor=0a0a0f" alt="Tauri 2.0" />
    <img src="https://img.shields.io/badge/Dexie.js-IndexedDB_Outbox-FF5722?style=flat-square&logo=databricks&logoColor=white&labelColor=0a0a0f" alt="Dexie.js" />
    <img src="https://img.shields.io/badge/TanStack_Query-v5-FF4154?style=flat-square&logo=reactquery&logoColor=white&labelColor=0a0a0f" alt="TanStack Query" />
    <img src="https://img.shields.io/badge/STOMP_1.2-WebSockets-00C7B7?style=flat-square&logo=socketdotio&logoColor=white&labelColor=0a0a0f" alt="STOMP WebSockets" />
    <img src="https://img.shields.io/badge/Turborepo-Monorepo-EF4444?style=flat-square&logo=turborepo&logoColor=white&labelColor=0a0a0f" alt="Turborepo" />
    <img src="https://img.shields.io/badge/Vitest-Verified-6E9F18?style=flat-square&logo=vitest&logoColor=white&labelColor=0a0a0f" alt="Vitest" />
    <img src="https://img.shields.io/badge/License-MIT-F59E0B?style=flat-square&labelColor=0a0a0f" alt="License: MIT" />
  </p>

  <p>
    <b>Fault-tolerant, offline-first cold-chain Warehouse Management System (WMS) featuring an IndexedDB transactional outbox, Last-Write-Wins (LWW) conflict resolution, hardware HID barcode scanner interception, dual Web/Tauri runtime adaptation, and a standalone STOMP/REST chaos-enabled mock gateway.</b>
  </p>

  <p>
    <a href="#authorship--origin-disclaimer">Disclaimer</a> •
    <a href="#overview">Overview</a> •
    <a href="#system-architecture">Architecture</a> •
    <a href="#mathematical--algorithmic-foundations">Mathematical Foundations</a> •
    <a href="#gateway-api--stomp-specification">API & STOMP Spec</a> •
    <a href="#project-structure">Structure</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#testing--verification">Testing</a>
  </p>

</div>

---

## Authorship & Origin Disclaimer

> **IMPORTANT — COMMERCIAL EXTRACTION & STANDALONE HARNESS DISCLOSURE:**
>
> * **EN:** The client-side **Warehouse Management System (`apps/client`)** — including its offline-first IndexedDB (`Dexie.js`) transactional outbox, optimistic UI state machine (`TanStack Query` + `Zustand`), hardware HID barcode scanner parser, Web Worker report engines, and Tauri/Web hybrid architecture — was architected and engineered by **Adilet Batyrov** as part of a commercial enterprise WMS & Cold-Chain Distribution platform. To comply with strict **Zero-Leakage Policy** standards, all proprietary corporate endpoints, credentials, legal entity metadata, and sibling services have been sanitized. Because the production Spring Boot / PostgreSQL backend remains private, the **High-Fidelity Mock Gateway (`apps/mock-server`)** — complete with 520+ pre-seeded SKUs, `Aisle/Rack/Shelf/Bin` topology, STOMP 1.2 WebSocket broker, and Network Degradation Simulator — was written **from scratch** specifically for this repository to enable one-click, self-contained public evaluation.
> * **RU:** Архитектура клиентского модуля **`Warehouse` (`apps/client`)** — включая офлайн-ядро синхронизации на базе IndexedDB (`Dexie.js`), очередь мутаций `outbox_mutations`, разрешение конфликтов LWW, перехватчик аппаратных HID-сканеров штрихкодов и гибридный слой Tauri/Web — разработана в рамках коммерческой промышленной WMS-системы. В соответствии с политикой **Zero-Leakage**, весь код полностью очищен от корпоративных секретов и внутренних URL. Поскольку оригинальный бэкенд на Spring Boot и PostgreSQL является закрытым, серверный **Mock-Gateway (`apps/mock-server`)** со 520+ SKU, адресным хранением, брокером STOMP 1.2 и симулятором деградации сети написан **с нуля** специально для изолированной публичной демонстрации.

---

## Overview

Industrial cold-storage warehouses (`-24°C` to `-14°C`) present hostile RF environments: thick reinforced concrete walls,insulated metal racking, and mobile refrigeration units cause frequent Wi-Fi drops and high packet jitter. Traditional cloud-dependent SPA terminals freeze or lose scan events during network blackouts.

**Sapremo Warehouse** solves this by treating the local browser/desktop IndexedDB (`WarehouseDB`) as the primary operational source of truth and synchronizing asynchronously with the backend gateway:

1. **Zero-Latency Optimistic Execution:** Every warehouse operation — goods reception from the factory, stock adjustment, pallet bin relocation, driver route order confirmation, modification, dispatch, return processing, and cashbox settlement — writes immediately to local IndexedDB tables and updates the React UI in `< 5ms`.
2. **Transactional Outbox (`outbox_mutations` & `syncQueue`):** Mutations executed while offline (or during HTTP `502/503/504` gateway degradation) are persisted in an ordered outbox queue with cryptographic UUID idempotency keys (`Idempotency-Key`) and 5-minute processing leases.
3. **Deterministic State Convergence (LWW & Version Vectors):** Upon network restoration or STOMP WebSocket push, local and remote states converge deterministically via **Last-Write-Wins (LWW)** timestamps and monotonic entity version vectors.
4. **Hardware HID Barcode Scanner Pipeline:** Captures high-velocity USB/Bluetooth laser and 2D imager keystroke bursts (`< 50ms` inter-keystroke interval), filters out human typing, and normalizes accidental Cyrillic OS keyboard layouts into valid GS1 `EAN-13` and `Code 128` strings without losing a single character.
5. **Unified Tauri / Web Native Facade:** Wraps all `@tauri-apps/*` native plugins (`plugin-http`, `plugin-dialog`, `plugin-fs`, IPC `core`) behind `nativeAdapter.ts` with automatic browser fallbacks (`window.fetch`, HTML5 `Blob` downloads), allowing identical execution via `npm run dev` in Chrome/Edge or as a compiled Tauri Desktop binary.

| Subsystem | Technology Stack | Operational Guarantee |
| :--- | :--- | :--- |
| **Client UI & State** | React 18, TypeScript 5.4, Ant Design 5, Zustand, TanStack Query v5 | Optimistic UI updates with automatic cache invalidation |
| **Offline Persistence** | Dexie.js 4.0 (`IndexedDB`), Workbox Service Worker | 9-version schema evolution, automated corruption recovery & audit log pruning |
| **Native Desktop / Web Layer** | Tauri 2.0 (`@tauri-apps/*`) + `nativeAdapter.ts` Facade | Zero-config fallback to Web Fetch & DOM Blob APIs in standalone browser mode |
| **Hardware Scanner Engine** | Custom Window Capture Hook (`useBarcodeScanner`) | `< 50ms` kinematic discriminator + Russian/QWERTY bijective layout normalizer |
| **Document & Report Engine** | Web Workers (`SheetJS` `.xlsx`), `@react-pdf/renderer`, Print Iframe | Non-blocking off-thread Excel generation and A4 waybill/invoice printing |
| **Standalone Mock Gateway** | Node.js 20, Express, TypeScript (`tsx`), `ws` | 520 SKUs, 180 storage bins, FEFO batches, movement ledger & idempotency store |
| **Real-Time Telemetry** | STOMP 1.2 + SockJS over WebSockets (`StompBroker`) | Live push on `/topic/inventory`, `/topic/alerts`, `/topic/orders`, `/topic/dispatch/created` |
| **Chaos Network Simulator** | `networkDegradationMiddleware` (`/api/chaos/config`) | Configurable `50–300ms` uniform latency jitter & probabilistic `503` packet drop rate |

---

## System Architecture

```text
+===================================================================================================+
|                        SAPREMO WAREHOUSE CLIENT (apps/client — Port 3000)                         |
|                                                                                                   |
|  +-----------------------------+   +------------------------------+   +------------------------+  |
|  | Hardware HID Barcode Scanner|   | React 18 Operational Views   |   | Off-Thread Web Workers |  |
|  |  - Keystroke Burst (< 50ms) |   |  - Dashboard & KPI Telemetry |   |  - SheetJS .xlsx Export|  |
|  |  - RU -> ASCII Normalizer   |   |  - Stock, Bins & Reception   |   |  - @react-pdf Invoices |  |
|  |  - Input Focus Guard        |   |  - Driver Orders & Cashbox   |   |  - A4 Waybill Printer  |  |
|  +--------------+--------------+   +--------------+---------------+   +-----------+------------+  |
|                 |                                 |                               |               |
|                 v                                 v                               v               |
|  +---------------------------------------------------------------------------------------------+  |
|  |                     Optimistic State & Conflict Resolution Layer                            |  |
|  |   TanStack Query v5 Cache  <--->  Zustand SyncStore  <--->  LWW & Version Vector Resolver   |  |
|  +------------------------------------------------+--------------------------------------------+  |
|                                                   |                                               |
|                                                   v                                               |
|  +---------------------------------------------------------------------------------------------+  |
|  |                         Dexie.js (IndexedDB v9 — WarehouseDB)                               |  |
|  |  [products] [stock] [orders] [receipts] [returns] [drivers] [transactions] [factoryOrders]  |  |
|  |  [outbox_mutations / syncQueue] (FIFO + Lease Lock)   [auditLogs]   [productRetries]        |  |
|  +------------------------------------------------+--------------------------------------------+  |
|                                                   |                                               |
|                                                   v                                               |
|  +---------------------------------------------------------------------------------------------+  |
|  |                    Unified Native Adapter Facade (src/adapters/nativeAdapter.ts)            |  |
|  |     Tauri Desktop Mode: @tauri-apps/plugin-{http,dialog,fs}  |  Web SPA Mode: fetch + Blob  |  |
|  +-----------------------------------+------------------------------------+--------------------+  |
+======================================|====================================|=======================+
                                       | HTTP / REST                        | WebSocket / SockJS
                                       | (Idempotency-Key)                  | (STOMP 1.2 Frames)
                                       v                                    v
+===================================================================================================+
|                    HIGH-FIDELITY MOCK GATEWAY (apps/mock-server — Port 3001)                      |
|                                                                                                   |
|  +---------------------------------------------------------------------------------------------+  |
|  |              Chaos Network Degradation Simulator (networkDegradationMiddleware)             |  |
|  |       Latency Jitter: U(50ms, 300ms)   |   Packet Drop / Flapping: Bernoulli(dropRate)      |  |
|  +-----------------------------------+------------------------------------+--------------------+  |
|                                      |                                    |                       |
|                                      v                                    v                       |
|  +--------------------------------------------------+  +---------------------------------------+  |
|  | Express REST Controllers                         |  | STOMP 1.2 + SockJS Broker (ws)        |  |
|  |  - /api/warehouse/{inventory,cashbox,dashboard}  |  |  - /topic/inventory                   |  |
|  |  - /api/warehouse/{bins,batches,movements}       |  |  - /topic/alerts                      |  |
|  |  - /api/drivers/{orders,debts,payments,returns}  |  |  - /topic/inventory/low-stock         |  |
|  |  - /api/factory/{products,warehouse-orders,auth} |  |  - /topic/orders & /topic/orders/new  |  |
|  +-------------------------+------------------------+  +-------------------+-------------------+  |
|                            |                                               |                      |
|                            +-----------------------+-----------------------+                      |
|                                                    v                                              |
|  +---------------------------------------------------------------------------------------------+  |
|  |                     In-Memory Warehouse Store (InMemoryWarehouseStore)                      |  |
|  |   520 SKUs (EAN-13 / Code 128) | 180 Storage Bins (Aisle/Rack/Shelf/Bin) | 520 FEFO Lots    |  |
|  |   Immutable Movement Ledger    | 16 Drivers & Debt Accounts              | Idempotency Map  |  |
|  +---------------------------------------------------------------------------------------------+  |
+===================================================================================================+
```

---

## Mathematical & Algorithmic Foundations

### 1. Deterministic Offline Convergence: Last-Write-Wins (LWW) & Entity Version Vectors

Let each replicated warehouse entity $e \in \mathcal{E}$ (such as an `Order` or `SkuRecord`) be represented on node $k \in \{\text{local}, \text{remote}\}$ as a state tuple:

$$S_k(e) = \left(v_k, \tau_k, P_k\right)$$

where:
- $v_k \in \mathbb{N}^+$ is the monotonic entity version counter incremented on each state transition.
- $\tau_k \in \mathbb{R}_{\ge 0}$ is the normalized UTC epoch timestamp in milliseconds, defined on the client as $\tau_{\text{local}} = \max(\text{localUpdatedAt}, \text{updatedAt}, \text{date})$ and on the gateway as $\tau_{\text{remote}} = \max(\text{updatedAt}, \text{date})$.
- $P_k$ is the domain payload dictionary.

Let $\mathcal{Q}_{\text{outbox}}$ denote the set of unacknowledged mutations in IndexedDB (`outbox_mutations` / `syncQueue`), and define the indicator predicate:

$$\mathbb{I}_{\text{locked}}(e) = \begin{cases} 1, & \exists m \in \mathcal{Q}_{\text{outbox}} : \text{target}(m) = \text{id}(e) \land \text{status}(m) \in \{\text{pending}, \text{processing}\} \\ 0, & \text{otherwise} \end{cases}$$

When reconciling $S_{\text{local}}(e)$ against $S_{\text{remote}}(e)$ in [`conflictResolution.ts`](file:///c:/Users/adile/Downloads/SmartFactorySystem-main/apps/client/src/utils/conflictResolution.ts), the deterministic merge operator $\Psi\left(S_{\text{local}}, S_{\text{remote}}\right)$ evaluates:

$$\Psi\left(S_{\text{local}}, S_{\text{remote}}\right) = \begin{cases} \left(\max(v_L, v_R), \tau_L, P_R \oplus P_L\right), & \text{if } \mathbb{I}_{\text{locked}}(e) = 1 \quad \text{(Pending Outbox Lock)} \\[6pt] \left(\max(v_L, v_R), \tau_L, P_R \oplus P_L\right), & \text{if } \mathbb{I}_{\text{locked}}(e) = 0 \land \tau_L > \tau_R \quad \text{(LWW Local Winner)} \\[6pt] \left(\max(v_L, v_R), \tau_R, P_L \oplus P_R\right), & \text{if } \mathbb{I}_{\text{locked}}(e) = 0 \land \tau_R > \tau_L \quad \text{(LWW Remote Winner)} \\[6pt] \left(\max(v_L, v_R), \tau_L, \arg\max_{P \in \{P_L, P_R\}} v(P)\right), & \text{if } \mathbb{I}_{\text{locked}}(e) = 0 \land \tau_L = \tau_R \land v_L \neq v_R \quad \text{(Version Vector)} \\[6pt] \left(v_R, \tau_R, P_L \oplus P_R\right), & \text{otherwise} \quad \text{(Authoritative Server Tie-Breaker)} \end{cases}$$

where $A \oplus B$ denotes shallow field-level right-biased record merge. This guarantees **strong eventual consistency (SEC)**: once $\mathcal{Q}_{\text{outbox}} = \emptyset$, all replicas converge to an identical state regardless of network partition duration.

---

### 2. Hardware HID Barcode Scanner Kinematics & Layout Normalization

Industrial USB/Bluetooth barcode scanners operate in HID Keyboard Emulation mode, injecting sequential `keydown` events into the DOM window followed by an `Enter` (`\r`) terminator. To distinguish hardware scanner bursts from human operators typing in search fields without requiring dedicated focus inputs, [`useBarcodeScanner.ts`](file:///c:/Users/adile/Downloads/SmartFactorySystem-main/apps/client/src/hooks/useBarcodeScanner.ts) implements a temporal finite state automaton.

Let $\left(k_1, t_1\right), \left(k_2, t_2\right), \dots, \left(k_n, t_n\right)$ be the stream of incoming printable keystrokes with timestamps $t_i \in \mathbb{R}^+$. The inter-arrival interval is:

$$\Delta t_i = t_i - t_{i-1}$$

Hardware HID scanners emit characters at a constant clock rate with $\Delta t_{\text{scanner}} \in [4\text{ ms}, 25\text{ ms}]$, whereas human typists exhibit $\Delta t_{\text{human}} \sim \mathcal{N}(\mu \approx 140\text{ ms}, \sigma^2 \approx 35^2\text{ ms}^2)$. The accumulator buffer $B_i$ evolves according to the recurrence:

$$B_i = \begin{cases} B_{i-1} \mathbin{\Vert} \Phi(k_i), & \text{if } \Delta t_i \le \tau_{\max} \\ \Phi(k_i), & \text{if } \Delta t_i > \tau_{\max} \end{cases}$$

where $\tau_{\max} = 50\text{ ms}$ is the kinematic cutoff threshold, and $\Phi: \Sigma_{\text{OS}} \to \Sigma_{\text{ASCII}}$ is the bijective keyboard layout normalization map (`normalizeBarcodeLayout`) that projects Cyrillic keystrokes emitted when the host OS is set to a Russian keyboard layout back onto their physical US-QWERTY scan codes (e.g., $\Phi(\text{'С'}) = \text{'C'}$, $\Phi(\text{'Ц'}) = \text{'W'}$, $\Phi(\text{'й'}) = \text{'q'}$). Upon receiving $k_{\text{term}} = \text{'Enter'}$ at time $t_{\text{term}}$, the scan is accepted if and only if:

$$\left(t_{\text{term}} - t_n \le \tau_{\max}\right) \land \left(|B_n| \ge L_{\min}\right)$$

where $L_{\min} = 4$.

---

### 3. GS1 EAN-13 Modulo-10 Checksum & FEFO Batch Allocation

Every SKU generated in [`seed.ts`](file:///c:/Users/adile/Downloads/SmartFactorySystem-main/apps/mock-server/src/data/seed.ts) carries a mathematically valid 13-digit **GS1 EAN-13** barcode $D = d_1 d_2 \dots d_{12} c$. Given the 12-digit payload prefix $d_1 \dots d_{12}$, the 13th check digit $c \in \{0, \dots, 9\}$ satisfies the linear congruence:

$$\sum_{i=1}^{12} w_i d_i + c \equiv 0 \pmod{10}, \quad \text{where } w_i = \begin{cases} 1, & \text{if } i \equiv 1 \pmod 2 \\ 3, & \text{if } i \equiv 0 \pmod 2 \end{cases}$$

Solving explicitly for $c$:

$$c = \left(10 - \left(\sum_{i=1}^{12} w_i \cdot d_i \bmod 10\right)\right) \bmod 10$$

Storage bins are organized hierarchically across three thermal zones (`DEEP_FREEZE_24C` at $-24^\circ\text{C}$, `COLD_STORAGE_18C` at $-18^\circ\text{C}$, and `BUFFER_DISPATCH_14C` at $-14^\circ\text{C}$) using coordinates:

$$\text{BinCode} = \texttt{A}\{\text{aisle}\}\text{-}\texttt{R}\{\text{rack}\}\text{-}\texttt{S}\{\text{shelf}\}\text{-}\texttt{B}\{\text{bin}\}, \quad \text{e.g., } \texttt{A01-R02-S01-B03}$$

Batch allocation follows strict **FEFO (First-Expired, First-Out)** ordering over active lots $\mathcal{B}(\text{sku})$:

$$\pi_{\text{FEFO}}\left(\mathcal{B}\right) = \operatorname{sort}_{\ell \in \mathcal{B}}\left(\tau_{\text{expiry}}(\ell) \uparrow, \; \tau_{\text{manufactured}}(\ell) \uparrow\right)$$

---

### 4. Chaos Network Degradation Model

To empirically validate the client's offline mutation queue (`outbox_mutations`), [`networkSimulator.ts`](file:///c:/Users/adile/Downloads/SmartFactorySystem-main/apps/mock-server/src/middleware/networkSimulator.ts) intercepts incoming HTTP requests and applies two stochastic processes:

1. **Uniform Latency Jitter:** Each request is delayed by a random variable:
   $$L \sim \mathcal{U}\left(t_{\min}, t_{\max}\right), \quad \text{default } [50\text{ ms}, 300\text{ ms}]$$
2. **Bernoulli Packet Loss & Square-Wave Flapping:** Let $p_{\text{drop}} \in [0, 1]$ be the configured drop probability. When `flappingMode` is active with period $2 T_{\text{flap}}$, the effective drop probability oscillates as:
   $$p_{\text{eff}}(t) = \begin{cases} p_{\text{drop}}, & \text{if } \left\lfloor \frac{t}{T_{\text{flap}}} \right\rfloor \equiv 0 \pmod 2 \\ \max\left(p_{\text{drop}}, 0.85\right), & \text{if } \left\lfloor \frac{t}{T_{\text{flap}}} \right\rfloor \equiv 1 \pmod 2 \end{cases}$$
   A Bernoulli trial $X \sim \text{Bernoulli}\left(p_{\text{eff}}(t)\right)$ is drawn; if $X = 1$, the gateway immediately aborts with `HTTP 503 Service Unavailable` (`NETWORK_FLAP_SIMULATED`), triggering the client's Axios offline interceptor and queuing the mutation in IndexedDB.

---

## Gateway API & STOMP Specification

### REST API Endpoints (`http://localhost:3001`)

| Domain | Method | Endpoint | Description |
| :--- | :---: | :--- | :--- |
| **Auth** | `POST` | `/api/factory/auth/login` | Issues 3-part base64url JWT (`access`, `refresh`) & warehouse operator profile |
| **Auth** | `POST` | `/api/factory/auth/refresh` | Rotates access JWT token for uninterrupted background sync |
| **Catalog** | `GET` | `/api/factory/products/` | Returns 520+ SKUs; supports `?page=`, `?page_size=`, `?search=`, `?barcode=` |
| **Catalog** | `POST` | `/api/factory/products/` | Creates a new SKU with auto-generated `EAN-13` and `Code 128` barcodes |
| **Catalog** | `PATCH` | `/api/factory/products/:id/` | Updates SKU metadata, box quantity, batch number, or price (increments `version`) |
| **Inventory** | `GET` | `/api/warehouse/inventory` | Returns real-time stock balances, box/piece counts, and `Aisle/Rack/Shelf/Bin` locations |
| **Inventory** | `POST` | `/api/warehouse/inventory/reception` | Processes goods reception, increments stock, logs `RECEPTION`, broadcasts STOMP update |
| **Inventory** | `POST` | `/api/warehouse/inventory/adjust` | Adjusts stock balance, logs `ADJUSTMENT`, triggers `/topic/alerts` if below threshold |
| **Inventory** | `POST` | `/api/warehouse/inventory/move-pallet` | Relocates pallet boxes between `Aisle/Rack/Shelf/Bin` storage cells (`PALLET_MOVE`) |
| **Topology** | `GET` | `/api/warehouse/bins` | Lists all 180 storage cells across `-24°C`, `-18°C`, and `-14°C` thermal zones |
| **Batches** | `GET` | `/api/warehouse/batches` | Lists all 520 Lot/Batch records ordered by **FEFO** (`expirationDate` ascending) |
| **Ledger** | `GET` | `/api/warehouse/movements` | Returns immutable warehouse movement journal (`RECEPTION`, `DISPATCH`, `PALLET_MOVE`) |
| **Orders** | `GET` | `/api/drivers/orders` | Paginated list of driver route orders (`PENDING`, `CONFIRMED`, `MODIFIED`, `DISPATCHED`) |
| **Orders** | `POST` | `/api/drivers/orders/:id/confirm` | Confirms driver order (`Idempotency-Key` protected) & broadcasts `/topic/orders/status` |
| **Orders** | `POST` | `/api/drivers/orders/:id/modify` | Modifies order line quantities/amounts and increments entity `version` |
| **Orders** | `POST` | `/api/drivers/orders/:id/dispatch` | Dispatches order, deducts SKU stock, increments driver debt, emits `/topic/dispatch/created` |
| **Drivers** | `GET` | `/api/drivers` & `/api/drivers/debts` | Lists 16 route drivers and real-time accounts receivable balances |
| **Returns** | `POST` | `/api/drivers/returns` | Processes driver/factory product returns, restores stock, and credits driver debt |
| **Cashbox** | `POST` | `/api/warehouse/cashbox/driver-payment` | Records cash/transfer payment from driver and updates warehouse cashbox balance |
| **Cashbox** | `POST` | `/api/warehouse/cashbox/factory-payment` | Records settlement payment to factory and reduces factory payable balance |
| **Chaos** | `GET/POST` | `/api/chaos/config` | Reads or mutates live network latency (`minLatencyMs`, `maxLatencyMs`) & `dropRate` |

### STOMP 1.2 / SockJS WebSocket Topics (`/api/warehouse/ws`)

| STOMP Destination Topic | Payload Schema | Client Reaction |
| :--- | :--- | :--- |
| `/topic/inventory` | `{ productId, barcode, quantity, binCode, version, updatedAt }` | Updates Dexie `db.stock` & `db.products` in place; invalidates TanStack Query `['stock']` |
| `/topic/alerts` | `{ productId, barcode, productName, currentQuantity, threshold }` | Displays Ant Design low-stock warning notification with SKU name and barcode |
| `/topic/inventory/low-stock` | `{ productId, barcode, currentQuantity, threshold }` | Triggers critical stock depletion alert banner |
| `/topic/orders` & `/topic/orders/new` | `OrderRecord` | Triggers background `pullSync()`, invalidates `['orders']`, shows toast with driver name |
| `/topic/dispatch/created` | `OrderRecord` | Refreshes dashboard KPIs and stock ledger after pallet dispatch |
| `/topic/dashboard/update` | `{ timestamp }` | Invalidates `['dashboard-stats']` and reconciles financial counters |

---

## Project Structure

```text
sapremo-warehouse/
├── apps/
│   ├── client/                                # Isolated Warehouse Frontend (React 18 + Vite + Tauri 2)
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   └── nativeAdapter.ts           # Unified Tauri / Web Native Adapter Facade
│   │   │   ├── api/
│   │   │   │   ├── client.ts                  # Axios clients, JWT refresh queue & offline detector
│   │   │   │   ├── sync.ts                    # Full pull-sync & LWW reconciliation pipeline
│   │   │   │   └── mappers/                   # Domain DTO mappers
│   │   │   ├── db/
│   │   │   │   ├── schema.ts                  # Dexie.js v9 schema (outbox_mutations, stock, products...)
│   │   │   │   ├── repository.ts              # Local IndexedDB repository methods
│   │   │   │   └── recovery.ts                # Automated IndexedDB corruption disaster recovery
│   │   │   ├── store/
│   │   │   │   ├── syncStore.ts               # Outbox mutation processor, lease recovery & retry backoff
│   │   │   │   └── authStore.ts               # Persisted JWT session store
│   │   │   ├── hooks/
│   │   │   │   ├── useBarcodeScanner.ts       # Hardware HID scanner parser, debouncer & RU->ASCII mapper
│   │   │   │   ├── useWebSocket.ts            # STOMP 1.2 + SockJS real-time telemetry subscriber
│   │   │   │   └── useBackgroundSync.ts       # Periodic & event-driven synchronization hook
│   │   │   ├── utils/
│   │   │   │   ├── conflictResolution.ts      # LWW & Entity Version Vector conflict resolver
│   │   │   │   ├── exportExcel.ts             # Web Worker SheetJS .xlsx exporter via nativeAdapter
│   │   │   │   └── pdfGenerator.ts            # @react-pdf invoice generator via nativeAdapter
│   │   │   ├── features/                      # Modular domain pages (Stock, Orders, Receipts, Cashbox...)
│   │   │   └── __tests__/                     # Vitest unit & integration suites
│   │   ├── src-tauri/                         # Tauri 2.0 Rust desktop shell configuration
│   │   ├── Dockerfile                         # Multi-stage Node 20 -> Nginx 1.27 container build
│   │   └── vite.config.ts                     # Vite bundler + PWA manifest + local gateway proxy
│   │
│   └── mock-server/                           # Standalone High-Fidelity Mock Gateway (Node.js + TS + ws)
│       ├── src/
│       │   ├── data/
│       │   │   └── seed.ts                    # Deterministic generator: 520 SKUs, EAN-13, Code 128, Bins
│       │   ├── middleware/
│       │   │   └── networkSimulator.ts        # Configurable latency (50-300ms) & packet drop chaos filter
│       │   ├── ws/
│       │   │   └── stompBroker.ts             # Custom STOMP 1.2 + SockJS over WebSockets message broker
│       │   ├── index.ts                       # Express REST API server & real-time event publishers
│       │   └── __tests__/
│       │       └── gateway.test.ts            # Seed, EAN-13 checksum & Chaos middleware tests
│       └── Dockerfile                         # Node 20 Alpine gateway container build
│
├── docker-compose.yml                         # One-command full-stack container orchestration
├── turbo.json                                 # Turborepo task pipeline configuration
└── package.json                               # Monorepo workspace root (npm run dev / test / build)
```

---

## Getting Started

### Prerequisites

- **Node.js** `>= 20.0.0` and **npm** `>= 10.0.0`
- *(Optional)* **Docker** & **Docker Compose** for containerized execution
- *(Optional)* **Rust Toolchain** (`cargo`) if compiling the native Tauri desktop binary

### Option 1: One-Click Local Development (Turborepo)

Clone the repository, install workspace dependencies, and launch both the **Warehouse Client (`:3000`)** and **Mock Gateway (`:3001`)** in parallel with a single command:

```bash
git clone https://github.com/adiletbtrv/sapremo-warehouse.git
cd sapremo-warehouse

# Install dependencies across all workspaces (apps/client & apps/mock-server)
npm install

# Launch Frontend (http://localhost:3000) and Mock Gateway (http://localhost:3001) concurrently
npm run dev
```

Open **`http://localhost:3000`** in your browser. The login screen is pre-populated with demo operator credentials (`warehouse_admin` / `password123`) — click **«Войти»** to enter the terminal immediately, or click **`[DEV] Войти без сервера (Offline Mode)`** to test pure offline operation.

### Option 2: One-Command Docker Compose Deployment

Build and start the production Nginx SPA container and the Mock Gateway container with healthcheck orchestration:

```bash
docker compose up --build
```

- **Warehouse Web UI:** `http://localhost:3000`
- **Mock Gateway Health & Telemetry:** `http://localhost:3001/api/health`

### Demonstrating Offline Queue & Chaos Network Degradation

While the app is running, you can dynamically inject packet loss or high latency into the Mock Gateway to watch the client automatically switch to Offline Mode, buffer mutations in IndexedDB (`outbox_mutations`), and flush them upon recovery:

```bash
# 1. Simulate 60% packet drop rate and 150-400ms latency jitter
curl -X POST http://localhost:3001/api/chaos/config \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "minLatencyMs": 150, "maxLatencyMs": 400, "dropRate": 0.6}'

# 2. Restore normal network conditions (0% drop rate, 50-150ms latency)
curl -X POST http://localhost:3001/api/chaos/config \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "minLatencyMs": 50, "maxLatencyMs": 150, "dropRate": 0}'
```

---

## Testing & Verification

The monorepo includes automated **Vitest** suites verifying both the client offline-first engines and the mock gateway:

1. **Offline Synchronization Outbox & LWW Conflict Resolution (`apps/client/src/__tests__/sync.test.ts`):**
   - Verifies mutation accumulation in `outbox_mutations` and `syncQueue` while `isOnline === false` with zero network leakage.
   - Verifies ordered FIFO flushing upon `setOnlineStatus(true)` with `Idempotency-Key` headers.
   - Verifies deduplication of identical pending mutations.
   - Verifies **Last-Write-Wins (LWW)** timestamp comparisons, pending outbox locks, and **Entity Version Vector** tie-breaking.
2. **Hardware HID Barcode Scanner & Layout Normalizer (`apps/client/src/__tests__/auditAndScanner.test.ts`):**
   - Simulates high-velocity `8ms–10ms` hardware keystroke bursts for `EAN-13` (`4870001000013`) and `Code 128` (`C128-W01-SKU0042-B007`) barcodes, asserting zero character loss.
   - Simulates slow human typing (`140ms` per key) and verifies debounce buffer reset.
   - Verifies real-time Russian/Cyrillic keyboard layout normalization (`С128-Ц01` $\to$ `C128-W01`).
3. **Mock Gateway Seed & GS1 EAN-13 Checksum Verification (`apps/mock-server/src/__tests__/gateway.test.ts`):**
   - Verifies all 520 seeded SKUs carry valid 13-digit GS1 Modulo-10 check digits, `Aisle/Rack/Shelf/Bin` coordinates, and FEFO batch records.

```bash
# Run all unit and integration test suites across the monorepo
npm test

# Run strict TypeScript type-checking across all workspaces
npm run type-check

# Build production bundles for both client and mock-server
npm run build
```

---

## License

This project is licensed under the **MIT License**. Engineered by **Adilet Batyrov**.
