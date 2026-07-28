/**
 * The MCP Dojo mark: an ensō — the open brushed circle of Zen practice, the
 * dojo nod — around request/response arrows. Solid = request, dashed =
 * response, mirroring the sequence diagram's semantics and actor palette
 * (sky app, emerald user, orange server). Also the favicon (src/app/icon.svg).
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
          <path d="M9 11h11" />
          <path d="M17.5 8.8 20.5 11l-3 2.2" />
        </g>
        <path stroke="#10b981" strokeDasharray="2.6 2.1" d="M23 16H11.5" />
        <path stroke="#10b981" d="M14.5 13.8 11.5 16l3 2.2" />
        <g stroke="#f97316">
          <path d="M9 21h11" />
          <path d="M17.5 18.8 20.5 21l-3 2.2" />
        </g>
      </g>
      <path d="M26.88 10.93 A12 12 0 1 1 21.07 5.12" stroke="#0ea5e9" strokeWidth="2.25" />
    </svg>
  );
}
