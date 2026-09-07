import { formatEther, getAddress, isAddress } from "viem";

export function formatCtc(wei: bigint): string {
  const formatted = formatEther(wei);
  if (formatted.includes(".")) {
    const [whole, fraction] = formatted.split(".");
    const trimmed = fraction.replace(/0+$/, "");
    return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
  }
  return formatted;
}

export function formatCtcLabel(wei: bigint): string {
  return `${formatCtc(wei)} CTC`;
}

export function shortenAddress(value: string): string {
  if (!isAddress(value)) {
    return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  }
  const checksum = getAddress(value);
  return `${checksum.slice(0, 6)}…${checksum.slice(-4)}`;
}

export function checksumAddress(value: string): string {
  return isAddress(value) ? getAddress(value) : value;
}

export function shortenHash(hash: string): string {
  if (hash.length < 18) return hash;
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export function shortenBytes32(value: string): string {
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
