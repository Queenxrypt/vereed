# Vereed — Agent Source of Truth

This file is the persistent project brief and working rules for Vereed. Treat it as the source of truth for the entire build.

Do not invent missing protocol details. Do not start implementing the application until the user explicitly asks. Do not create extra files, features, or architecture beyond this brief.

---

## 1. Project identity

- **Project name:** Vereed
- **Track:** DePIN
- **Hackathon:** BUIDL CTC 2026 Fall by Creditcoin / Credit Labs
- **Category:** Cross-chain settlement infrastructure
- **One-line description:** Vereed is settlement infrastructure for DePIN networks that verifies completed work on a source chain through Attestcoin before releasing operator payments on Creditcoin.
- **Core promise:** Verify the work. Release the payment.
- **Demo line:** The frontend doesn't tell Vereed what to pay. The verified job does.

Vereed is a **settlement infrastructure reference implementation**, not a full DePIN ecosystem.

---

## 2. Product purpose

DePIN networks coordinate infrastructure operators who perform measurable work (bandwidth, storage, sensors, compute, maintenance, delivery, or other units of work). The network must answer:

> Did this operator actually complete the work they were supposed to complete?

If yes, the operator should get paid.

Vereed solves this specific infrastructure problem:

1. Work happens on one chain or system; payment may happen elsewhere.
2. The payment system needs trustworthy evidence that the work happened.
3. The frontend must not be trusted to tell the payment contract how much to pay.
4. The same completed job must not be paid twice.
5. A new or small DePIN network should not have to build custom cross-chain verification and settlement from scratch.

Vereed is **not** a generic bridge, credit-history product, invoice-financing app, or escrow marketplace. It authorizes DePIN operator payouts from verified work events.

---

## 3. Target customer

Primary audience:

> New and small DePIN networks that need cross-chain settlement but don't want to build their own payout and verification infrastructure.

Positioning rules:

- Do **not** pitch Vereed as infrastructure that established networks (e.g. Helium) are expected to migrate to.
- Do **not** pretend Vereed already has DePIN customers.
- Frame Vereed as a **reference implementation** showing how a new DePIN network could use Creditcoin + Attestcoin for verified settlement.

Story:

> A new DePIN network can record completed work on its existing chain, use Attestcoin to prove that work happened, and use Creditcoin as the settlement layer.

---

## 4. Core architecture

MVP architecture (this is the entire MVP):

| Component | Chain / layer | Responsibility |
| --- | --- | --- |
| `MockDePINJobRegistry` | Ethereum Sepolia | Records completed work and emits job events |
| Attestcoin | Creditcoin infrastructure | Attests to source-chain state |
| `SettlementVault` | Creditcoin CC3 testnet | Verifies proof and executes settlement |
| Frontend | Web | Displays and initiates the workflow (after protocol works) |

Conceptual roles:

- **Attestcoin** = "Did this source-chain event actually happen?"
- **SettlementVault** = "Given that verified event, should we pay?"
- **Creditcoin** = "Execute the settlement."

Attestcoin is the **verification mechanism**, not the payment mechanism. Creditcoin is the settlement environment.

Intended flow:

```
SOURCE CHAIN — Ethereum Sepolia
  MockDePINJobRegistry
  JobCompleted(...)
        ↓ source-chain state
  Attestcoin attestation
        ↓ cryptographic proof
CREDITCOIN CC3
  SettlementVault
    verify proof
    decode job
    check replay
    determine reward from attested data
    release payment
        ↓
  Operator
```

Do not add extra contracts, chains, backends, tokens, or panels to this architecture unless the user explicitly approves.

---

## 5. `MockDePINJobRegistry`

**Location:** Ethereum Sepolia

This is the source-chain component of a **hypothetical** DePIN network. It does not need real hardware. It exists to demonstrate what a real DePIN network could do: record completed work on-chain.

Illustrative job (example only, not a locked schema):

- Job ID: `1001`
- Operator: `0xABC...`
- Units completed: `25`
- Reward: `5 CTC`
- Timestamp: `...`

The contract emits something like:

```
JobCompleted(jobId, operator, unitsCompleted, reward, timestamp)
```

**Requires verification before finalizing:** the exact event structure, field types, and how source-chain event data can be decoded and verified through the current Attestcoin custom-contract flow. Do not lock the event ABI until that is confirmed from current official Attestcoin documentation/examples.

The frontend does **not** determine the reward. The reward is part of the source-chain event.

---

## 6. `SettlementVault`

**Location:** Creditcoin CC3 testnet

This is the heart of Vereed. It receives the Attestcoin proof and uses verified source-chain information to decide whether a completed job should be settled.

Conceptual steps:

1. Receive proof
2. Verify source-chain data
3. Decode `JobCompleted`
4. Check the job hasn't already been claimed
5. Validate settlement conditions
6. Pay the operator
7. Mark the job as claimed

Replay protection is required, conceptually like:

```solidity
mapping(bytes32 => bool) claimedJobs;
```

