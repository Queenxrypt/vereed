import { REGISTRY_ADDRESS, SEPOLIA_EXPLORER_TX, VAULT_ADDRESS } from "../config";
import { checksumAddress, formatCtcLabel, shortenAddress, shortenHash } from "../lib/format";
import { deriveStatus, flowStatusLabel } from "../lib/status";
import type { JobFlowStatus, ProtocolSnapshot, SessionJob } from "../lib/types";
import { Copyable } from "./Copyable";
import { ExplorerLink } from "./ExplorerLink";

type ProofOfSettlementProps = {
  snapshot: ProtocolSnapshot | null;
  session: SessionJob;
  flowStatus: JobFlowStatus;
  loading: boolean;
};

export function ProofOfSettlement({ snapshot, session, flowStatus, loading }: ProofOfSettlementProps) {
  const status = deriveStatus(snapshot, session);
  const sourceReward = session.reward ?? snapshot?.sourceJob?.reward ?? snapshot?.jobCompleted?.reward;
  const registryOnVault = snapshot?.sourceRegistry;
  const jobId = session.jobId;

  return (
    <section className="evidence" aria-labelledby="proof-heading">
      <div className="section-head section-head--row">
        <div>
          <p className="eyebrow">On-chain evidence</p>
          <h2 id="proof-heading">Proof of settlement</h2>
        </div>
        <p className="section-copy">
          Session hashes come from this wallet's Sepolia transactions. Settlement is not requested in this step.
        </p>
      </div>

      <div className="tx-list">
        <div className="tx-row">
          <p className="tx-row__label">Sepolia createJob</p>
          {session.createTxHash && session.createConfirmed ? (
            <>
              <Copyable value={session.createTxHash} display={shortenHash(session.createTxHash)} />
              <ExplorerLink href={`${SEPOLIA_EXPLORER_TX}/${session.createTxHash}`}>Etherscan</ExplorerLink>
            </>
          ) : (
            <p className="tx-row__meta">
              {flowStatus === "creating"
                ? session.pendingTxHash
                  ? `Pending ${shortenHash(session.pendingTxHash)}`
                  : "Waiting for wallet signature…"
                : "No confirmed create transaction this session"}
            </p>
          )}
        </div>
        <div className="tx-row">
          <p className="tx-row__label">Sepolia JobCompleted</p>
          {session.sourceTxHash && session.completeConfirmed ? (
            <>
              <Copyable value={session.sourceTxHash} display={shortenHash(session.sourceTxHash)} />
              <ExplorerLink href={`${SEPOLIA_EXPLORER_TX}/${session.sourceTxHash}`}>Etherscan</ExplorerLink>
              {snapshot?.jobCompleted ? (
                <p className="tx-row__meta">
                  Block {snapshot.jobCompleted.blockNumber.toString()} · {formatCtcLabel(snapshot.jobCompleted.reward)}
                </p>
              ) : snapshot?.jobCompletedError ? (
                <p className="field-error">{snapshot.jobCompletedError}</p>
              ) : loading ? (
                <p className="tx-row__meta">Reading…</p>
              ) : null}
            </>
          ) : (
            <p className="tx-row__meta">
              {flowStatus === "completing"
                ? session.pendingTxHash
                  ? `Pending ${shortenHash(session.pendingTxHash)}`
                  : "Waiting for wallet signature…"
                : "No confirmed JobCompleted transaction this session"}
            </p>
          )}
        </div>
        <div className="tx-row">
          <p className="tx-row__label">Creditcoin settlement</p>
          <p className="tx-row__meta">Not requested yet</p>
        </div>
      </div>

      <div className="proof-split">
        <article>
          <h3>Session JobCompleted</h3>
          {session.completeConfirmed && session.jobId != null && session.operator && session.reward != null && session.sourceTxHash ? (
            <dl className="compact-dl compact-dl--inline">
              <div>
                <dt>jobId</dt>
                <dd>{session.jobId.toString()}</dd>
              </div>
              <div>
                <dt>operator</dt>
                <dd>
                  <Copyable value={session.operator} display={shortenAddress(session.operator)} />
                </dd>
              </div>
              <div>
                <dt>reward</dt>
                <dd>{formatCtcLabel(session.reward)}</dd>
              </div>
              <div>
                <dt>sourceTxHash</dt>
                <dd>
                  <Copyable value={session.sourceTxHash} display={shortenHash(session.sourceTxHash)} />
                </dd>
              </div>
            </dl>
          ) : (
            <p>No JobCompleted event from this session yet.</p>
          )}
        </article>

        <article>
          <h3>Vault &amp; registry</h3>
          <dl className="compact-dl compact-dl--inline">
            <div>
              <dt>Vault balance</dt>
              <dd>
                {snapshot?.vaultBalance !== null && snapshot?.vaultBalance !== undefined
                  ? formatCtcLabel(snapshot.vaultBalance)
                  : snapshot?.vaultBalanceError
                    ? snapshot.vaultBalanceError
                    : loading
                      ? "…"
                      : "—"}
              </dd>
            </div>
            <div>
              <dt>{jobId != null ? `settledJobs(${jobId.toString()})` : "settledJobs"}</dt>
              <dd>
                {jobId == null
                  ? "—"
                  : snapshot == null || snapshot.settled === null
                    ? (snapshot?.settledError ?? (loading ? "…" : "—"))
                    : String(snapshot.settled)}
              </dd>
            </div>
            <div>
              <dt>sourceRegistry()</dt>
              <dd>
                {registryOnVault ? (
                  <Copyable value={registryOnVault} display={shortenAddress(registryOnVault)} />
                ) : (
                  (snapshot?.sourceRegistryError ?? (loading ? "…" : "—"))
                )}
              </dd>
            </div>
            <div>
              <dt>Expected registry</dt>
              <dd>
                <Copyable value={REGISTRY_ADDRESS} display={shortenAddress(REGISTRY_ADDRESS)} />
              </dd>
            </div>
            <div>
              <dt>Vault</dt>
              <dd>
                <Copyable value={VAULT_ADDRESS} display={shortenAddress(VAULT_ADDRESS)} />
              </dd>
            </div>
          </dl>
          {registryOnVault && checksumAddress(registryOnVault) !== checksumAddress(REGISTRY_ADDRESS) ? (
            <p className="field-error">On-chain sourceRegistry does not match the configured Sepolia registry.</p>
          ) : null}
        </article>
      </div>

      <div className="reward-compare">
        <div>
          <p className="eyebrow">Source-chain recorded reward</p>
          <p className="reward-compare__value">
            {sourceReward !== undefined ? formatCtcLabel(sourceReward) : loading ? "…" : "—"}
          </p>
          <p className="reward-compare__hint">
            {jobId != null
              ? `From MockDePINJobRegistry.jobs(${jobId.toString()})`
              : "From this session's createJob preview"}
          </p>
        </div>
        <div>
          <p className="eyebrow">Actual settled reward</p>
          <p className="reward-compare__value">Not settled this session</p>
          <p className="reward-compare__hint">SettlementVault JobSettled is not requested yet</p>
        </div>
        <div>
          <p className="eyebrow">Session status</p>
          <p className="reward-compare__value reward-compare__value--status">
            {flowStatusLabel(flowStatus)}
            {status.label ? ` · ${status.label}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
