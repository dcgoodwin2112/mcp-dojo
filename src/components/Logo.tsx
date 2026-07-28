/**
 * The MCP Lens mark: a magnifying glass over request/response arrows —
 * solid = request, dashed = response, mirroring the sequence diagram's
 * semantics and actor palette (sky app, emerald user, orange server).
 * SVG recreation of logos/logo2.png; also the favicon (src/app/icon.svg).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <g strokeWidth="1.9">
        <g stroke="#0ea5e9">
          <path d="M7 9h10.5" />
          <path d="M15 6.8 18 9l-3 2.2" />
        </g>
        <path stroke="#10b981" strokeDasharray="2.6 2.1" d="M20 13.5H9.5" />
        <path stroke="#10b981" d="M12 11.3 9 13.5l3 2.2" />
        <g stroke="#f97316">
          <path d="M7 18h10.5" />
          <path d="M15 15.8 18 18l-3 2.2" />
        </g>
      </g>
      <circle cx="13.5" cy="13.5" r="10.75" stroke="#0ea5e9" strokeWidth="2" />
      <path d="M21.6 21.6 28 28" stroke="#0ea5e9" strokeWidth="3" />
    </svg>
  );
}
