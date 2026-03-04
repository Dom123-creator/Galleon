import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-navy-2" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-9">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
              <path d="M4 20 Q14 8 24 20" stroke="#c9a84c" strokeWidth="1.8" fill="none"/>
              <path d="M14 6 L14 20" stroke="#c9a84c" strokeWidth="1.5"/>
              <path d="M14 8 L20 14 L14 14 Z" fill="#c9a84c" opacity="0.7"/>
              <path d="M4 20 Q14 24 24 20 L24 22 Q14 27 4 22 Z" fill="#c9a84c" opacity="0.4"/>
            </svg>
            <span className="font-serif text-sm font-semibold text-gold/70">GALLEON</span>
          </Link>
          <p className="text-xs text-muted-2 font-mono">
            &copy; {new Date().getFullYear()} Galleon &middot; Private Credit Intelligence
          </p>
        </div>
      </div>
    </footer>
  );
}
