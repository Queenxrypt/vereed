import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { CC3_RPC, creditcoinCc3, SEPOLIA_RPC } from "./chains";

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC),
});

export const cc3Client = createPublicClient({
  chain: creditcoinCc3,
  transport: http(CC3_RPC),
});
