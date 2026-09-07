# Vereed frontend

Vite + React + TypeScript UI for the Vereed DePIN settlement demo.

It reads **live** Sepolia and Creditcoin CC3 state. It does not build Attestcoin proofs, hold private keys, or invent verification.

## Run

```bash
cd frontend
npm install
npm run dev
```

Optional RPC overrides in `.env.local`:

```
VITE_SEPOLIA_RPC=https://ethereum-sepolia-rpc.publicnode.com
VITE_CC3_RPC=https://rpc.cc3-testnet.creditcoin.network
```

Connect a wallet on Sepolia to sign `createJob` and `completeJob`. The browser does not sign Creditcoin settlement and does not hold a private key.
