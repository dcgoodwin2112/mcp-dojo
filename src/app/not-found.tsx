import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6">
      <Logo className="size-10" />
      <h1 className="text-lg font-semibold">Page not found</h1>
      <Link href="/" className="text-sm font-medium text-sky-700 underline dark:text-sky-400">
        Back to MCP Dojo
      </Link>
    </div>
  );
}