**Requires verification before choosing the identifier:** the exact claimed-job key. It could be derived from source chain, contract address, job ID, transaction/event identity, or another canonical identifier available in the current Attestcoin proof. Do not arbitrarily choose this before understanding the proof data the current implementation exposes.

---

## 7. Sepolia, Attestcoin, and Creditcoin CC3 roles

- **Ethereum Sepolia:** source chain. `MockDePINJobRegistry` records completed work and emits `JobCompleted`.
- **Attestcoin:** verifies/attests that the source-chain state/event actually happened, then a cryptographic proof is generated. It is not the payout engine.
- **Creditcoin CC3 testnet:** settlement environment. `SettlementVault` verifies the proof, extracts attested job data, enforces replay protection, and pays the operator.

Do **not** guess or hardcode:

- Attestcoin contract addresses
- chain IDs / chain keys
- SDK versions
- proof formats
- RPC endpoints
- verification interfaces
- deprecated USC / old bridge architecture

All of the above **require verification** from the current official Attestcoin implementation, docs, and examples.

---

## 8. End-to-end protocol flow

```
DePIN work completed
        ↓
JobCompleted event on Sepolia
        ↓
Attestcoin attests to the source-chain state
        ↓
Proof generated
        ↓
Proof submitted to Creditcoin
        ↓
SettlementVault verifies the attested data
        ↓
Verified job + verified reward
        ↓
Operator gets paid
        ↓
Replay attempt for the same job reverts
```

