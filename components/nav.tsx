import Link from "next/link";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "NRL Model";
const CURRENT_YEAR = new Date().getUTCFullYear();

export function Nav() {
  return (
    <nav className="border-b border-slate-800 bg-slate-950 px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="text-lg font-bold tracking-tight text-white">
          {APP_NAME}
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href={`/season/${CURRENT_YEAR}`}
            className="rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Season {CURRENT_YEAR}
          </Link>
          <Link
            href="/settings"
            className="rounded px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            Settings
          </Link>
        </div>
      </div>
    </nav>
  );
}
