import { HISTORICAL_JOB_ID } from "../config";

export function ReplaySection() {
  return (
    <section className="replay" aria-labelledby="replay-heading">
      <div className="replay__copy">
        <p className="eyebrow">Historical evidence · Job #{HISTORICAL_JOB_ID.toString()}</p>
        <h2 id="replay-heading">Replay rejected</h2>
        <p className="section-copy">
          This is not the current session job. It records an earlier simulated replay after Job #
          {HISTORICAL_JOB_ID.toString()} had already settled.
        </p>
      </div>
      <div className="replay-card">
        <div>
          <p className="replay-card__kicker">Replay attempt</p>
          <p className="replay-card__result">Rejected</p>
        </div>
        <p className="replay-card__reason">Query already processed</p>
        <p className="replay-card__note">
          This was a simulated <code>eth_call</code> after Job #{HISTORICAL_JOB_ID.toString()} had already settled. There
          is no explorer hash because it was not broadcast.
        </p>
        <p className="replay-card__label">Historical · simulated replay · not this session</p>
      </div>
    </section>
  );
}
