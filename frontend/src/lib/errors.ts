import { BaseError, ContractFunctionRevertedError } from "viem";

const REGISTRY_ERROR_MESSAGES: Record<string, string> = {
  InvalidJobId: "Invalid job id.",
  InvalidOperator: "Invalid operator address.",
  InvalidReward: "Invalid reward.",
  JobAlreadyExists: "That job id already exists on the registry.",
  JobDoesNotExist: "That job does not exist on the registry.",
  JobAlreadyCompleted: "That job is already completed.",
};

export function formatWriteError(error: unknown): string {
  if (error instanceof BaseError) {
    const reverted = error.walk((candidate) => candidate instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      if (name && REGISTRY_ERROR_MESSAGES[name]) return REGISTRY_ERROR_MESSAGES[name];
      if (name) return name;
    }
    const lower = error.shortMessage.toLowerCase();
    if (lower.includes("user rejected") || lower.includes("denied") || lower.includes("rejected the request")) {
      return "Wallet rejected the transaction.";
    }
    return error.shortMessage;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Transaction failed.";
}
