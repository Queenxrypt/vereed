# Vereed relayer

HTTP wrapper around the working Sepolia → Attestcoin → Creditcoin settlement path.

The service signs `SettlementVault.execute` on Creditcoin with the server-side `CREDITCOIN_WALLET_PRIVATE_KEY`. The browser never receives that key. Payout `operator` and `reward` come from the verified source-chain `JobCompleted` event, not from the request body.

Start (default port 3000, override with `PORT`):

```bash
npm --prefix relayer start
```

## Endpoints

### `GET /health`

```json
{ "ok": true }
```

### `POST /settle`

Request:

```json
{ "sourceTxHash": "0x…" }
```

On success, returns settlement facts from the Creditcoin `JobSettled` event (`jobId`, `operator`, `reward`, `queryId`, `settlementTxHash`). This endpoint broadcasts a Creditcoin transaction.

Expected failures are classified (400 / 404 / 409 / 502 / 504) rather than always returning 500: invalid hash, missing or failed source transaction, missing `JobCompleted`, wrong registry, already settled, underfunded vault, proof/attestation failure, Creditcoin failure.

### `GET /settle/:sourceTxHash`

Read-only status. Looks up the Sepolia receipt and Creditcoin `settledJobs` mapping. Does not generate a proof and does not submit a transaction.
