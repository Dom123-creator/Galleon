"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Compass, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface DealOption {
  id: string;
  name: string;
}

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
      .catch(() => {
        // Silently fail - deals dropdown will be empty
      });
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
    <div className="bg-slate-50 min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href="/missions"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Missions
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Create New Mission</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Mission Title <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  placeholder="e.g., Due Diligence Review - Acme Corp"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Objective <span className="text-red-500">*</span>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Success Criteria
                </label>
                <Textarea
                  value={form.successCriteria}
                  onChange={(e) =>
                    updateField("successCriteria", e.target.value)
                  }
                  placeholder="What does a successful mission look like? e.g., Identify all covenant terms, flag any red flags..."
                  rows={3}
                />
              </div>

              {/* Mode Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Mission Mode <span className="text-red-500">*</span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateField("mode", "AUTONOMOUS")}
                    className={cn(
                      "rounded-xl border-2 p-4 text-left transition-colors",
                      form.mode === "AUTONOMOUS"
                        ? "border-blue-600 bg-blue-50"
                        : "border-slate-200 hover:border-blue-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Compass className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold text-slate-900">
                        Autonomous
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Agents run independently and deliver a final report.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateField("mode", "INTERACTIVE")}
                    className={cn(
                      "rounded-xl border-2 p-4 text-left transition-colors",
                      form.mode === "INTERACTIVE"
                        ? "border-purple-600 bg-purple-50"
                        : "border-slate-200 hover:border-purple-300"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Monitor className="h-5 w-5 text-purple-600" />
                      <span className="font-semibold text-slate-900">
                        Interactive
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Guide agents in real-time via the Command Center.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Associated Deal
                </label>
                <select
                  value={form.dealId}
                  onChange={(e) => updateField("dealId", e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">No deal selected</option>
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
