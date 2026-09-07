import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { mockDePINJobRegistryAbi } from "../abi/MockDePINJobRegistry";
import { DEMO_REWARD_WEI, REGISTRY_ADDRESS } from "../config";
import { sepoliaClient } from "./clients";
import { formatWriteError } from "./errors";
import { getSettlementStatus, postSettle, RelayerClientError } from "./relayer";
import {
  findUnusedJobId,
  parseJobCompletedFromReceipt,
  parseJobCreatedFromReceipt,
} from "./reads";
import type { JobFlowStatus, SessionJob } from "./types";

const emptySession: SessionJob = {
  candidateJobId: null,
  jobId: null,
  operator: null,
  reward: null,
  createTxHash: null,
  sourceTxHash: null,
  createConfirmed: false,
  completeConfirmed: false,
  settleConfirmed: false,
  settlement: null,
  relayerSettled: null,
  pendingTxHash: null,
  error: null,
  settlementError: null,
  probingJobId: false,
};

function settleErrorMessage(error: unknown): string {
  if (error instanceof RelayerClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Settlement request failed.";
}

export function useRegistryJob() {
  const { address, isConnected, chainId } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [session, setSession] = useState<SessionJob>(emptySession);
  const [pendingKind, setPendingKind] = useState<"create" | "complete" | "settle" | null>(null);

  const onSepolia = isConnected && chainId === sepolia.id;
  const operator = address ?? null;
  const reward = DEMO_REWARD_WEI;

  useEffect(() => {
    if (!onSepolia || session.createConfirmed) return;

    let cancelled = false;
    setSession((prev) => ({ ...prev, probingJobId: true, error: prev.error }));

    void findUnusedJobId()
      .then((id) => {
        if (cancelled) return;
        setSession((prev) => ({
          ...prev,
          candidateJobId: id,
          probingJobId: false,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSession((prev) => ({
          ...prev,
          probingJobId: false,
          error: error instanceof Error ? error.message : "Failed to find an unused job id.",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [onSepolia, session.createConfirmed]);

  const flowStatus: JobFlowStatus = useMemo(() => {
    if (!isConnected || !address) return "wallet_disconnected";
    if (chainId !== sepolia.id) return "wrong_network";
    if (pendingKind === "create") return "creating";
    if (pendingKind === "complete") return "completing";
    if (pendingKind === "settle") return "waiting_settlement";
    if (session.settlementError && session.completeConfirmed) return "settlement_error";
    if (session.error) return "error";
    if (session.settleConfirmed) return "settled";
    if (session.completeConfirmed) return "ready_to_request_settlement";
    if (session.createConfirmed) return "created";
    return "ready_to_create";
  }, [
    address,
    chainId,
    isConnected,
    pendingKind,
    session.completeConfirmed,
    session.createConfirmed,
    session.error,
    session.settleConfirmed,
    session.settlementError,
  ]);

  const createJob = useCallback(async () => {
    if (!address || chainId !== sepolia.id) return;
    setSession((prev) => ({ ...prev, error: null, settlementError: null }));
    setPendingKind("create");

    try {
      const jobId = await findUnusedJobId(session.candidateJobId ?? undefined);
      setSession((prev) => ({
        ...prev,
        candidateJobId: jobId,
        operator: address,
        reward,
        createConfirmed: false,
        completeConfirmed: false,
        settleConfirmed: false,
        settlement: null,
        relayerSettled: null,
        createTxHash: null,
        sourceTxHash: null,
        pendingTxHash: null,
      }));

      const hash = await writeContractAsync({
        address: REGISTRY_ADDRESS,
        abi: mockDePINJobRegistryAbi,
        functionName: "createJob",
        args: [jobId, address, reward],
        chainId: sepolia.id,
      });
      setSession((prev) => ({ ...prev, pendingTxHash: hash, createTxHash: hash }));

      const receipt = await sepoliaClient.waitForTransactionReceipt({ hash });
      const created = parseJobCreatedFromReceipt(receipt, {
        jobId,
        operator: address,
        reward,
      });

      setSession((prev) => ({
        ...prev,
        jobId: created.jobId,
        operator: created.operator,
        reward: created.reward,
        createTxHash: created.transactionHash,
        pendingTxHash: null,
        createConfirmed: true,
        error: null,
      }));
    } catch (error: unknown) {
      setSession((prev) => ({
        ...prev,
        pendingTxHash: null,
        createConfirmed: false,
        error: formatWriteError(error),
      }));
    } finally {
      setPendingKind(null);
    }
  }, [address, chainId, reward, session.candidateJobId, writeContractAsync]);

  const completeJob = useCallback(async () => {
    if (!address || chainId !== sepolia.id) return;
    if (!session.createConfirmed || session.jobId == null || session.operator == null || session.reward == null) {
      return;
    }
    const jobId = session.jobId;
    const expectedOperator = session.operator;
    const expectedReward = session.reward;

    setSession((prev) => ({ ...prev, error: null, settlementError: null }));
    setPendingKind("complete");

    try {
      const hash = await writeContractAsync({
        address: REGISTRY_ADDRESS,
        abi: mockDePINJobRegistryAbi,
        functionName: "completeJob",
        args: [jobId],
        chainId: sepolia.id,
      });
      setSession((prev) => ({ ...prev, pendingTxHash: hash, sourceTxHash: null }));

      const receipt = await sepoliaClient.waitForTransactionReceipt({ hash });
      const completed = parseJobCompletedFromReceipt(receipt, {
        jobId,
        operator: expectedOperator,
        reward: expectedReward,
      });

      setSession((prev) => ({
        ...prev,
        sourceTxHash: completed.transactionHash,
        operator: completed.operator,
        reward: completed.reward,
        pendingTxHash: null,
        completeConfirmed: true,
        error: null,
      }));
    } catch (error: unknown) {
      setSession((prev) => ({
        ...prev,
        pendingTxHash: null,
        completeConfirmed: false,
        error: formatWriteError(error),
      }));
    } finally {
      setPendingKind(null);
    }
  }, [
    address,
    chainId,
    session.createConfirmed,
    session.jobId,
    session.operator,
    session.reward,
    writeContractAsync,
  ]);

  const requestSettlement = useCallback(async () => {
    if (!address || chainId !== sepolia.id) return;
    if (!session.completeConfirmed || !session.sourceTxHash || session.settleConfirmed) return;

    const sourceTxHash = session.sourceTxHash;
    setSession((prev) => ({ ...prev, settlementError: null, error: null }));
    setPendingKind("settle");

    try {
      const result = await postSettle(sourceTxHash);
      setSession((prev) => ({
        ...prev,
        settleConfirmed: true,
        settlement: {
          sourceTxHash: result.sourceTxHash,
          settlementTxHash: result.settlementTxHash,
          jobId: result.jobId,
          operator: result.operator,
          reward: result.reward,
          rewardFormatted: result.rewardFormatted,
          queryId: result.queryId,
        },
        relayerSettled: true,
        settlementError: null,
      }));
    } catch (error: unknown) {
      setSession((prev) => ({
        ...prev,
        settleConfirmed: false,
        settlement: null,
        settlementError: settleErrorMessage(error),
      }));
    } finally {
      setPendingKind(null);
    }
  }, [address, chainId, session.completeConfirmed, session.settleConfirmed, session.sourceTxHash]);

  const refreshRelayerStatus = useCallback(async () => {
    if (!session.sourceTxHash) return;
    try {
      const status = await getSettlementStatus(session.sourceTxHash);
      setSession((prev) => ({
        ...prev,
        relayerSettled: status.settled,
      }));
    } catch (error: unknown) {
      setSession((prev) => ({
        ...prev,
        settlementError: prev.settleConfirmed ? prev.settlementError : settleErrorMessage(error),
      }));
    }
  }, [session.sourceTxHash]);

  return {
    session,
    flowStatus,
    operator,
    reward,
    onSepolia,
    chainId,
    createJob,
    completeJob,
    requestSettlement,
    refreshRelayerStatus,
  };
}
