import Link from "next/link";

const navigation = {
  product: [
    { name: "Pricing", href: "/pricing" },
    { name: "About", href: "/about" },
  ],
  platform: [
    { name: "Deal Intelligence", href: "/deals" },
    { name: "Mission Control", href: "/missions" },
    { name: "Command Center", href: "/dashboard" },
    { name: "Document Analysis", href: "/documents" },
  ],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    { name: "Security", href: "/security" },
  ],
  social: [
    { name: "Twitter", href: "https://twitter.com/galleonai" },
    { name: "LinkedIn", href: "https://linkedin.com/company/galleonai" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-slate-900" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">
        Footer
      </h2>
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="xl:grid xl:grid-cols-3 xl:gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <span className="text-white font-bold text-lg">G</span>
              </div>
              <span className="font-bold text-xl text-white">Galleon</span>
            </Link>
            <p className="text-sm text-slate-400 max-w-xs">
              AI-powered private credit intelligence for institutional investors.
              Deploy autonomous agents to research, analyze, and verify deal intelligence.
            </p>
            <div className="flex gap-4">
              {navigation.social.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  className="text-slate-400 hover:text-white transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="sr-only">{item.name}</span>
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          <div className="mt-12 grid grid-cols-2 gap-8 xl:col-span-2 xl:mt-0">
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold text-white">Product</h3>
                <ul className="mt-4 space-y-3">
                  {navigation.product.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-slate-400 hover:text-white transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold text-white">Platform</h3>
                <ul className="mt-4 space-y-3">
                  {navigation.platform.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-slate-400 hover:text-white transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="md:grid md:grid-cols-2 md:gap-8">
              <div>
                <h3 className="text-sm font-semibold text-white">Legal</h3>
                <ul className="mt-4 space-y-3">
                  {navigation.legal.map((item) => (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className="text-sm text-slate-400 hover:text-white transition-colors"
                      >
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-10 md:mt-0">
                <h3 className="text-sm font-semibold text-white">Contact</h3>
                <ul className="mt-4 space-y-3">
                  <li>
                    <a
                      href="mailto:support@galleon.ai"
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      support@galleon.ai
                    </a>
                  </li>
                  <li>
                    <a
                      href="mailto:enterprise@galleon.ai"
                      className="text-sm text-slate-400 hover:text-white transition-colors"
                    >
                      enterprise@galleon.ai
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 border-t border-slate-800 pt-8">
          <p className="text-xs text-slate-400 text-center">
            &copy; {new Date().getFullYear()} Galleon. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