Demo journey (illustrative Job #1001):

1. Operator completes a job; source-chain contract records job, operator, units, reward.
2. Source contract emits `JobCompleted`.
3. Attestcoin attests to the relevant Sepolia state.
4. A proof is generated.
5. The proof is submitted to Creditcoin.
6. `SettlementVault` verifies it.
7. The contract extracts verified `jobId`, `operator`, and `reward`.
8. The operator receives the payment.
9. Someone tries to settle the same job again.
10. The contract rejects it because the job is already claimed.

The source-chain event is the source of truth. The payment is not based on what the frontend says happened.

---

## 9. Payout trust model

**Hard rule:** the payout amount must come from the attested `JobCompleted` data.

It must **not** come from:

- frontend input
- user-supplied transaction parameters
- a dashboard value

Intended model:

```
Sepolia JobCompleted(jobId, operator, unitsCompleted, reward)
        ↓
Attestcoin proves the source-chain state
        ↓
Creditcoin verifies the proof
        ↓
SettlementVault extracts operator, reward, jobId
        ↓
SettlementVault pays `reward` to `operator`
```

If the frontend is changed to display `100 CTC`, the settlement contract must still only be capable of paying the verified amount.

Optional (cut if it adds complexity or depends on awkward Attestcoin decoding): reject/ignore a settlement request that supplies a different operator or payout than the attested event. Replay protection and verified payout are more important than parameter-mismatch theatrics.

---

## 10. Replay protection

A completed job may be settled only once.

First attempt: valid proof → vault pays → job marked claimed.

Second attempt with the same job and a valid proof: already claimed → **REVERT**.

The demo must show this, not only the happy path. Exact revert reason / identifier **requires verification** during implementation; do not invent a claimed-job key before the proof payload is understood.

---

## 11. Settlement rules

Minimum `SettlementVault` rules:

1. The proof must be valid.
2. The verified source data must correspond to a legitimate `JobCompleted` event.
3. The operator receiving payment must come from the verified event.
4. The reward must come from the verified event.
5. The same job cannot be settled twice.
6. The settlement contract must have enough funds to make the payment.

Potential additional validation (add only if technically necessary and demonstrably useful):

- expected source contract address
- expected source chain
- expected event type
- valid job identifier
- valid operator address
- reward constraints

Do not assume arbitrary event logs can automatically be decoded from an Attestcoin proof. Confirm how the current implementation exposes source-chain transaction/event data to Solidity.

---

## 12. Frontend trust model

The frontend comes **after** the protocol works. Do not build a five-panel UI before a real Sepolia → Attestcoin → proof → CC3 → settlement flow succeeds with real transactions.

The frontend is for:

- initiating a job
- displaying verified information
- requesting settlement
- showing transaction status
- displaying explorer links
- demonstrating replay rejection

The frontend is **not trusted** to establish:

- whether a job happened
- who completed it
- how many units were completed
- how much the operator should receive

Those facts originate from the source-chain contract and become trustworthy for settlement only after Attestcoin verification.

UI statuses must match reality:

- `Waiting for attestation` means the app is actually waiting for attestation.
- `Verified` means actual proof verification.
- `Settled` means an actual successful settlement transaction.

Do not create fake or simulated verification results and present them as real. No mock Attestcoin verification as real. No simulated settlement as real. No hardcoded `verified` status.

A possible later five-panel layout (Job / Source Proof / Verification / Settlement / Security) is a **presentation layer only**. Design the UI around real protocol data once it exists. Do not treat that layout as architecture.

---

## 13. Locked project constraints

These remain hard constraints throughout development.

1. **Do not build another credit/invoice application.** Use Spark, CrossCredit, AttestDesk, and similar projects only as pattern references, not as confirmed CTC competitors.
2. **The frontend cannot determine the payout.** Reward originates from source-chain `JobCompleted` and is recovered from attested data.
3. **No five-panel UI before protocol validation.** First prove Sepolia → Attestcoin → proof → CC3 → settlement with real transactions.
4. **No fake protocol results.**
5. **No unnecessary scope.** One source chain. One reference DePIN job registry. One settlement contract. One operator. One completed job. One payout. One replay rejection.
6. **Use current Attestcoin infrastructure.** Do not build around deprecated USC instructions or assume old bridge architecture still applies.
7. **Don't guess protocol details.** Addresses, chain IDs, chain keys, SDK versions, proof formats, RPC endpoints, and verification interfaces must be confirmed from the current implementation.

Vereed does **not** include unless the user explicitly approves:

- real IoT hardware, physical sensors, or an actual DePIN network
- a new token, DAO governance, staking, AI agents, or automated hardware management
- multiple source chains or multiple settlement chains
- a complicated backend, elaborate payment system, or full DePIN marketplace
- a custom ERC-20 unless technical requirements force one
- a five-panel dashboard before the protocol works

Do not optimize for screen count, contract count, chain count, fake AI, tokenomics, theoretical scale, fake users, or production-readiness claims. Optimize for real Attestcoin integration, a clear DePIN problem, trust-minimized payout, replay protection, demo clarity, and explorer-verifiable transactions.

---

## 14. Development phases

Do not skip gates. Do not start the application until the relevant phase is reached **and** the user asks to implement.

### Phase 1 — Attestcoin technical validation (hard gate)

Run the official Attestcoin Hello Bridge example until this works with real testnet results:

```
Real Sepolia transaction
  → attestation
  → proof
  → proof submission
  → Creditcoin CC3 verification
  → real on-chain result
```

If the official flow does not work, do not start the UI.

### Phase 2 — Custom contract validation

After Hello Bridge works, use the official custom-contract example. Establish that a contract we control can consume the current Attestcoin verification mechanism. Only then adapt it into `MockDePINJobRegistry` + `SettlementVault`.

### Phase 3 — Vereed protocol

Build `MockDePINJobRegistry`, then `SettlementVault`, then connect `JobCompleted` → Attestcoin → `SettlementVault`. Require one complete successful settlement.

### Phase 4 — Replay protection

After first settlement succeeds, attempt the same settlement again. Expected: **REVERT**. Only then is the core protocol complete.

### Phase 5 — Frontend

Build the interface against real on-chain state and transaction data. Do not imply verification that has not happened.

### Phase 6 — Polish

Only after the core flow works: visual design, transaction states, explorer links, error handling, copy, smoother demo, documentation, recorded demo, README, hackathon submission. No major feature expansion.

---

## 15. Definition of technical success

Minimum technically successful demo, all with **real testnet transactions**:

1. Create Job #1001 on Sepolia.
2. Emit `JobCompleted(jobId, operator, unitsCompleted, reward)`.
3. Wait for Attestcoin attestation.
4. Generate proof.
5. Submit proof to CC3.
6. `SettlementVault` verifies the proof.
7. `SettlementVault` reads the verified job.
8. `SettlementVault` determines the verified reward.
9. Operator receives payment.
10. Attempt to settle Job #1001 again.
11. Transaction reverts.

Explorer evidence should include real Sepolia `JobCompleted` tx, real Attestcoin proof/verification information, real Creditcoin settlement tx, and a reverted replay tx. Do not rely on simulated screenshots or hardcoded dashboard values.

---

## 16. Unknown Attestcoin / protocol details

If a technical detail is not in this brief, **do not invent it**.

Must be confirmed from current official Attestcoin documentation, examples, and implementation before use:

- contract addresses
- chain IDs and chain keys
- SDK versions
- proof formats
- RPC endpoints
- verification interfaces / Solidity APIs
- whether and how event logs can be decoded from a proof
- exact `JobCompleted` event structure
- exact claimed-job identifier for replay protection
- any other source-chain decoding details

When implementing or writing code comments/docs, explicitly mark unconfirmed items as **requires verification**. Prefer running official Hello Bridge and custom-contract examples over designing around assumptions.

The biggest technical risk is:

```
Sepolia event → Attestcoin attestation → proof → Solidity verification → decoding event data
```

That spike comes first. Application contracts come after the current Attestcoin flow is understood.

---

## Agent working rules

- This brief is the project's source of truth.
- Do not start implementing the application until asked.
- Do not expand MVP scope (AI, tokens, staking, governance, extra chains, extra products) without explicit user approval.
- Do not build the five-panel frontend before the real Sepolia → Attestcoin → proof → CC3 → settlement flow works.
- Do not present fake or simulated verification as real.
- The frontend must never determine the payout.
- The payout must originate from attested `JobCompleted` data.
- Keep the mock DePIN registry: it exists so a real on-chain job event can trigger trustworthy Creditcoin settlement without physical infrastructure.
- Stay in DePIN + cross-chain verification + settlement. Do not drift into generic credit scoring, invoice financing, or generic bridging.
