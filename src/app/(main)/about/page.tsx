import { Metadata } from "next";
import Link from "next/link";
import { Search, ShieldCheck, Brain, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn about Galleon - the AI-powered private credit intelligence platform.",
};

export default function AboutPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-blue-900 text-white">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold sm:text-5xl">
            Private Credit Intelligence,
            <span className="block text-blue-400">Reimagined</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-2xl mx-auto">
            Galleon deploys autonomous AI agents to transform how private credit
            professionals research deals, audit documents, and surface critical
            insights.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg max-w-none">
            <h2 className="text-3xl font-bold text-slate-900 text-center mb-8">
              Our Mission
            </h2>
            <p className="text-slate-600 text-center">
              Private credit due diligence is time-intensive, document-heavy, and
              prone to human oversight. We built Galleon to augment credit
              professionals with AI agents that never miss a covenant clause,
              never overlook a red flag, and never tire.
            </p>
            <p className="text-slate-600 text-center">
              By combining specialized research, audit, and orchestration agents,
              Galleon turns weeks of manual analysis into hours of intelligent,
              confidence-scored insights your team can trust.
            </p>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
            What Sets Us Apart
          </h2>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600 mb-4">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Deep Research
              </h3>
              <p className="mt-2 text-slate-600">
                AI agents autonomously parse credit agreements, financials, and
                market data to build comprehensive deal profiles.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Verified Insights
              </h3>
              <p className="mt-2 text-slate-600">
                Every finding is cross-referenced and scored for confidence,
                so you know exactly what to trust and what to investigate.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-purple-600 mb-4">
                <Brain className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Intelligent Orchestration
              </h3>
              <p className="mt-2 text-slate-600">
                A master orchestrator coordinates multiple specialized agents,
                ensuring thorough coverage and synthesized recommendations.
              </p>
            </div>

            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 mb-4">
                <Briefcase className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                Built for Credit Pros
              </h3>
              <p className="mt-2 text-slate-600">
                Designed specifically for private credit analysts, portfolio
                managers, and deal teams who need speed without sacrificing rigor.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Philosophy */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-8">
            Our Platform Philosophy
          </h2>

          <div className="space-y-6 text-slate-600">
            <div className="rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">
                Agents, Not Chatbots
              </h3>
              <p>
                Galleon deploys purpose-built AI agents that execute multi-step
                research workflows autonomously. This is not a chat interface
                bolted onto an LLM -- it is a coordinated agent system designed
                for structured credit analysis.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">
                Confidence Over Certainty
              </h3>
              <p>
                Every finding comes with a confidence score and source
                attribution. We believe in transparency -- you should always
                know why a conclusion was reached and how reliable it is.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900 mb-2">
                Your Data, Your Control
              </h3>
              <p>
                Documents and deal data are encrypted at rest and in transit.
                Enterprise customers get dedicated infrastructure, SSO, and
                full audit trails. Your proprietary information never trains
                our models.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white">
            Ready to Get Started?
          </h2>
          <p className="mt-4 text-lg text-blue-100">
            Join leading private credit firms transforming their due diligence
            with Galleon.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50">
                Start Free Trial
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
              >
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Get in Touch
          </h2>
          <p className="text-slate-600 mb-6">
            Questions, feedback, or enterprise inquiries? We&apos;d love to hear
            from you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
            <a
              href="mailto:support@galleon.ai"
              className="text-blue-600 hover:text-blue-700"
            >
              support@galleon.ai
            </a>
            <span className="hidden sm:inline text-slate-300">|</span>
            <a
              href="mailto:sales@galleon.ai"
              className="text-blue-600 hover:text-blue-700"
            >
              sales@galleon.ai
            </a>
            <span className="hidden sm:inline text-slate-300">|</span>
            <a
              href="mailto:enterprise@galleon.ai"
              className="text-blue-600 hover:text-blue-700"
            >
              enterprise@galleon.ai
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
