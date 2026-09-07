import { deriveStatus, flowStatusLabel } from "../lib/status";
import type { JobFlowStatus, ProtocolSnapshot, SessionJob } from "../lib/types";

type HeroProps = {
  snapshot: ProtocolSnapshot | null;
  session: SessionJob;
  flowStatus: JobFlowStatus;
  loading: boolean;
};

export function Hero({ snapshot, session, flowStatus, loading }: HeroProps) {
  const status = deriveStatus(snapshot, session);
  const jobLabel = session.settlement
    ? `Job #${session.settlement.jobId}`
    : session.jobId
      ? `Job #${session.jobId.toString()}`
      : session.candidateJobId
        ? `Job #${session.candidateJobId.toString()} (candidate)`
        : "No session job";
  const created = session.createConfirmed;
  const completed = session.completeConfirmed;
  const settled = session.settleConfirmed;
  const waiting = flowStatus === "waiting_settlement";
  const live = snapshot !== null && !loading;

  return (
    <section className="hero">
      <div className="hero__intro">
        <div className="hero__topline">
          <p className="hero__mark">Vereed</p>
          {live ? (
            <p className="live-pill" title="Values are read from the deployed Sepolia and Creditcoin contracts.">
              <span className="live-pill__dot" />
              Live testnet data
            </p>
          ) : (
            <p className="live-pill live-pill--pending">Reading deployed contracts…</p>
          )}
        </div>
        <h1>
          Verified work.
          <br />
          Trustless settlement.
        </h1>
        <p className="hero__support">
          DePIN work is recorded on Ethereum Sepolia, attested through Attestcoin, and paid on Creditcoin.
        </p>
        <p className="hero__promise">Verify the work. Release the payment.</p>
      </div>

      <aside className={`hero-result${settled ? " is-settled" : ""}`} aria-label="Session job">
        <p className="hero-result__job">{jobLabel}</p>
        <ol className="hero-result__stages">
          <li className={completed ? "is-done" : created ? "is-done" : ""}>
            {completed ? "Completed" : created ? "Created" : "Not created"}
          </li>
          <li className={settled ? "is-done" : ""}>
            {waiting ? "Waiting…" : settled ? "Verified" : "Unverified"}
          </li>
          <li className={settled ? "is-done" : ""}>
            {waiting
              ? "Waiting…"
              : settled && session.settlement
                ? `${session.settlement.rewardFormatted} paid`
                : "Not paid"}
          </li>
        </ol>
        <ol className="hero-result__chains">
          <li>Ethereum Sepolia</li>
          <li>Attestcoin</li>
          <li>Creditcoin CC3</li>
        </ol>
        <p className="hero-result__status">
          {flowStatusLabel(flowStatus)}
          {status.kind !== "idle" && flowStatus !== "waiting_settlement" ? ` · ${status.label}` : ""}
        </p>
      </aside>
    </section>
  );
}
