"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@/components/providers/clerk-components";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const userNavigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Deals", href: "/deals" },
  { name: "Missions", href: "/missions" },
  { name: "Documents", href: "/documents" },
  { name: "Command Center", href: "/command-center" },
];

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-navy-2">
      <nav className="mx-auto max-w-[1400px] px-6 lg:px-9" aria-label="Main">
        <div className="flex h-[58px] items-center justify-between">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
              <path d="M4 20 Q14 8 24 20" stroke="#c9a84c" strokeWidth="1.8" fill="none"/>
              <path d="M14 6 L14 20" stroke="#c9a84c" strokeWidth="1.5"/>
              <path d="M14 8 L20 14 L14 14 Z" fill="#c9a84c" opacity="0.7"/>
              <path d="M4 20 Q14 24 24 20 L24 22 Q14 27 4 22 Z" fill="#c9a84c" opacity="0.4"/>
            </svg>
            <span className="font-serif text-xl font-bold text-gold tracking-wide">GALLEON</span>
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex md:items-center md:gap-1 flex-1 ml-8">
            <SignedIn>
              {userNavigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "px-3.5 py-1.5 rounded text-[11px] font-semibold tracking-wide font-mono transition-all duration-150",
                    pathname === item.href || pathname.startsWith(item.href + "/")
                      ? "bg-navy-3 text-gold-2 border border-border-2"
                      : "text-muted-2 border border-transparent hover:text-cream-2 hover:bg-navy-3/50"
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </SignedIn>

            <SignedOut>
              <Link href="/pricing" className="px-3.5 py-1.5 rounded text-[11px] font-semibold tracking-wide font-mono text-muted-2 hover:text-cream-2 transition-colors">
                Pricing
              </Link>
            </SignedOut>
          </div>

          {/* Desktop auth */}
          <div className="hidden md:flex md:items-center md:gap-3">
            <SignedOut>
              <Link href="/sign-in" className="px-3.5 py-1.5 rounded text-[11px] font-semibold tracking-wide font-mono text-muted-2 hover:text-cream-2 transition-colors">
                Sign in
              </Link>
              <Link href="/sign-up" className="px-4 py-1.5 rounded bg-gold text-navy text-[11px] font-bold tracking-wide font-mono hover:bg-gold-2 transition-colors">
                Get Started
              </Link>
            </SignedOut>

            <SignedIn>
              <UserButton
                afterSignOutUrl="/"
                appearance={{ elements: { avatarBox: "w-8 h-8" } }}
              />
            </SignedIn>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              type="button"
              className="p-2 text-muted hover:text-cream-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-border">
            <div className="space-y-1">
              <SignedIn>
                {userNavigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "block px-3 py-2 rounded text-sm font-mono",
                      pathname === item.href || pathname.startsWith(item.href + "/")
                        ? "bg-navy-3 text-gold"
                        : "text-muted-2 hover:bg-navy-3 hover:text-cream-2"
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </SignedIn>
              <SignedOut>
                <Link href="/sign-in" className="block px-3 py-2 rounded text-sm font-mono text-muted-2 hover:bg-navy-3" onClick={() => setMobileMenuOpen(false)}>Sign in</Link>
                <Link href="/sign-up" className="block px-3 py-2 rounded text-sm font-mono bg-gold/20 text-gold" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
              </SignedOut>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
