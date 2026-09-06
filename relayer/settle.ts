/**
 * Vereed settlement service (CLI + HTTP).
 *
 * Reuses official Attestcoin helpers; does not modify example files, contracts, or the frontend.
 *
 * CLI (from the Vereed repo root):
 *   npm --prefix relayer run settle -- <sourceTxHash>
 *
 * The CLI and POST /settle share this module. Invoking settleFromSourceTx broadcasts a
 * Creditcoin execute transaction. Do not call it unless you are ready to settle a real
 * Sepolia JobCompleted hash.
 */
import { Contract, ethers, InterfaceAbi } from '../attestcoin-protocol-examples/node_modules/ethers';
import { loadEnv } from '../attestcoin-protocol-examples/shared/env';
import {
  computeGasLimitForMinter,
  generateProofFor,
  isValidPrivateKey,
  submitProofToMinter,
} from '../attestcoin-protocol-examples/shared/utils';

const REGISTRY_ADDRESS = '0x6Fdc5081515002fe511F19b0459c8Be2f2d11e9B';
const VAULT_ADDRESS = '0x4982E14524F6aBde3793800E416b2Bf3C81E5491';
const DEMO_MAX_REWARD_WEI = 10n ** 18n;
const SOURCE_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const JOB_COMPLETED_IFACE = new ethers.Interface([
  'event JobCompleted(uint256 indexed jobId, address indexed operator, uint256 reward)',
]);

