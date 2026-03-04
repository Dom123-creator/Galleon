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

// Conditional SignedIn - shows children when authenticated OR when Clerk isn't configured (dev mode)
export function SignedIn({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    // Dev mode: treat as signed in
    return <>{children}</>;
  }
  return <ClerkSignedIn>{children}</ClerkSignedIn>;
}

// Conditional SignedOut - shows children when not authenticated
export function SignedOut({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    // Dev mode: treat as signed in, hide sign-out content
    return null;
  }
  return <ClerkSignedOut>{children}</ClerkSignedOut>;
}

// Conditional UserButton - shows dev indicator when Clerk isn't configured
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
    return (
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
          D
        </div>
      </div>
    );
  }
  return <ClerkUserButton {...props} />;
}
