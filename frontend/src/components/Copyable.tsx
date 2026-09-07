import { useCallback, useState } from "react";

type CopyableProps = {
  value: string;
  label?: string;
  display?: string;
  mono?: boolean;
};

export function Copyable({ value, label, display, mono = true }: CopyableProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return (
    <span className={`copyable${mono ? " copyable--mono" : ""}`}>
      {label ? <span className="copyable__label">{label}</span> : null}
      <button type="button" className="copyable__value" onClick={onCopy} title="Copy">
        {display ?? value}
      </button>
      <span className="copyable__hint" aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </span>
    </span>
  );
}
