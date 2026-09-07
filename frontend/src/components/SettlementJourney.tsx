import { SEPOLIA_EXPLORER_TX } from "../config";
import { formatCtcLabel, shortenAddress, shortenHash } from "../lib/format";
import { flowStatusLabel } from "../lib/status";
import type { JobFlowStatus, ProtocolSnapshot, SessionJob } from "../lib/types";
import { Copyable } from "./Copyable";
import { ExplorerLink } from "./ExplorerLink";

type SettlementJourneyProps = {
  snapshot: ProtocolSnapshot | null;
  session: SessionJob;
  flowStatus: JobFlowStatus;
  operator: `0x${string}` | null;
  reward: bigint;
  loading: boolean;
  onCreate: () => void;
  onComplete: () => void;
};

export function SettlementJourney({
  snapshot,
  session,
  flowStatus,
  operator,
  reward,
  loading,
  onCreate,
  onComplete,
}: SettlementJourneyProps) {
  const sourceCompleted = session.completeConfirmed;
  const sourceCreated = session.createConfirmed;
  const displayJobId = session.jobId ?? session.candidateJobId;
  const displayOperator = session.operator ?? operator;
  const displayReward = session.reward ?? reward;
  const previewJobId = session.candidateJobId;
  const canCreate =
    operator != null &&
    !session.probingJobId &&
    !sourceCreated &&
    (flowStatus === "ready_to_create" || flowStatus === "error");
  const canComplete =
    sourceCreated &&
    !sourceCompleted &&
    (flowStatus === "created" || flowStatus === "error");

  let sourceMetric = "No session job";
  if (flowStatus === "wallet_disconnected") sourceMetric = "Wallet disconnected";
  else if (flowStatus === "wrong_network") sourceMetric = "Switch to Sepolia";
  else if (flowStatus === "creating") sourceMetric = "Waiting for create confirmation…";
  else if (flowStatus === "completing") sourceMetric = "Waiting for complete confirmation…";
  else if (sourceCompleted) sourceMetric = "Completed";
  else if (sourceCreated) sourceMetric = "Created · not completed";
  else if (session.probingJobId) sourceMetric = "Finding unused job id…";
  else if (flowStatus === "ready_to_create") sourceMetric = "Ready to create";
  else if (flowStatus === "error") sourceMetric = "Error";
  else if (loading) sourceMetric = "Reading…";
  else if (snapshot?.sourceError) sourceMetric = "Unreadable";

  return (
    <section className="journey-wrap" aria-labelledby="journey-heading">
      <div className="section-head section-head--row">
        <div>
          <p className="eyebrow">Settlement journey</p>
          <h2 id="journey-heading">One completed job. One verified payment.</h2>
        </div>
      </div>

      <ol className="journey">
        <li className={`journey-card${sourceCompleted ? " is-complete" : sourceCreated ? " is-complete" : ""}`}>
          <header className="journey-card__head">
            <span className="journey-card__index">01</span>
            <span className="journey-card__layer">Source</span>
            <span className={`stage-dot${sourceCreated || sourceCompleted ? " is-on" : ""}`} />
          </header>
          <h3>Ethereum Sepolia</h3>
          <p className="journey-card__value">
            {displayJobId != null ? `Job #${displayJobId.toString()}` : "No session job"}
          </p>
          <p className="journey-card__metric">{sourceMetric}</p>
          <p className="journey-card__metric journey-card__metric--accent">
            {sourceCreated || sourceCompleted
              ? `${formatCtcLabel(displayReward)} recorded`
              : `${formatCtcLabel(displayReward)} (preview)`}
          </p>
          {displayOperator ? (
            <p className="journey-card__operator">
              <Copyable value={displayOperator} display={shortenAddress(displayOperator)} label="Operator" />
            </p>
          ) : null}

          <div className="job-preview">
            <p className="job-preview__label">Create job preview</p>
            <p className="journey-card__metric">
              Job ID {previewJobId != null ? previewJobId.toString() : session.probingJobId ? "…" : "—"}
              {" · "}
              Operator {operator ? shortenAddress(operator) : "connect wallet"}
              {" · "}
              Reward {formatCtcLabel(reward)}
            </p>
            <p className="journey-card__note">
              These values are written on Sepolia at createJob. They are not settlement inputs.
            </p>
          </div>

          <p className={`flow-status${flowStatus === "error" ? " is-error" : ""}`}>
            {flowStatusLabel(flowStatus)}
            {session.pendingTxHash ? ` · ${shortenHash(session.pendingTxHash)}` : ""}
          </p>
          {session.error ? <p className="field-error">{session.error}</p> : null}

          <div className="job-actions">
            <button type="button" className="btn" disabled={!canCreate} onClick={onCreate}>
              {flowStatus === "creating" ? "Creating…" : "Create Job"}
            </button>
            <button type="button" className="btn" disabled={!canComplete} onClick={onComplete}>
              {flowStatus === "completing" ? "Completing…" : "Complete Job"}
            </button>
          </div>

          {session.createTxHash && sourceCreated ? (
            <ExplorerLink href={`${SEPOLIA_EXPLORER_TX}/${session.createTxHash}`}>Create transaction</ExplorerLink>
          ) : null}
          {session.sourceTxHash && sourceCompleted ? (
            <ExplorerLink href={`${SEPOLIA_EXPLORER_TX}/${session.sourceTxHash}`}>JobCompleted</ExplorerLink>
          ) : null}
        </li>

        <li className="journey-rail" aria-hidden="true">
          <span />
        </li>

        <li className="journey-card">
          <header className="journey-card__head">
            <span className="journey-card__index">02</span>
            <span className="journey-card__layer">Verify</span>
            <span className="stage-dot" />
          </header>
          <h3>Attestcoin</h3>
          <p className="journey-card__metric">Settlement has not been requested.</p>
          <p className="journey-card__note">
            Proof success is shown only after a real Creditcoin execute transaction emits JobSettled. That step is not
            enabled yet.
          </p>
        </li>

        <li className="journey-rail" aria-hidden="true">
          <span />
        </li>

        <li className="journey-card">
          <header className="journey-card__head">
            <span className="journey-card__index">03</span>
            <span className="journey-card__layer">Settle</span>
            <span className="stage-dot" />
          </header>
          <h3>Creditcoin CC3</h3>
          <p className="journey-card__metric journey-card__metric--accent">Not settled</p>
          <p className="journey-card__metric">Operator unpaid</p>
          <p className="payout-rule">
            The frontend doesn't decide the payout.
            <br />
            The verified job does.
          </p>
        </li>
      </ol>
    </section>
  );
}
