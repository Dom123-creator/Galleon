import { Metadata } from "next";
import Link from "next/link";
import { Search, ShieldCheck, Brain, Briefcase, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Galleon - the AI-powered private credit intelligence platform.",
};

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative border-b border-border bg-navy-2">
        <div className="mx-auto max-w-4xl px-6 py-20 lg:px-9 text-center">
          <p className="section-title mb-4">About Galleon</p>
          <h1 className="font-serif text-4xl font-bold text-cream sm:text-5xl">
            Private Credit Intelligence,
            <span className="block text-gold mt-2">Reimagined</span>
          </h1>
          <p className="mt-6 text-muted max-w-2xl mx-auto">
            Galleon deploys autonomous AI agents to transform how private credit
            professionals research deals, audit documents, and surface critical
            insights.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-9">
          <h2 className="font-serif text-3xl font-bold text-cream text-center mb-8">
            Our Mission
          </h2>
          <div className="space-y-4 text-sm text-muted text-center max-w-3xl mx-auto">
            <p>
              Private credit due diligence is time-intensive, document-heavy, and
              prone to human oversight. We built Galleon to augment credit
              professionals with AI agents that never miss a covenant clause,
              never overlook a red flag, and never tire.
            </p>
            <p>
              By combining specialized research, audit, and orchestration agents,
              Galleon turns weeks of manual analysis into hours of intelligent,
              confidence-scored insights your team can trust.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="border-y border-border bg-navy-2 py-16 sm:py-24">
        <div className="mx-auto max-w-[1400px] px-6 lg:px-9">
          <p className="section-title text-center mb-3">Capabilities</p>
          <h2 className="font-serif text-3xl font-bold text-cream text-center mb-12">
            What Sets Us Apart
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Search, color: "text-g-blue", title: "Deep Research", desc: "AI agents autonomously parse credit agreements, financials, and market data to build comprehensive deal profiles." },
              { icon: ShieldCheck, color: "text-g-green", title: "Verified Insights", desc: "Every finding is cross-referenced and scored for confidence, so you know exactly what to trust." },
              { icon: Brain, color: "text-g-purple", title: "Intelligent Orchestration", desc: "A master orchestrator coordinates multiple specialized agents, ensuring thorough coverage." },
              { icon: Briefcase, color: "text-gold", title: "Built for Credit Pros", desc: "Designed for private credit analysts, portfolio managers, and deal teams who need speed without sacrificing rigor." },
            ].map((item) => (
              <div key={item.title} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-navy-3 mb-4">
                  <item.icon className={`h-7 w-7 ${item.color}`} />
                </div>
                <h3 className="font-serif text-base font-semibold text-cream">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6 lg:px-9">
          <p className="section-title text-center mb-3">Philosophy</p>
          <h2 className="font-serif text-3xl font-bold text-cream text-center mb-8">
            Our Platform Philosophy
          </h2>

          <div className="space-y-4">
            {[
              { title: "Agents, Not Chatbots", desc: "Galleon deploys purpose-built AI agents that execute multi-step research workflows autonomously. This is not a chat interface bolted onto an LLM — it is a coordinated agent system designed for structured credit analysis." },
              { title: "Confidence Over Certainty", desc: "Every finding comes with a confidence score and source attribution. We believe in transparency — you should always know why a conclusion was reached and how reliable it is." },
              { title: "Your Data, Your Control", desc: "Documents and deal data are encrypted at rest and in transit. Enterprise customers get dedicated infrastructure, SSO, and full audit trails. Your proprietary information never trains our models." },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-border bg-navy-2 p-6">
                <h3 className="font-mono text-sm font-semibold text-cream-2 mb-2">{item.title}</h3>
                <p className="text-sm text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-navy-2 py-16">
        <div className="mx-auto max-w-4xl px-6 lg:px-9 text-center">
          <Anchor className="h-7 w-7 text-gold/40 mx-auto mb-5" />
          <h2 className="font-serif text-3xl font-bold text-cream">
            Ready to Get Started?
          </h2>
          <p className="mt-4 text-muted">
            Join leading private credit firms transforming their due diligence with Galleon.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg">Start Free Trial</Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline">View Pricing</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-border py-16">
        <div className="mx-auto max-w-4xl px-6 lg:px-9 text-center">
          <h2 className="font-serif text-2xl font-bold text-cream mb-4">
            Get in Touch
          </h2>
          <p className="text-sm text-muted mb-6">
            Questions, feedback, or enterprise inquiries? We&apos;d love to hear from you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center text-xs font-mono">
            <a href="mailto:support@galleon.ai" className="text-gold hover:text-gold-2">support@galleon.ai</a>
            <span className="hidden sm:inline text-border-2">|</span>
            <a href="mailto:sales@galleon.ai" className="text-gold hover:text-gold-2">sales@galleon.ai</a>
            <span className="hidden sm:inline text-border-2">|</span>
            <a href="mailto:enterprise@galleon.ai" className="text-gold hover:text-gold-2">enterprise@galleon.ai</a>
          </div>
        </div>
      </section>
    </div>
  );
}
