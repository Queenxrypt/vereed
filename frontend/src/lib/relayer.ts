/** Browser-facing prefix. Vite proxies `/relayer` → `http://127.0.0.1:3000`. */
export const RELAYER_BASE = import.meta.env.VITE_RELAYER_BASE ?? "/relayer";

/** Attestcoin wait + Creditcoin execute can take many minutes. */
export const SETTLE_TIMEOUT_MS = 20 * 60 * 1000;

export type RelayerErrorCode =
  | "INVALID_SOURCE_TX_HASH"
  | "INVALID_REQUEST"
  | "SOURCE_TX_NOT_FOUND"
  | "SOURCE_TX_FAILED"
  | "NO_JOB_COMPLETED"
  | "WRONG_SOURCE_REGISTRY"
  | "JOB_ALREADY_SETTLED"
  | "INSUFFICIENT_VAULT_FUNDS"
  | "INVALID_REWARD"
  | "PROOF_GENERATION_FAILED"
  | "ATTESTATION_TIMEOUT"
  | "CREDITCOIN_TX_FAILED"
  | "CONFIG_ERROR"
  | "INTERNAL"
  | "NOT_FOUND"
  | "NETWORK"
  | "TIMEOUT";

export class RelayerClientError extends Error {
  readonly code: RelayerErrorCode;

  constructor(code: RelayerErrorCode, message: string) {
    super(message);
    this.name = "RelayerClientError";
    this.code = code;
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

export type RelayerSettlementStatus = {
  sourceTxHash: string;
  jobId: string;
  operator: string;
  reward: string;
  rewardFormatted: string;
  settled: boolean;
  vaultBalanceWei: string;
  vaultFundedForReward: boolean;
};

const ERROR_LABELS: Record<string, string> = {
  INVALID_SOURCE_TX_HASH: "Invalid source transaction hash",
  INVALID_REQUEST: "Invalid settlement request",
  SOURCE_TX_NOT_FOUND: "Source transaction not found",
  SOURCE_TX_FAILED: "Source transaction failed",
  NO_JOB_COMPLETED: "No JobCompleted event",
  WRONG_SOURCE_REGISTRY: "Wrong source registry",
  JOB_ALREADY_SETTLED: "Job already settled",
  INSUFFICIENT_VAULT_FUNDS: "Insufficient vault funds",
  INVALID_REWARD: "Invalid reward",
  PROOF_GENERATION_FAILED: "Attestcoin proof generation failed",
  ATTESTATION_TIMEOUT: "Attestcoin attestation timed out",
  CREDITCOIN_TX_FAILED: "Creditcoin settlement transaction failed",
  CONFIG_ERROR: "Relayer configuration error",
  INTERNAL: "Relayer error",
  NOT_FOUND: "Relayer route not found",
  NETWORK: "Could not reach the relayer",
  TIMEOUT: "Settlement request timed out",
};

function relayerUrl(path: string): string {
  const base = RELAYER_BASE.replace(/\/+$/, "");
  return `${base}${path}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatRelayerError(code: RelayerErrorCode, message: string): string {
  const label = ERROR_LABELS[code] ?? "Settlement failed";
  if (!message || message === label) return label;
  return `${label}: ${message}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RelayerClientError("INTERNAL", "Relayer returned a non-JSON response");
  }
}

function throwRelayerFailure(body: unknown, httpStatus: number): never {
  if (isRecord(body) && body.success === false) {
    const code = (asString(body.error) ?? "INTERNAL") as RelayerErrorCode;
    const message = asString(body.message) ?? `HTTP ${httpStatus}`;
    throw new RelayerClientError(code, formatRelayerError(code, message));
  }
  throw new RelayerClientError("INTERNAL", `Relayer request failed (HTTP ${httpStatus})`);
}

function parseSettleSuccess(body: unknown): SettleSuccess {
  if (!isRecord(body) || body.success !== true) {
    throw new RelayerClientError("INTERNAL", "Relayer did not return a successful settlement result");
  }
  const sourceTxHash = asString(body.sourceTxHash);
  const settlementTxHash = asString(body.settlementTxHash);
  const jobId = asString(body.jobId);
  const operator = asString(body.operator);
  const reward = asString(body.reward);
  const rewardFormatted = asString(body.rewardFormatted);
  const queryId = asString(body.queryId);
  if (!sourceTxHash || !settlementTxHash || !jobId || !operator || !reward || !rewardFormatted || !queryId) {
    throw new RelayerClientError("INTERNAL", "Relayer success response was missing JobSettled fields");
  }
  return {
    success: true,
    sourceTxHash,
    settlementTxHash,
    jobId,
    operator,
    reward,
    rewardFormatted,
    queryId,
  };
}

function parseSettlementStatus(body: unknown): RelayerSettlementStatus {
  if (!isRecord(body)) {
    throw new RelayerClientError("INTERNAL", "Relayer status response was invalid");
  }
  const sourceTxHash = asString(body.sourceTxHash);
  const jobId = asString(body.jobId);
  const operator = asString(body.operator);
  const reward = asString(body.reward);
  const rewardFormatted = asString(body.rewardFormatted);
  const vaultBalanceWei = asString(body.vaultBalanceWei);
  if (
    !sourceTxHash ||
    !jobId ||
    !operator ||
    !reward ||
    !rewardFormatted ||
    vaultBalanceWei === undefined ||
    typeof body.settled !== "boolean" ||
    typeof body.vaultFundedForReward !== "boolean"
  ) {
    throw new RelayerClientError("INTERNAL", "Relayer status response was missing fields");
  }
  return {
    sourceTxHash,
    jobId,
    operator,
    reward,
    rewardFormatted,
    settled: body.settled,
    vaultBalanceWei,
    vaultFundedForReward: body.vaultFundedForReward,
  };
}

export async function getRelayerHealth(): Promise<{ ok: true }> {
  let response: Response;
  try {
    response = await fetch(relayerUrl("/health"));
  } catch {
    throw new RelayerClientError("NETWORK", formatRelayerError("NETWORK", "Is the relayer running on port 3000?"));
  }
  const body = await readJson(response);
  if (!response.ok) throwRelayerFailure(body, response.status);
  if (!isRecord(body) || body.ok !== true) {
    throw new RelayerClientError("INTERNAL", "Relayer health check failed");
  }
  return { ok: true };
}

export async function postSettle(sourceTxHash: string, timeoutMs: number = SETTLE_TIMEOUT_MS): Promise<SettleSuccess> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(relayerUrl("/settle"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceTxHash }),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new RelayerClientError(
        "TIMEOUT",
        formatRelayerError(
          "TIMEOUT",
          "The browser stopped waiting for Attestcoin verification and Creditcoin settlement. Refresh read-only status; do not assume success.",
        ),
      );
    }
    throw new RelayerClientError("NETWORK", formatRelayerError("NETWORK", "Is the relayer running on port 3000?"));
  } finally {
    window.clearTimeout(timer);
  }

  const body = await readJson(response);
  if (!response.ok) throwRelayerFailure(body, response.status);
  return parseSettleSuccess(body);
}

export async function getSettlementStatus(sourceTxHash: string): Promise<RelayerSettlementStatus> {
  let response: Response;
  try {
    response = await fetch(relayerUrl(`/settle/${sourceTxHash}`));
  } catch {
    throw new RelayerClientError("NETWORK", formatRelayerError("NETWORK", "Is the relayer running on port 3000?"));
  }
  const body = await readJson(response);
  if (!response.ok) throwRelayerFailure(body, response.status);
  return parseSettlementStatus(body);
}
