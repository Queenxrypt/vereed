import type { JobFlowStatus, ProtocolSnapshot, ProtocolStatusKind, SessionJob } from "./types";

export function deriveStatus(snapshot: ProtocolSnapshot | null, session?: SessionJob | null): {
  kind: ProtocolStatusKind;
  label: string;
} {
  const created = session?.createConfirmed === true || snapshot?.sourceJob?.exists === true;
  const completed =
    session?.completeConfirmed === true ||
    snapshot?.sourceJob?.completed === true ||
    snapshot?.jobCompleted !== null;
  const settledOnchain = session?.settleConfirmed === true;

  if (!created && !completed) {
    return { kind: "idle", label: "No session job yet" };
  }

  if (!completed) {
    return { kind: "created", label: "Created on Sepolia · Not completed" };
  }

  if (!settledOnchain) {
    return {
      kind: "completed_unsettled",
      label: "Completed on Sepolia · Not settled on Creditcoin",
    };
  }

  return {
    kind: "settled",
    label: "Settled · Attestcoin verification succeeded in the Creditcoin execute transaction",
  };
}

export function flowStatusLabel(status: JobFlowStatus): string {
  switch (status) {
    case "wallet_disconnected":
      return "Wallet disconnected";
    case "wrong_network":
      return "Wrong network · switch to Sepolia";
    case "ready_to_create":
      return "Ready to create";
    case "creating":
      return "Creating job · waiting for Sepolia confirmation";
    case "created":
      return "Created";
    case "completing":
      return "Completing job · waiting for Sepolia confirmation";
    case "completed":
      return "Completed";
    case "ready_to_request_settlement":
      return "Ready to request settlement";
    case "waiting_settlement":
      return "Settlement requested · waiting for Attestcoin verification and Creditcoin settlement";
    case "settled":
      return "Settled";
    case "settlement_error":
      return "Settlement error";
    case "error":
      return "Error";
  }
}
