import { parseEther } from "viem";
import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { CC3_RPC, creditcoinCc3, SEPOLIA_RPC } from "./lib/chains";

/** Historical Job #1001 only. Never used as the active session job. */
export const HISTORICAL_JOB_ID = 1001n;

/** First candidate checked on-chain; skipped if `jobs(id)` already exists. */
export const JOB_ID_SEARCH_START = 1003n;

/** Source-chain createJob reward. Not a settlement input. Must stay ≤ 1 CTC. */
export const DEMO_REWARD_WEI = parseEther("0.01");

export const REGISTRY_ADDRESS = "0x6Fdc5081515002fe511F19b0459c8Be2f2d11e9B" as const;
export const VAULT_ADDRESS = "0x4982E14524F6aBde3793800E416b2Bf3C81E5491" as const;
export { SEPOLIA_RPC, CC3_RPC };

/** Historical Job #1001 txs only — never the current session result. */
export const HISTORICAL_JOB_COMPLETED_TX =
  "0xb01266d8ac380dc9f484a0edfd4aedf0592bd2dff22942d25fb56685ac0713c0" as const;
export const HISTORICAL_SETTLEMENT_TX =
  "0x03215f93a6e24207a8a69f4655488b1a556082492fa77344b4ea4972e469008f" as const;

export const SEPOLIA_EXPLORER_TX = "https://sepolia.etherscan.io/tx";
export const CC3_EXPLORER_TX = "https://creditcoin-testnet.blockscout.com/tx";

export const wagmiConfig = createConfig({
  chains: [sepolia, creditcoinCc3],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC),
    [creditcoinCc3.id]: http(CC3_RPC),
  },
});
