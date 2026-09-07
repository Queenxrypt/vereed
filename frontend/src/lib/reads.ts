import { getAddress, parseEventLogs, zeroAddress, type TransactionReceipt } from "viem";
import { mockDePINJobRegistryAbi } from "../abi/MockDePINJobRegistry";
import { settlementVaultAbi } from "../abi/SettlementVault";
import { JOB_ID_SEARCH_START, REGISTRY_ADDRESS, VAULT_ADDRESS } from "../config";
import { cc3Client, sepoliaClient } from "./clients";
import type { JobCompletedLog, JobCreatedLog, ProtocolSnapshot, SourceJob } from "./types";

const MAX_JOB_ID_PROBES = 512;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unknown RPC error";
}

export async function readSourceJob(jobId: bigint): Promise<SourceJob> {
  const [operator, reward, completed] = await sepoliaClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: mockDePINJobRegistryAbi,
    functionName: "jobs",
    args: [jobId],
  });

  return {
    exists: operator !== zeroAddress,
    operator,
    reward,
    completed,
  };
}

export async function findUnusedJobId(startId: bigint = JOB_ID_SEARCH_START): Promise<bigint> {
  let id = startId <= 0n ? 1n : startId;
  for (let i = 0; i < MAX_JOB_ID_PROBES; i++) {
    const job = await readSourceJob(id);
    if (!job.exists) return id;
    id += 1n;
    if (id === 0n) id = 1n;
  }
  throw new Error("Could not find an unused job id on the registry.");
}

function requireReceiptSuccess(receipt: TransactionReceipt): void {
  if (receipt.status !== "success") {
    throw new Error("Sepolia transaction reverted.");
  }
}

type ExpectedJobFacts = {
  jobId: bigint;
  operator: `0x${string}`;
  reward: bigint;
};

function assertJobFacts(
  actual: { jobId: bigint; operator: `0x${string}`; reward: bigint },
  expected: ExpectedJobFacts,
  eventName: string,
): void {
  if (actual.jobId !== expected.jobId) {
    throw new Error(`${eventName} jobId ${actual.jobId.toString()} does not match ${expected.jobId.toString()}.`);
  }
  if (getAddress(actual.operator) !== getAddress(expected.operator)) {
    throw new Error(`${eventName} operator does not match the job being processed.`);
  }
  if (actual.reward !== expected.reward) {
    throw new Error(`${eventName} reward does not match the job being processed.`);
  }
}

export function parseJobCreatedFromReceipt(
  receipt: TransactionReceipt,
  expected: ExpectedJobFacts,
): JobCreatedLog {
  requireReceiptSuccess(receipt);
  const logs = parseEventLogs({
    abi: mockDePINJobRegistryAbi,
    eventName: "JobCreated",
    logs: receipt.logs,
  });
  const match = logs.find((log) => log.args.jobId === expected.jobId);
  if (!match || match.args.jobId === undefined || match.args.operator === undefined || match.args.reward === undefined) {
    throw new Error("JobCreated event was not found in the create transaction receipt.");
  }
  const parsed = {
    jobId: match.args.jobId,
    operator: match.args.operator,
    reward: match.args.reward,
  };
  assertJobFacts(parsed, expected, "JobCreated");
  return {
    ...parsed,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
  };
}

export function parseJobCompletedFromReceipt(
  receipt: TransactionReceipt,
  expected: ExpectedJobFacts,
): JobCompletedLog {
  requireReceiptSuccess(receipt);
  const logs = parseEventLogs({
    abi: mockDePINJobRegistryAbi,
    eventName: "JobCompleted",
    logs: receipt.logs,
  });
  const match = logs.find((log) => log.args.jobId === expected.jobId);
  if (!match || match.args.jobId === undefined || match.args.operator === undefined || match.args.reward === undefined) {
    throw new Error("JobCompleted event was not found in the complete transaction receipt.");
  }
  const parsed = {
    jobId: match.args.jobId,
    operator: match.args.operator,
    reward: match.args.reward,
  };
  assertJobFacts(parsed, expected, "JobCompleted");
  return {
    ...parsed,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
  };
}

async function readJobCompletedFromHash(
  hash: `0x${string}`,
  expectedJobId?: bigint,
): Promise<JobCompletedLog> {
  const receipt = await sepoliaClient.getTransactionReceipt({ hash });
  const logs = parseEventLogs({
    abi: mockDePINJobRegistryAbi,
    eventName: "JobCompleted",
    logs: receipt.logs,
  });
  const match =
    expectedJobId === undefined
      ? logs[0]
      : logs.find((log) => log.args.jobId === expectedJobId);
  if (!match || match.args.jobId === undefined || match.args.operator === undefined || match.args.reward === undefined) {
    throw new Error("JobCompleted event was not found in the session source transaction.");
  }
  return {
    jobId: match.args.jobId,
    operator: match.args.operator,
    reward: match.args.reward,
    transactionHash: receipt.transactionHash,
    blockNumber: receipt.blockNumber,
  };
}

async function readSettled(jobId: bigint): Promise<boolean> {
  return cc3Client.readContract({
    address: VAULT_ADDRESS,
    abi: settlementVaultAbi,
    functionName: "settledJobs",
    args: [jobId],
  });
}

async function readSourceRegistry(): Promise<`0x${string}`> {
  return cc3Client.readContract({
    address: VAULT_ADDRESS,
    abi: settlementVaultAbi,
    functionName: "sourceRegistry",
  });
}

async function readVaultBalance(): Promise<bigint> {
  return cc3Client.getBalance({ address: VAULT_ADDRESS });
}

export type SnapshotQuery = {
  jobId?: bigint | null;
  jobCompletedTxHash?: `0x${string}` | null;
};

export async function fetchProtocolSnapshot(query: SnapshotQuery = {}): Promise<ProtocolSnapshot> {
  const jobId = query.jobId ?? null;
  const jobCompletedTxHash = query.jobCompletedTxHash ?? null;

  const [sourceJob, jobCompleted, settled, sourceRegistry, vaultBalance] = await Promise.allSettled([
    jobId != null ? readSourceJob(jobId) : Promise.resolve(null),
    jobCompletedTxHash
      ? readJobCompletedFromHash(jobCompletedTxHash, jobId ?? undefined)
      : Promise.resolve(null),
    jobId != null ? readSettled(jobId) : Promise.resolve(null),
    readSourceRegistry(),
    readVaultBalance(),
  ]);

  return {
    sourceJob: sourceJob.status === "fulfilled" ? sourceJob.value : null,
    sourceError: sourceJob.status === "rejected" ? errorMessage(sourceJob.reason) : null,
    jobCompleted: jobCompleted.status === "fulfilled" ? jobCompleted.value : null,
    jobCompletedError: jobCompleted.status === "rejected" ? errorMessage(jobCompleted.reason) : null,
    settled: settled.status === "fulfilled" ? settled.value : null,
    settledError: settled.status === "rejected" ? errorMessage(settled.reason) : null,
    sourceRegistry: sourceRegistry.status === "fulfilled" ? sourceRegistry.value : null,
    sourceRegistryError: sourceRegistry.status === "rejected" ? errorMessage(sourceRegistry.reason) : null,
    vaultBalance: vaultBalance.status === "fulfilled" ? vaultBalance.value : null,
    vaultBalanceError: vaultBalance.status === "rejected" ? errorMessage(vaultBalance.reason) : null,
    jobSettled: null,
    jobSettledError: null,
  };
}
