export const settlementVaultAbi = [
  {
    type: "function",
    name: "settledJobs",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "sourceRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "JobSettled",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
      { name: "queryId", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "VaultFunded",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
