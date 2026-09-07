import { Hero } from "./components/Hero";
import { ProofOfSettlement } from "./components/ProofOfSettlement";
import { ReplaySection } from "./components/ReplaySection";
import { SettlementJourney } from "./components/SettlementJourney";
import { WalletBar } from "./components/WalletBar";
import { useProtocolSnapshot } from "./lib/useProtocolSnapshot";
import { useRegistryJob } from "./lib/useRegistryJob";

export default function App() {
  const {
    session,
    flowStatus,
    operator,
    reward,
    createJob,
    completeJob,
    requestSettlement,
    refreshRelayerStatus,
  } = useRegistryJob();
  const { snapshot, loading, refreshing, loadError, refresh } = useProtocolSnapshot({
    jobId: session.jobId,
    jobCompletedTxHash: session.sourceTxHash,
  });

  const onRefresh = () => {
    refresh();
    void refreshRelayerStatus();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="logo-mark" aria-hidden="true" />
          <div>
            <p className="topbar__name">Vereed</p>
            <p className="topbar__sub">DePIN settlement · Creditcoin</p>
          </div>
        </div>
        <div className="topbar__actions">
          <button type="button" className="btn btn--ghost" onClick={onRefresh} disabled={loading || refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <WalletBar />
        </div>
      </header>

      <main>
        <Hero snapshot={snapshot} session={session} flowStatus={flowStatus} loading={loading} />
        {loadError ? <p className="banner-error">{loadError}</p> : null}
        <SettlementJourney
          snapshot={snapshot}
          session={session}
          flowStatus={flowStatus}
          operator={operator}
          reward={reward}
          loading={loading}
          onCreate={() => void createJob()}
          onComplete={() => void completeJob()}
          onRequestSettlement={() => void requestSettlement()}
        />
        <ProofOfSettlement snapshot={snapshot} session={session} flowStatus={flowStatus} loading={loading} />
        <ReplaySection />
      </main>

      <footer className="site-footer">
        <p>Settlement infrastructure reference · BUIDL CTC 2026 Fall</p>
        <p>
          The connected wallet signs Sepolia createJob and completeJob only. Creditcoin settlement is requested through
          the HTTP relayer. The frontend never holds a Creditcoin or Attestcoin key.
        </p>
      </footer>
    </div>
  );
}
