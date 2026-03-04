"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface AccountSettingsProps {
  name: string;
  email: string;
  emailNotifications: boolean;
  newContentAlerts: boolean;
}

export function AccountSettings({
  name: initialName,
  email,
  emailNotifications: initialEmailNotifications,
  newContentAlerts: initialNewContentAlerts,
}: AccountSettingsProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(initialName);
  const [emailNotifications, setEmailNotifications] = useState(
    initialEmailNotifications
  );
  const [newContentAlerts, setNewContentAlerts] = useState(
    initialNewContentAlerts
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/user/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          emailNotifications,
          newContentAlerts,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update settings");
      }

      addToast({
        type: "success",
        title: "Settings updated",
        description: "Your account settings have been saved.",
      });

      router.refresh();
    } catch (error) {
      addToast({
        type: "error",
        title: "Failed to update settings",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Input
        label="Display Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
      />

      <Input
        label="Email"
        value={email}
        disabled
        helperText="Email cannot be changed here. Contact support if needed."
      />

      <div className="space-y-4">
        <h4 className="label-mono">Email Preferences</h4>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={emailNotifications}
            onChange={(e) => setEmailNotifications(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-navy-3 text-gold focus:ring-gold/30"
          />
          <div>
            <span className="text-sm text-cream-2">
              Email notifications
            </span>
            <p className="text-xs text-muted">
              Receive updates about your subscription and account
            </p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={newContentAlerts}
            onChange={(e) => setNewContentAlerts(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-navy-3 text-gold focus:ring-gold/30"
          />
          <div>
            <span className="text-sm text-cream-2">
              New content alerts
            </span>
            <p className="text-xs text-muted">
              Get notified when new findings are published
            </p>
          </div>
        </label>
      </div>

      <Button type="submit" isLoading={isLoading}>
        Save Changes
      </Button>
    </form>
  );
}
