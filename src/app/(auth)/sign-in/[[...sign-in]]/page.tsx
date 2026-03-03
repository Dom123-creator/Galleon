import { SignIn } from "@clerk/nextjs";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your EpicTale account",
};

export default function SignInPage() {
  return (
    <div className="text-center">
      <Link href="/" className="inline-flex items-center gap-2 mb-8">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
          <span className="text-white font-bold text-xl">F</span>
        </div>
        <span className="font-bold text-2xl text-white">EpicTale</span>
      </Link>

      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-white shadow-xl rounded-xl",
            headerTitle: "text-slate-900",
            headerSubtitle: "text-slate-600",
            socialButtonsBlockButton:
              "border-slate-300 hover:bg-slate-50 text-slate-700",
            formFieldLabel: "text-slate-700",
            formFieldInput:
              "border-slate-300 focus:border-blue-500 focus:ring-blue-500",
            footerActionLink: "text-blue-600 hover:text-blue-700",
            formButtonPrimary:
              "bg-blue-600 hover:bg-blue-700 text-white normal-case",
          },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
      />

      <p className="mt-6 text-sm text-slate-400">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="text-blue-400 hover:text-blue-300">
          Start your free trial
        </Link>
      </p>
    </div>
  );
}
