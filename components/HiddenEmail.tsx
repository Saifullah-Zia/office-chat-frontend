/** Stand-in for an email the server withheld (providers' emails are visible to admins only). */
export default function HiddenEmail() {
  return (
    <span className="hidden-email" title="Only admins can see a provider's email" aria-label="Email hidden. Only admins can see it.">
      <span className="hidden-email-blur" aria-hidden="true">provider.email@hidden.com</span>
      <style>{`
        .hidden-email { display: inline-flex; align-items: center; cursor: not-allowed; }
        .hidden-email-blur { filter: blur(5px); user-select: none; color: var(--text-muted); }
      `}</style>
    </span>
  );
}
