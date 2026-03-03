"use client";

import { ClerkProvider as BaseClerkProvider } from "@clerk/nextjs";
import { ReactNode } from "react";

interface ClerkProviderProps {
  children: ReactNode;
}

export function ClerkProvider({ children }: ClerkProviderProps) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  // Check if we have a valid-looking publishable key (not a placeholder)
  // Valid Clerk keys are longer than 50 characters and don't contain "placeholder"
  const hasValidKey =
    publishableKey &&
    publishableKey.startsWith("pk_") &&
    publishableKey.length > 50 &&
    !publishableKey.includes("placeholder");

  // During build or when key is invalid, render children without Clerk
  if (!hasValidKey) {
    return <>{children}</>;
  }

  return (
    <BaseClerkProvider publishableKey={publishableKey}>
      {children}
    </BaseClerkProvider>
  );
}
