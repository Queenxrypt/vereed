type ExplorerLinkProps = {
  href: string;
  children: string;
};

export function ExplorerLink({ href, children }: ExplorerLinkProps) {
  return (
    <a className="explorer-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true" className="explorer-link__arrow">
        ↗
      </span>
    </a>
  );
}
