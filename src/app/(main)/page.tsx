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
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Galleon - Private Credit Intelligence, Powered by AI Agents",
  description:
    "Galleon is the AI-powered platform for private credit research, due diligence, and deal analysis. Deploy autonomous agents to surface insights faster.",
};

export default function LandingPage() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-blue-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-4 py-1.5 text-sm text-blue-300 mb-8">
            <Zap className="h-4 w-4" />
            AI-Powered Private Credit Research
          </div>
          <h1 className="text-4xl font-bold sm:text-6xl tracking-tight">
            Private Credit Intelligence,
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">
              Powered by AI Agents
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-300 max-w-3xl mx-auto leading-relaxed">
            Deploy autonomous AI agents to research deals, audit documents, and
            surface critical findings across your private credit portfolio.
            Galleon turns weeks of due diligence into hours.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="bg-blue-600 hover:bg-blue-700 text-white px-8"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
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

      {/* Agent Cards */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Your AI Research Team
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Three specialized agents work together to deliver comprehensive
              private credit intelligence.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {/* Research Agent */}
            <div className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 text-blue-600 mb-6">
                <Search className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">
                Research Agent
              </h3>
              <p className="mt-3 text-slate-600 leading-relaxed">
                Autonomously gathers and synthesizes information from credit
                agreements, financial statements, market data, and public
                filings to build a comprehensive deal picture.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Document parsing and extraction
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Financial covenant analysis
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Comparable deal benchmarking
                </li>
              </ul>
            </div>

            {/* Auditor Agent */}
            <div className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 mb-6">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">
                Auditor Agent
              </h3>
              <p className="mt-3 text-slate-600 leading-relaxed">
                Validates findings, cross-references data sources, and flags
                inconsistencies. Assigns confidence scores to every insight so
                you know what to trust.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Cross-source verification
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Red flag detection
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Confidence scoring
                </li>
              </ul>
            </div>

            {/* Master Orchestrator */}
            <div className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-purple-100 text-purple-600 mb-6">
                <Brain className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">
                Master Orchestrator
              </h3>
              <p className="mt-3 text-slate-600 leading-relaxed">
                Coordinates the research and audit agents, manages task
                dependencies, and synthesizes a final recommendation with full
                audit trail.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  Multi-agent coordination
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  Dynamic task planning
                </li>
                <li className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                  Final synthesis and reporting
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-slate-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-slate-900">
              Agent-Powered Performance
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600">10x</div>
              <p className="mt-2 text-slate-600">Faster Due Diligence</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600">500+</div>
              <p className="mt-2 text-slate-600">Document Types Supported</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600">95%</div>
              <p className="mt-2 text-slate-600">Finding Accuracy</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600">24/7</div>
              <p className="mt-2 text-slate-600">Autonomous Research</p>
            </div>
          </div>
        </div>
      </section>

      {/* Dual Mode Section */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
              Two Ways to Work
            </h2>
            <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
              Choose how you want to interact with your AI agents based on
              the task at hand.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Mission Mode */}
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <Compass className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">
                  Mission Mode
                </h3>
              </div>
              <p className="text-slate-600 leading-relaxed mb-6">
                Define your research objective, set success criteria, and let
                the agents run autonomously. Come back to a complete report
                with findings, confidence scores, and recommendations.
              </p>
              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-blue-600 shrink-0" />
                  Set-and-forget research missions
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  Automated report generation
                </li>
                <li className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600 shrink-0" />
                  Confidence-scored findings
                </li>
              </ul>
            </div>

            {/* Command Center */}
            <div className="rounded-2xl border-2 border-purple-200 bg-purple-50/50 p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-600 text-white">
                  <Monitor className="h-6 w-6" />
                </div>
                <h3 className="text-2xl font-bold text-slate-900">
                  Command Center
                </h3>
              </div>
              <p className="text-slate-600 leading-relaxed mb-6">
                Watch agents work in real-time, guide their research with
                interactive chat, and steer the analysis as new questions
                emerge. Full transparency into every step.
              </p>
              <ul className="space-y-3 text-sm text-slate-700">
                <li className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-purple-600 shrink-0" />
                  Real-time agent activity feed
                </li>
                <li className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-600 shrink-0" />
                  Interactive chat with agents
                </li>
                <li className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-purple-600 shrink-0" />
                  Live finding updates
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Ready to Transform Your Credit Research?
          </h2>
          <p className="mt-4 text-lg text-blue-100 max-w-2xl mx-auto">
            Join leading private credit firms using Galleon to make faster,
            more informed investment decisions.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="bg-white text-blue-600 hover:bg-blue-50 px-8"
              >
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/about">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10"
              >
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
