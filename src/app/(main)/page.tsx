import { Metadata } from "next";
import Link from "next/link";
import {
  Search,
  ShieldCheck,
  Brain,
  Zap,
  FileText,
  Target,
  BarChart3,
  ArrowRight,
  Compass,
  Monitor,
  Anchor,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Galleon - Private Credit Intelligence, Powered by AI Agents",
  description:
    "Galleon is the AI-powered platform for private credit research, due diligence, and deal analysis. Deploy autonomous agents to surface insights faster.",
};

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-navy-2 to-navy opacity-80" />
        <div className="relative mx-auto max-w-[1400px] px-6 py-24 lg:px-9 text-center">
          <div className="inline-flex items-center gap-2 rounded border border-gold/20 bg-gold/5 px-4 py-1.5 text-[11px] font-mono font-bold tracking-wider text-gold uppercase mb-8">
            <Zap className="h-3.5 w-3.5" />
            AI-Powered Private Credit Research
          </div>
          <h1 className="font-serif text-4xl font-bold text-cream sm:text-6xl tracking-tight">
            Private Credit Intelligence,
            <span className="block text-gold mt-2">
              Powered by AI Agents
            </span>
          </h1>
          <p className="mt-6 text-lg text-muted max-w-3xl mx-auto leading-relaxed">
            Deploy autonomous AI agents to research deals, audit documents, and
            surface critical findings across your private credit portfolio.
            Galleon turns weeks of due diligence into hours.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Agent Cards */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-9">
          <div className="text-center mb-16">
            <p className="section-title mb-3">Agent Fleet</p>
            <h2 className="font-serif text-3xl font-bold text-cream sm:text-4xl">
              Your AI Research Team
            </h2>
            <p className="mt-4 text-muted max-w-2xl mx-auto">
              Three specialized agents work together to deliver comprehensive
              private credit intelligence.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Search,
                color: "text-g-blue",
                title: "Research Agent",
                desc: "Autonomously gathers and synthesizes information from credit agreements, financial statements, market data, and public filings.",
                features: ["Document parsing and extraction", "Financial covenant analysis", "Comparable deal benchmarking"],
              },
              {
                icon: ShieldCheck,
                color: "text-g-green",
                title: "Auditor Agent",
                desc: "Validates findings, cross-references data sources, and flags inconsistencies. Assigns confidence scores to every insight.",
                features: ["Cross-source verification", "Red flag detection", "Confidence scoring"],
              },
              {
                icon: Brain,
                color: "text-g-purple",
                title: "Master Orchestrator",
                desc: "Coordinates the research and audit agents, manages task dependencies, and synthesizes a final recommendation.",
                features: ["Multi-agent coordination", "Dynamic task planning", "Final synthesis and reporting"],
              },
            ].map((agent) => (
              <div
                key={agent.title}
                className="rounded-lg border border-border bg-navy-2 p-7 gold-accent transition-all hover:border-border-2"
              >
                <agent.icon className={`h-7 w-7 ${agent.color} mb-5`} />
                <h3 className="font-serif text-lg font-semibold text-cream">
                  {agent.title}
                </h3>
                <p className="mt-3 text-sm text-muted leading-relaxed">
                  {agent.desc}
                </p>
                <ul className="mt-5 space-y-2">
                  {agent.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-cream-2">
                      <span className="h-1 w-1 rounded-full bg-gold/60" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border py-16">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-9">
          <div className="text-center mb-10">
            <p className="section-title">Performance</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { value: "10x", label: "Faster Due Diligence" },
              { value: "500+", label: "Document Types Supported" },
              { value: "95%", label: "Finding Accuracy" },
              { value: "24/7", label: "Autonomous Research" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-mono text-3xl font-bold text-gold">{stat.value}</div>
                <p className="mt-2 text-sm text-muted">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Dual Mode */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-9">
          <div className="text-center mb-16">
            <p className="section-title mb-3">Operational Modes</p>
            <h2 className="font-serif text-3xl font-bold text-cream sm:text-4xl">
              Two Ways to Work
            </h2>
            <p className="mt-4 text-muted max-w-2xl mx-auto">
              Choose how you want to interact with your AI agents based on
              the task at hand.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border border-g-blue/20 bg-navy-2 p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded border border-g-blue/30 bg-g-blue/10">
                  <Compass className="h-5 w-5 text-g-blue" />
                </div>
                <h3 className="font-serif text-xl font-bold text-cream">
                  Mission Mode
                </h3>
              </div>
              <p className="text-sm text-muted leading-relaxed mb-5">
                Define your research objective, set success criteria, and let
                the agents run autonomously. Come back to a complete report
                with findings, confidence scores, and recommendations.
              </p>
              <ul className="space-y-2.5">
                {[
                  { icon: Target, text: "Set-and-forget research missions" },
                  { icon: FileText, text: "Automated report generation" },
                  { icon: BarChart3, text: "Confidence-scored findings" },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-2 text-xs text-cream-2">
                    <item.icon className="h-3.5 w-3.5 text-g-blue shrink-0" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-g-purple/20 bg-navy-2 p-7">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex h-10 w-10 items-center justify-center rounded border border-g-purple/30 bg-g-purple/10">
                  <Monitor className="h-5 w-5 text-g-purple" />
                </div>
                <h3 className="font-serif text-xl font-bold text-cream">
                  Command Center
                </h3>
              </div>
              <p className="text-sm text-muted leading-relaxed mb-5">
                Watch agents work in real-time, guide their research with
                interactive chat, and steer the analysis as new questions
                emerge. Full transparency into every step.
              </p>
              <ul className="space-y-2.5">
                {[
                  { icon: Target, text: "Real-time agent activity feed" },
                  { icon: FileText, text: "Interactive chat with agents" },
                  { icon: BarChart3, text: "Live finding updates" },
                ].map((item) => (
                  <li key={item.text} className="flex items-center gap-2 text-xs text-cream-2">
                    <item.icon className="h-3.5 w-3.5 text-g-purple shrink-0" />
                    {item.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-navy-2 py-20">
        <div className="mx-auto max-w-4xl px-6 lg:px-9 text-center">
          <Anchor className="h-8 w-8 text-gold/40 mx-auto mb-6" />
          <h2 className="font-serif text-3xl font-bold text-cream sm:text-4xl">
            Ready to Transform Your Credit Research?
          </h2>
          <p className="mt-4 text-muted max-w-2xl mx-auto">
            Join leading private credit firms using Galleon to make faster,
            more informed investment decisions.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/about">
              <Button size="lg" variant="outline">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
