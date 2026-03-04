"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";
import { SECTOR_DISPLAY_NAMES } from "@/lib/utils";

const SECTORS = Object.entries(SECTOR_DISPLAY_NAMES);

const selectClasses =
  "w-full rounded-lg border border-border bg-navy-3 px-3 py-2 text-sm text-cream-2 font-mono focus:outline-none focus:ring-2 focus:ring-gold/20 focus:border-gold";

export default function NewDealPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    borrowerName: "",
    lenderName: "",
    dealSize: "",
    currency: "USD",
    sector: "DIRECT_LENDING",
    tags: "",
    sourceUrl: "",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        borrowerName: form.borrowerName || undefined,
        lenderName: form.lenderName || undefined,
        dealSize: form.dealSize ? parseFloat(form.dealSize) : undefined,
        currency: form.currency || "USD",
        sector: form.sector,
        tags: form.tags
          ? form.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined,
        sourceUrl: form.sourceUrl || undefined,
      };

      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create deal");
      }

      const deal = await res.json();
      router.push(`/deals/${deal.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 lg:px-9">
      <Link
        href="/deals"
        className="inline-flex items-center gap-1 text-xs font-mono text-muted hover:text-gold transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Deals
      </Link>

      <div className="rounded-lg border border-border bg-navy-2 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h1 className="section-title">Create New Deal</h1>
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
                Deal Name <span className="text-g-red">*</span>
              </label>
              <Input
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                placeholder="e.g., Acme Corp Senior Secured Facility"
                required
              />
            </div>

            <div>
              <label className="label-mono block mb-1.5">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="Brief description of the deal..."
                rows={3}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-mono block mb-1.5">Borrower Name</label>
                <Input
                  value={form.borrowerName}
                  onChange={(e) => updateField("borrowerName", e.target.value)}
                  placeholder="Borrower entity name"
                />
              </div>
              <div>
                <label className="label-mono block mb-1.5">Lender Name</label>
                <Input
                  value={form.lenderName}
                  onChange={(e) => updateField("lenderName", e.target.value)}
                  placeholder="Lender entity name"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label-mono block mb-1.5">Deal Size</label>
                <Input
                  type="number"
                  value={form.dealSize}
                  onChange={(e) => updateField("dealSize", e.target.value)}
                  placeholder="e.g., 50000000"
                  min={0}
                  step="any"
                />
              </div>
              <div>
                <label className="label-mono block mb-1.5">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => updateField("currency", e.target.value)}
                  className={selectClasses}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CAD">CAD</option>
                  <option value="AUD">AUD</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label-mono block mb-1.5">
                Sector <span className="text-g-red">*</span>
              </label>
              <select
                value={form.sector}
                onChange={(e) => updateField("sector", e.target.value)}
                className={selectClasses}
                required
              >
                {SECTORS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-mono block mb-1.5">Tags</label>
              <Input
                value={form.tags}
                onChange={(e) => updateField("tags", e.target.value)}
                placeholder="Comma-separated tags, e.g., high-yield, sponsor-backed"
              />
              <p className="text-[11px] text-muted mt-1">
                Separate multiple tags with commas.
              </p>
            </div>

            <div>
              <label className="label-mono block mb-1.5">Source URL</label>
              <Input
                type="url"
                value={form.sourceUrl}
                onChange={(e) => updateField("sourceUrl", e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Link href="/deals">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Deal
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
