export type SourceJob = {
  exists: boolean;
  operator: `0x${string}`;
  reward: bigint;
  completed: boolean;
};

export type JobCreatedLog = {
  jobId: bigint;
  operator: `0x${string}`;
  reward: bigint;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
};

export type JobCompletedLog = {
  jobId: bigint;
  operator: `0x${string}`;
  reward: bigint;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
};

export type JobSettledLog = {
  jobId: bigint;
  operator: `0x${string}`;
  reward: bigint;
  queryId: `0x${string}`;
  transactionHash: `0x${string}`;
  blockNumber: bigint;
};

export type ProtocolSnapshot = {
  sourceJob: SourceJob | null;
  sourceError: string | null;
  jobCompleted: JobCompletedLog | null;
  jobCompletedError: string | null;
  settled: boolean | null;
  settledError: string | null;
  sourceRegistry: `0x${string}` | null;
  sourceRegistryError: string | null;
  vaultBalance: bigint | null;
  vaultBalanceError: string | null;
  jobSettled: JobSettledLog | null;
  jobSettledError: string | null;
};

export type ProtocolStatusKind = "idle" | "created" | "completed_unsettled" | "settled";

export type JobFlowStatus =
  | "wallet_disconnected"
  | "wrong_network"
  | "ready_to_create"
  | "creating"
  | "created"
  | "completing"
  | "completed"
  | "error";

export type SessionJob = {
  candidateJobId: bigint | null;
  jobId: bigint | null;
  operator: `0x${string}` | null;
  reward: bigint | null;
  createTxHash: `0x${string}` | null;
  sourceTxHash: `0x${string}` | null;
  createConfirmed: boolean;
  completeConfirmed: boolean;
  pendingTxHash: `0x${string}` | null;
  error: string | null;
  probingJobId: boolean;
};