const VAULT_ABI = [
  {
    type: 'function',
    name: 'settledJobs',
    stateMutability: 'view',
    inputs: [{ name: 'jobId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'sourceRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'JobSettled',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'operator', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
      { name: 'queryId', type: 'bytes32', indexed: true },
    ],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'action', type: 'uint8' },
      { name: 'chainKey', type: 'uint64' },
      { name: 'blockHeight', type: 'uint64' },
      { name: 'encodedTransaction', type: 'bytes' },
      { name: 'merkleRoot', type: 'bytes32' },
      {
        name: 'siblings',
        type: 'tuple[]',
        components: [
          { name: 'hash', type: 'bytes32' },
          { name: 'isLeft', type: 'bool' },
        ],
      },
      { name: 'lowerEndpointDigest', type: 'bytes32' },
      { name: 'continuityRoots', type: 'bytes32[]' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  { type: 'error', name: 'JobAlreadySettled', inputs: [] },
  { type: 'error', name: 'InsufficientVaultFunds', inputs: [] },
  { type: 'error', name: 'UnexpectedSourceRegistry', inputs: [] },
  { type: 'error', name: 'InvalidSourceRegistry', inputs: [] },
  { type: 'error', name: 'JobCompletedEventNotFound', inputs: [] },
  { type: 'error', name: 'TransactionDidNotSucceed', inputs: [] },
] as const;

const VAULT_ERROR_IFACE = new ethers.Interface(VAULT_ABI as unknown as InterfaceAbi);

export type RelayerErrorCode =
  | 'INVALID_SOURCE_TX_HASH'
  | 'INVALID_REQUEST'
  | 'SOURCE_TX_NOT_FOUND'
  | 'SOURCE_TX_FAILED'
  | 'NO_JOB_COMPLETED'
  | 'WRONG_SOURCE_REGISTRY'
  | 'JOB_ALREADY_SETTLED'
  | 'INSUFFICIENT_VAULT_FUNDS'
  | 'INVALID_REWARD'
  | 'PROOF_GENERATION_FAILED'
  | 'ATTESTATION_TIMEOUT'
  | 'CREDITCOIN_TX_FAILED'
  | 'CONFIG_ERROR'
  | 'INTERNAL';

export class RelayerError extends Error {
  readonly code: RelayerErrorCode;
  readonly httpStatus: number;

  constructor(code: RelayerErrorCode, message: string, httpStatus: number) {
    super(message);
    this.name = 'RelayerError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export type SettleSuccess = {
  success: true;
  sourceTxHash: string;
  settlementTxHash: string;
  jobId: string;
  operator: string;
  reward: string;
  rewardFormatted: string;
  queryId: string;
};

export type SettlementStatus = {
  sourceTxHash: string;
  jobId: string;
  operator: string;
  reward: string;
  rewardFormatted: string;
  settled: boolean;
  vaultBalanceWei: string;
  vaultFundedForReward: boolean;
};

type JobCompletedFacts = {
  jobId: bigint;
  operator: string;
  reward: bigint;
};

type RpcConfig = {
  creditcoinRpcUrl: string;
  sourceChainRpcUrl: string;
};

type SettleConfig = RpcConfig & {
  creditcoinPrivateKey: string;
  sourceChainKey: number;
  proofBuilderUrl: string;
};

export function isValidSourceTxHash(value: unknown): value is string {
  return typeof value === 'string' && SOURCE_TX_HASH_RE.test(value);
}

export function requireValidSourceTxHash(value: unknown): string {
  if (!isValidSourceTxHash(value)) {
    throw new RelayerError(
      'INVALID_SOURCE_TX_HASH',
      'sourceTxHash must be a 0x-prefixed 32-byte transaction hash',
      400,
    );
  }
  return value;
}

export function formatRewardCtc(reward: bigint): string {
  const ether = ethers.formatEther(reward).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  return `${ether} CTC`;
}

function printUsage(): void {
  console.error('Usage: settle <sourceTxHash>');
  console.error('Example: npm --prefix relayer run settle -- 0x…');
}

function requireSourceTxHash(argv: string[]): string {
  const settleIndex = argv.indexOf('settle');
  const hash = settleIndex === -1 ? undefined : argv[settleIndex + 1];
  if (settleIndex === -1 || !hash || hash.startsWith('-')) {
    printUsage();
    process.exit(1);
  }
  return requireValidSourceTxHash(hash);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function revertName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as {
    revert?: { name?: string };
    data?: string;
    info?: { error?: { data?: string } };
  };
  if (candidate.revert?.name) return candidate.revert.name;

  const data = candidate.data ?? candidate.info?.error?.data;
  if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
    try {
      return VAULT_ERROR_IFACE.parseError(data)?.name;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function asRelayerError(error: unknown): RelayerError {
  if (error instanceof RelayerError) return error;

  const name = revertName(error);
  if (name === 'JobAlreadySettled') {
    return new RelayerError('JOB_ALREADY_SETTLED', 'Job is already settled', 409);
  }
  if (name === 'InsufficientVaultFunds') {
    return new RelayerError('INSUFFICIENT_VAULT_FUNDS', 'Settlement vault has insufficient funds', 409);
  }
  if (name === 'UnexpectedSourceRegistry' || name === 'InvalidSourceRegistry') {
    return new RelayerError('WRONG_SOURCE_REGISTRY', 'Source registry does not match the vault configuration', 400);
  }
  if (name === 'JobCompletedEventNotFound') {
    return new RelayerError('NO_JOB_COMPLETED', 'No JobCompleted event from the configured Vereed registry', 400);
  }
  if (name === 'TransactionDidNotSucceed') {
    return new RelayerError('SOURCE_TX_FAILED', 'Source transaction did not succeed', 400);
  }

  const message = errorText(error);
  const lower = message.toLowerCase();

  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('attestation')) {
    return new RelayerError('ATTESTATION_TIMEOUT', message, 504);
  }
  if (lower.includes('failed to generate proof') || lower.includes('proof generation')) {
    return new RelayerError('PROOF_GENERATION_FAILED', message, 502);
  }
  if (lower.includes('creditcoin transaction') || lower.includes('jobsettled was not found')) {
    return new RelayerError('CREDITCOIN_TX_FAILED', message, 502);
  }

  return new RelayerError('INTERNAL', message, 500);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new RelayerError('CONFIG_ERROR', `${name} environment variable is not configured or invalid`, 500);
  }
  return value;
}

function loadRpcConfig(): RpcConfig {
  loadEnv('bridge');
  return {
    creditcoinRpcUrl: requireEnv('CREDITCOIN_RPC_URL'),
    sourceChainRpcUrl: requireEnv('SOURCE_CHAIN_RPC_URL'),
  };
}

function loadSettleConfig(): SettleConfig {
  const rpc = loadRpcConfig();
  const creditcoinPrivateKey = process.env.CREDITCOIN_WALLET_PRIVATE_KEY;
  if (!creditcoinPrivateKey || !isValidPrivateKey(creditcoinPrivateKey)) {
    throw new RelayerError(
      'CONFIG_ERROR',
      'CREDITCOIN_WALLET_PRIVATE_KEY environment variable is not configured or invalid',
      500,
    );
  }

  const sourceChainKey = Number(process.env.SOURCE_CHAIN_KEY);
  if (!sourceChainKey) {
    throw new RelayerError('CONFIG_ERROR', 'SOURCE_CHAIN_KEY environment variable is not configured or invalid', 500);
  }

  return {
    ...rpc,
    creditcoinPrivateKey,
    sourceChainKey,
    proofBuilderUrl: requireEnv('PROOF_BUILDER_URL'),
  };
}

function parseJobCompleted(receipt: ethers.TransactionReceipt): JobCompletedFacts {
  if (receipt.status !== 1) {
    throw new RelayerError('SOURCE_TX_FAILED', 'Source transaction did not succeed', 400);
  }

  const registry = ethers.getAddress(REGISTRY_ADDRESS);
  for (const log of receipt.logs) {
    if (ethers.getAddress(log.address) !== registry) continue;
    try {
      const parsed = JOB_COMPLETED_IFACE.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name !== 'JobCompleted') continue;
      const jobId = parsed.args.jobId as bigint;
      const operator = parsed.args.operator as string;
      const reward = parsed.args.reward as bigint;
      if (jobId === 0n) {
        throw new RelayerError('NO_JOB_COMPLETED', 'JobCompleted jobId is zero', 400);
      }
      if (operator === ethers.ZeroAddress) {
        throw new RelayerError('NO_JOB_COMPLETED', 'JobCompleted operator is zero', 400);
      }
      return { jobId, operator: ethers.getAddress(operator), reward };
    } catch (error) {
      if (error instanceof RelayerError) throw error;
    }
  }

  throw new RelayerError(
    'NO_JOB_COMPLETED',
    'No JobCompleted event from the configured Vereed registry in this transaction',
    400,
  );
}

async function readSourceJob(
  sourceProvider: ethers.JsonRpcProvider,
  sourceTxHash: string,
): Promise<JobCompletedFacts> {
  const sourceReceipt = await sourceProvider.getTransactionReceipt(sourceTxHash);
  if (!sourceReceipt) {
    throw new RelayerError('SOURCE_TX_NOT_FOUND', `Source transaction ${sourceTxHash} was not found`, 404);
  }
  return parseJobCompleted(sourceReceipt);
}

async function validateVault(vault: Contract, job: JobCompletedFacts): Promise<void> {
  const onchainRegistry = ethers.getAddress(await vault.sourceRegistry());
  if (onchainRegistry !== ethers.getAddress(REGISTRY_ADDRESS)) {
    throw new RelayerError(
      'WRONG_SOURCE_REGISTRY',
      `Vault sourceRegistry ${onchainRegistry} does not match Vereed registry ${REGISTRY_ADDRESS}`,
      400,
    );
  }

  if (job.reward > DEMO_MAX_REWARD_WEI) {
    throw new RelayerError(
      'INVALID_REWARD',
      `Reward ${job.reward.toString()} exceeds the 1 CTC demo safety cap`,
      400,
    );
  }

  const alreadySettled = Boolean(await vault.settledJobs(job.jobId));
  if (alreadySettled) {
    throw new RelayerError('JOB_ALREADY_SETTLED', `Job ${job.jobId.toString()} is already settled`, 409);
  }

  const vaultAddress = await vault.getAddress();
  const balance = await vault.runner!.provider!.getBalance(vaultAddress);
  if (balance < job.reward) {
    throw new RelayerError(
      'INSUFFICIENT_VAULT_FUNDS',
      `Vault underfunded: balance ${balance.toString()} wei < reward ${job.reward.toString()} wei`,
      409,
    );
  }
}

function parseJobSettled(
  receipt: ethers.TransactionReceipt,
  vault: Contract,
): { jobId: bigint; operator: string; reward: bigint; queryId: string } {
  const settled = receipt.logs
    .map((log) => {
      try {
        return vault.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === 'JobSettled');

  if (!settled) {
    throw new RelayerError(
      'CREDITCOIN_TX_FAILED',
      `Creditcoin transaction ${receipt.hash} mined but JobSettled was not found`,
      502,
    );
  }

  return {
    jobId: settled.args.jobId as bigint,
    operator: ethers.getAddress(settled.args.operator as string),
    reward: settled.args.reward as bigint,
    queryId: settled.args.queryId as string,
  };
}

function toSettleSuccess(
  sourceTxHash: string,
  settlementTxHash: string,
  settled: { jobId: bigint; operator: string; reward: bigint; queryId: string },
): SettleSuccess {
  return {
    success: true,
    sourceTxHash,
    settlementTxHash,
    jobId: settled.jobId.toString(),
    operator: settled.operator,
    reward: settled.reward.toString(),
    rewardFormatted: formatRewardCtc(settled.reward),
    queryId: settled.queryId,
  };
}

export async function getSettlementStatus(sourceTxHash: string): Promise<SettlementStatus> {
  const hash = requireValidSourceTxHash(sourceTxHash);
  const config = loadRpcConfig();
  const ccProvider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const sourceProvider = new ethers.JsonRpcProvider(config.sourceChainRpcUrl);
  const job = await readSourceJob(sourceProvider, hash);
  const vault = new Contract(VAULT_ADDRESS, VAULT_ABI as unknown as InterfaceAbi, ccProvider);
  const onchainRegistry = ethers.getAddress(await vault.sourceRegistry());
  if (onchainRegistry !== ethers.getAddress(REGISTRY_ADDRESS)) {
    throw new RelayerError(
      'WRONG_SOURCE_REGISTRY',
      `Vault sourceRegistry ${onchainRegistry} does not match Vereed registry ${REGISTRY_ADDRESS}`,
      400,
    );
  }

  const settled = Boolean(await vault.settledJobs(job.jobId));
  const vaultBalanceWei = await ccProvider.getBalance(VAULT_ADDRESS);
  return {
    sourceTxHash: hash,
    jobId: job.jobId.toString(),
    operator: job.operator,
    reward: job.reward.toString(),
    rewardFormatted: formatRewardCtc(job.reward),
    settled,
    vaultBalanceWei: vaultBalanceWei.toString(),
    vaultFundedForReward: vaultBalanceWei >= job.reward,
  };
}

export async function settleFromSourceTx(sourceTxHash: string): Promise<SettleSuccess> {
  const hash = requireValidSourceTxHash(sourceTxHash);
  const config = loadSettleConfig();

  const ccProvider = new ethers.JsonRpcProvider(config.creditcoinRpcUrl);
  const sourceProvider = new ethers.JsonRpcProvider(config.sourceChainRpcUrl);

  const job = await readSourceJob(sourceProvider, hash);
  console.log(
    `Validated JobCompleted jobId=${job.jobId.toString()} operator=${job.operator} rewardWei=${job.reward.toString()}`,
  );

  const readVault = new Contract(VAULT_ADDRESS, VAULT_ABI as unknown as InterfaceAbi, ccProvider);
  await validateVault(readVault, job);
  console.log(`Vault ${VAULT_ADDRESS} is funded and job ${job.jobId.toString()} is not settled`);

  let proofResult;
  try {
    proofResult = await generateProofFor(
      hash,
      config.sourceChainKey,
      config.proofBuilderUrl,
      ccProvider,
      sourceProvider,
    );
  } catch (error) {
    const message = errorText(error);
    const lower = message.toLowerCase();
    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('attestation')) {
      throw new RelayerError('ATTESTATION_TIMEOUT', message, 504);
    }
    throw new RelayerError('PROOF_GENERATION_FAILED', message, 502);
  }
  if (!proofResult.success || !proofResult.data) {
    throw new RelayerError(
      'PROOF_GENERATION_FAILED',
      `Failed to generate proof: ${proofResult.error ?? 'unknown error'}`,
      502,
    );
  }

  const wallet = new ethers.Wallet(config.creditcoinPrivateKey, ccProvider);
  const vault = new Contract(VAULT_ADDRESS, VAULT_ABI as unknown as InterfaceAbi, wallet);
  const gasLimit = await computeGasLimitForMinter(ccProvider, vault, proofResult.data, wallet.address);

  let response;
  try {
    response = await submitProofToMinter(vault, proofResult.data, gasLimit);
  } catch (error) {
    throw asRelayerError(error).code === 'INTERNAL'
      ? new RelayerError('CREDITCOIN_TX_FAILED', errorText(error), 502)
      : asRelayerError(error);
  }

  const cc3TxHash: string = response.hash;
  console.log(`SettlementVault.execute submitted: ${cc3TxHash}`);

  const destReceipt = (await response.wait()) as ethers.TransactionReceipt | null;
  if (!destReceipt) {
    throw new RelayerError(
      'CREDITCOIN_TX_FAILED',
      `Creditcoin transaction ${cc3TxHash} was submitted but no receipt was returned`,
      502,
    );
  }
  if (destReceipt.status !== 1) {
    throw new RelayerError('CREDITCOIN_TX_FAILED', `Creditcoin transaction ${cc3TxHash} failed`, 502);
  }

  const settled = parseJobSettled(destReceipt, vault);
  console.log(`CC3 transaction hash: ${cc3TxHash}`);
  console.log(`JobSettled jobId: ${settled.jobId.toString()}`);
  console.log(`JobSettled operator: ${settled.operator}`);
  console.log(`JobSettled reward: ${settled.reward.toString()} wei`);
  console.log(`JobSettled queryId: ${settled.queryId}`);

  return toSettleSuccess(hash, cc3TxHash, settled);
}

async function main(): Promise<void> {
  const sourceTxHash = requireSourceTxHash(process.argv);
  await settleFromSourceTx(sourceTxHash);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const relayerError = asRelayerError(error);
    console.error(relayerError.message);
    process.exit(1);
  });
}
