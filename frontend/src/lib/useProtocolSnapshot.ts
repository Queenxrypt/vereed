import { useCallback, useEffect, useState } from "react";
import { fetchProtocolSnapshot, type SnapshotQuery } from "./reads";
import type { ProtocolSnapshot } from "./types";

export function useProtocolSnapshot(query: SnapshotQuery = {}) {
  const [snapshot, setSnapshot] = useState<ProtocolSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const jobIdKey = query.jobId?.toString() ?? "";
  const jobCompletedTxHash = query.jobCompletedTxHash ?? null;

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const next = await fetchProtocolSnapshot({
          jobId: jobIdKey ? BigInt(jobIdKey) : null,
          jobCompletedTxHash,
        });
        setSnapshot(next);
        setLoadError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load protocol state.";
        setLoadError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [jobCompletedTxHash, jobIdKey],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return {
    snapshot,
    loading,
    refreshing,
    loadError,
    refresh: () => load(true),
  };
}
