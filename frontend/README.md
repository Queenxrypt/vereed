# Vereed frontend

Vite + React + TypeScript UI for the Vereed DePIN settlement demo.

It reads **live** Sepolia and Creditcoin CC3 state. Sepolia writes are signed in the browser. Creditcoin settlement is requested through the local HTTP relayer (`POST /relayer/settle` → `POST http://127.0.0.1:3000/settle`). The browser does not hold a Creditcoin key and does not call `SettlementVault.execute`.

## Run

```bash
cd frontend
npm install
npm run dev
```

Keep the relayer running separately on port 3000 for Request Settlement.

Optional overrides in `.env.local`:

```
VITE_SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
VITE_CC3_RPC=https://rpc.cc3-testnet.creditcoin.network
VITE_RELAYER_BASE=/relayer
```

Connect a wallet on Sepolia to sign `createJob` and `completeJob`. Settlement uses only `{ "sourceTxHash": "0x…" }`.
