import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import { creditcoinCc3 } from "../lib/chains";
import { formatCtc, shortenAddress } from "../lib/format";
import { Copyable } from "./Copyable";

function networkLabel(chainId: number | undefined): string {
  if (chainId === sepolia.id) return "Sepolia";
  if (chainId === creditcoinCc3.id) return "Creditcoin CC3";
  if (chainId === undefined) return "Unknown network";
  return `Chain ${chainId}`;
}

export function WalletBar() {
  const { address, isConnected, isConnecting, chainId } = useAccount();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();
  const sepoliaBalance = useBalance({
    address,
    chainId: sepolia.id,
    query: { enabled: Boolean(address) },
  });
  const cc3Balance = useBalance({
    address,
    chainId: creditcoinCc3.id,
    query: { enabled: Boolean(address) },
  });

  const injected = connectors.find((connector) => connector.type === "injected") ?? connectors[0];
  const onSepolia = chainId === sepolia.id;

  return (
    <div className="wallet-bar">
      {isConnected && address ? (
        <>
          <div className="wallet-bar__meta">
            <Copyable value={address} display={shortenAddress(address)} label="Connected" />
            <p className={`wallet-bar__network${onSepolia ? "" : " is-wrong"}`}>
              Network: {networkLabel(chainId)}
              {onSepolia ? "" : " · Sepolia required to create or complete a job"}
            </p>
            <span className="wallet-bar__balances">
              <span>
                Sepolia {sepoliaBalance.data ? `${formatCtc(sepoliaBalance.data.value)} ETH` : sepoliaBalance.isLoading ? "…" : "—"}
              </span>
              <span>
                CC3 {cc3Balance.data ? `${formatCtc(cc3Balance.data.value)} CTC` : cc3Balance.isLoading ? "…" : "—"}
              </span>
            </span>
          </div>
          {!onSepolia ? (
            <button
              type="button"
              className="btn"
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: sepolia.id })}
            >
              {isSwitching ? "Switching…" : "Switch to Sepolia"}
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={() => disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="wallet-bar__hint">
            Connect a wallet on Sepolia to create and complete a job. The browser does not sign Creditcoin settlement.
          </p>
          <button
            type="button"
            className="btn"
            disabled={!injected || isPending || isConnecting}
            onClick={() => injected && connect({ connector: injected })}
          >
            {isPending || isConnecting ? "Connecting…" : "Connect wallet"}
          </button>
        </>
      )}
      {error ? (
        <p className="wallet-bar__error">
          {error.message.toLowerCase().includes("provider not found")
            ? "No browser wallet detected. Install or unlock a wallet to connect."
            : error.message}
        </p>
      ) : null}
      {switchError ? <p className="wallet-bar__error">{switchError.message}</p> : null}
    </div>
  );
}
