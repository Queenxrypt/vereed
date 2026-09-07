export const mockDePINJobRegistryAbi = [
  {
    type: "function",
    name: "jobs",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "operator", type: "address" },
      { name: "reward", type: "uint256" },
      { name: "completed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "operator", type: "address" },
      { name: "reward", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "completeJob",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JobCompleted",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "InvalidJobId", inputs: [] },
  { type: "error", name: "InvalidOperator", inputs: [] },
  { type: "error", name: "InvalidReward", inputs: [] },
  { type: "error", name: "JobAlreadyExists", inputs: [] },
  { type: "error", name: "JobDoesNotExist", inputs: [] },
  { type: "error", name: "JobAlreadyCompleted", inputs: [] },
] as const;
