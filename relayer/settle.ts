/**
 * Vereed CLI settlement wrapper (milestone 1).
 *
 * Reuses official Attestcoin helpers; does not modify example files, contracts, or the frontend.
 *
 * Run from the Vereed repo root using the examples toolchain (no extra packages):
 *   yarn --cwd attestcoin-protocol-examples tsx ../relayer/settle.ts settle <sourceTxHash>
 *
 * This process will broadcast a Creditcoin execute transaction if invoked. Do not run it
 * until you are ready to settle a real Sepolia JobCompleted hash.
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
] as const;

type JobCompletedFacts = {
  jobId: bigint;
  operator: string;
  reward: bigint;
};

function printUsage(): void {
  console.error('Usage: settle <sourceTxHash>');
  console.error('Example: yarn --cwd attestcoin-protocol-examples tsx ../relayer/settle.ts settle 0x…');
}

function requireSourceTxHash(argv: string[]): string {
  const settleIndex = argv.indexOf('settle');
  const hash = settleIndex === -1 ? undefined : argv[settleIndex + 1];
  if (settleIndex === -1 || !hash || hash.startsWith('-')) {
    printUsage();
    process.exit(1);
  }
  if (!hash.startsWith('0x') || hash.length !== 66) {
    throw new Error('Invalid source transaction hash');
  }
  return hash;
}

function parseJobCompleted(receipt: ethers.TransactionReceipt): JobCompletedFacts {
  if (receipt.status !== 1) {
    throw new Error('Source transaction did not succeed');
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
      if (jobId === 0n) throw new Error('JobCompleted jobId is zero');
      if (operator === ethers.ZeroAddress) throw new Error('JobCompleted operator is zero');
      return { jobId, operator: ethers.getAddress(operator), reward };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('JobCompleted')) throw error;
    }
  }

  throw new Error('No JobCompleted event from the configured Vereed registry in this transaction');
}

async function validateVault(vault: Contract, job: JobCompletedFacts): Promise<void> {
  const onchainRegistry = ethers.getAddress(await vault.sourceRegistry());
  if (onchainRegistry !== ethers.getAddress(REGISTRY_ADDRESS)) {
    throw new Error(
      `Vault sourceRegistry ${onchainRegistry} does not match Vereed registry ${REGISTRY_ADDRESS}`,
    );
  }

  if (job.reward > DEMO_MAX_REWARD_WEI) {
    throw new Error(`Reward ${job.reward.toString()} exceeds the 1 CTC demo safety cap`);
  }

  const alreadySettled = Boolean(await vault.settledJobs(job.jobId));
  if (alreadySettled) {
    throw new Error(`Job ${job.jobId.toString()} is already settled`);
  }

  const vaultAddress = await vault.getAddress();
  const balance = await vault.runner!.provider!.getBalance(vaultAddress);
  if (balance < job.reward) {
    throw new Error(
      `Vault underfunded: balance ${balance.toString()} wei < reward ${job.reward.toString()} wei`,
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
    throw new Error(`Creditcoin transaction ${receipt.hash} mined but JobSettled was not found`);
  }

  return {
    jobId: settled.args.jobId as bigint,
    operator: ethers.getAddress(settled.args.operator as string),
    reward: settled.args.reward as bigint,
    queryId: settled.args.queryId as string,
  };
}

async function main(): Promise<void> {
  const sourceTxHash = requireSourceTxHash(process.argv);

  loadEnv('bridge');

  const creditcoinPrivateKey = process.env.CREDITCOIN_WALLET_PRIVATE_KEY;
  if (!creditcoinPrivateKey || !isValidPrivateKey(creditcoinPrivateKey)) {
    throw new Error('CREDITCOIN_WALLET_PRIVATE_KEY environment variable is not configured or invalid');
  }

  const sourceChainKey = Number(process.env.SOURCE_CHAIN_KEY);
  if (!sourceChainKey) {
    throw new Error('SOURCE_CHAIN_KEY environment variable is not configured or invalid');
  }

  const proofBuilderUrl = process.env.PROOF_BUILDER_URL;
  if (!proofBuilderUrl) {
    throw new Error('PROOF_BUILDER_URL is not configured or invalid');
  }

  const creditcoinRpcUrl = process.env.CREDITCOIN_RPC_URL;
  if (!creditcoinRpcUrl) {
    throw new Error('CREDITCOIN_RPC_URL environment variable is not configured or invalid');
  }

  const sourceChainRpcUrl = process.env.SOURCE_CHAIN_RPC_URL;
  if (!sourceChainRpcUrl) {
    throw new Error('SOURCE_CHAIN_RPC_URL environment variable is not configured or invalid');
  }

  const ccProvider = new ethers.JsonRpcProvider(creditcoinRpcUrl);
  const sourceProvider = new ethers.JsonRpcProvider(sourceChainRpcUrl);

  const sourceReceipt = await sourceProvider.getTransactionReceipt(sourceTxHash);
  if (!sourceReceipt) {
    throw new Error(`Source transaction ${sourceTxHash} was not found`);
  }

  const job = parseJobCompleted(sourceReceipt);
  console.log(
    `Validated JobCompleted jobId=${job.jobId.toString()} operator=${job.operator} rewardWei=${job.reward.toString()}`,
  );

  const readVault = new Contract(VAULT_ADDRESS, VAULT_ABI as unknown as InterfaceAbi, ccProvider);
  await validateVault(readVault, job);
  console.log(`Vault ${VAULT_ADDRESS} is funded and job ${job.jobId.toString()} is not settled`);

  const proofResult = await generateProofFor(
    sourceTxHash,
    sourceChainKey,
    proofBuilderUrl,
    ccProvider,
    sourceProvider,
  );
  if (!proofResult.success || !proofResult.data) {
    throw new Error(`Failed to generate proof: ${proofResult.error ?? 'unknown error'}`);
  }

  const wallet = new ethers.Wallet(creditcoinPrivateKey, ccProvider);
  const vault = new Contract(VAULT_ADDRESS, VAULT_ABI as unknown as InterfaceAbi, wallet);
  const gasLimit = await computeGasLimitForMinter(ccProvider, vault, proofResult.data, wallet.address);
  const response = await submitProofToMinter(vault, proofResult.data, gasLimit);
  const cc3TxHash: string = response.hash;
  console.log(`SettlementVault.execute submitted: ${cc3TxHash}`);

  const destReceipt = (await response.wait()) as ethers.TransactionReceipt | null;
  if (!destReceipt) {
    throw new Error(`Creditcoin transaction ${cc3TxHash} was submitted but no receipt was returned`);
  }
  if (destReceipt.status !== 1) {
    throw new Error(`Creditcoin transaction ${cc3TxHash} failed`);
  }

  const settled = parseJobSettled(destReceipt, vault);
  console.log(`CC3 transaction hash: ${cc3TxHash}`);
  console.log(`JobSettled jobId: ${settled.jobId.toString()}`);
  console.log(`JobSettled operator: ${settled.operator}`);
  console.log(`JobSettled reward: ${settled.reward.toString()} wei`);
  console.log(`JobSettled queryId: ${settled.queryId}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
