import { defineChain } from "viem";

export const SEPOLIA_RPC =
  import.meta.env.VITE_SEPOLIA_RPC ?? "https://ethereum-sepolia-rpc.publicnode.com";
export const CC3_RPC =
  import.meta.env.VITE_CC3_RPC ?? "https://rpc.cc3-testnet.creditcoin.network";

export const creditcoinCc3 = defineChain({
  id: 102031,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: {
    default: { http: [CC3_RPC] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://creditcoin-testnet.blockscout.com",
    },
  },
  testnet: true,
});
