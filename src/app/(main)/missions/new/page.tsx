"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Compass, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface DealOption {
  id: string;
  name: string;
}

const selectClasses =
  "w-full rounded-lg border border-border bg-navy-3 px-3 py-2 text-sm text-cream-2 font-mono focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold";

export default function NewMissionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedDealId = searchParams.get("dealId") || "";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<DealOption[]>([]);

  const [form, setForm] = useState({
    title: "",
    objective: "",
    successCriteria: "",
    mode: "AUTONOMOUS" as "AUTONOMOUS" | "INTERACTIVE",
    dealId: preselectedDealId,
  });

  useEffect(() => {
    fetch("/api/deals")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setDeals(data.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
        }
      })
      .catch(() => {});
  }, []);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const body = {
        title: form.title,
        objective: form.objective,
        successCriteria: form.successCriteria || undefined,
        mode: form.mode,
        dealId: form.dealId || undefined,
      };

      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create mission");
      }

      const mission = await res.json();
      router.push(`/missions/${mission.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:px-9">
      <Link
        href="/missions"
        className="inline-flex items-center gap-1 text-xs font-mono text-muted hover:text-gold transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Missions
      </Link>

      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h1 className="section-title">Create New Mission</h1>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-g-red/30 bg-g-red/10 p-3 text-sm text-g-red">
                {error}
              </div>
            )}

            <div>
              <label className="label-mono block mb-1.5">
                Mission Title <span className="text-g-red">*</span>
              </label>
              <Input
                value={form.title}
                onChange={(e) => updateField("title", e.target.value)}
                placeholder="e.g., Due Diligence Review - Acme Corp"
                required
              />
            </div>

            <div>
              <label className="label-mono block mb-1.5">
                Objective <span className="text-g-red">*</span>
              </label>
              <Textarea
                value={form.objective}
                onChange={(e) => updateField("objective", e.target.value)}
                placeholder="Describe what you want the AI agents to research and analyze..."
                rows={4}
                required
              />
            </div>

            <div>
              <label className="label-mono block mb-1.5">Success Criteria</label>
              <Textarea
                value={form.successCriteria}
                onChange={(e) => updateField("successCriteria", e.target.value)}
                placeholder="What does a successful mission look like?"
                rows={3}
              />
            </div>

            {/* Mode Selection */}
            <div>
              <label className="label-mono block mb-3">
                Mission Mode <span className="text-g-red">*</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => updateField("mode", "AUTONOMOUS")}
                  className={cn(
                    "rounded-lg border-2 p-4 text-left transition-all",
                    form.mode === "AUTONOMOUS"
                      ? "border-g-blue bg-g-blue/5"
                      : "border-border hover:border-border-2"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Compass className="h-4 w-4 text-g-blue" />
                    <span className="font-mono text-xs font-bold tracking-wide text-cream-2">
                      Autonomous
                    </span>
                  </div>
                  <p className="text-[11px] text-muted">
                    Agents run independently and deliver a final report.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => updateField("mode", "INTERACTIVE")}
                  className={cn(
                    "rounded-lg border-2 p-4 text-left transition-all",
                    form.mode === "INTERACTIVE"
                      ? "border-g-purple bg-g-purple/5"
                      : "border-border hover:border-border-2"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="h-4 w-4 text-g-purple" />
                    <span className="font-mono text-xs font-bold tracking-wide text-cream-2">
                      Interactive
                    </span>
                  </div>
                  <p className="text-[11px] text-muted">
                    Guide agents in real-time via the Command Center.
                  </p>
                </button>
              </div>
            </div>

            <div>
              <label className="label-mono block mb-1.5">Associated Deal</label>
              <select
                value={form.dealId}
                onChange={(e) => updateField("dealId", e.target.value)}
                className={selectClasses}
              >
                <option value="">No deal selected</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Link href="/missions">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Mission
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
