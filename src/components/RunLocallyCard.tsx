/**
 * Shown in place of Live mode on the hosted replay-only build: Live inspects
 * MCP servers you run yourself, so it only makes sense locally.
 */
export function RunLocallyCard() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold">Live mode runs locally</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Live mode connects to MCP servers you run yourself — over HTTP or
          stdio — and logs every exchange as it happens. This hosted site has
          no server behind it, so to inspect your own MCP server, run MCP Dojo
          on your machine:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-100 p-3 font-mono text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {`git clone https://github.com/dcgoodwin2112/mcp-dojo\ncd mcp-dojo\nnpm install\nnpm run dev`}
        </pre>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Sessions saved locally with ↓ Save .json replay here — use Open
          log… in the Replay tab. Setup details are in the{" "}
          <a
            href="https://github.com/dcgoodwin2112/mcp-dojo#readme"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sky-700 underline dark:text-sky-400"
          >
            README
          </a>
          .
        </p>
      </div>
    </div>
  );
}
