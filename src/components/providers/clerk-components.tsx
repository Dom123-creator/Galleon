"use client";

import {
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
  UserButton as ClerkUserButton,
} from "@clerk/nextjs";
import { ReactNode } from "react";

// Check if Clerk is properly configured
function isClerkConfigured(): boolean {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return Boolean(
    key && key.startsWith("pk_") && key.length > 50 && !key.includes("placeholder")
  );
}

// Conditional SignedIn - shows children when authenticated OR when Clerk isn't configured
export function SignedIn({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    // When Clerk isn't configured, don't show authenticated content
    return null;
  }
  return <ClerkSignedIn>{children}</ClerkSignedIn>;
}

// Conditional SignedOut - shows children when not authenticated OR when Clerk isn't configured
export function SignedOut({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    // When Clerk isn't configured, show sign-in/sign-up buttons
    return <>{children}</>;
  }
  return <ClerkSignedOut>{children}</ClerkSignedOut>;
}

// Conditional UserButton - only renders when Clerk is configured
interface UserButtonProps {
  afterSignOutUrl?: string;
  appearance?: {
    elements?: {
      avatarBox?: string;
    };
  };
}

export function UserButton(props: UserButtonProps) {
  if (!isClerkConfigured()) {
    return null;
  }
  return <ClerkUserButton {...props} />;
}
