import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@/components/providers/clerk-provider";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Galleon - Private Credit Intelligence Platform",
    template: "%s | Galleon",
  },
  description:
    "AI-powered private credit intelligence for institutional investors. Deploy autonomous agents to research deals, analyze documents, and deliver verified intelligence recommendations.",
  keywords: [
    "private credit",
    "credit intelligence",
    "institutional investors",
    "deal analysis",
    "AI agents",
    "credit research",
    "document analysis",
  ],
  authors: [{ name: "Galleon" }],
  creator: "Galleon",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://galleon.ai",
    title: "Galleon - Private Credit Intelligence Platform",
    description:
      "AI-powered private credit intelligence for institutional investors. Autonomous agents that research, analyze, and verify deal intelligence.",
    siteName: "Galleon",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Galleon - Private Credit Intelligence Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Galleon - Private Credit Intelligence Platform",
    description:
      "AI-powered private credit intelligence for institutional investors.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className="h-full">
        <body className={`${inter.className} h-full antialiased`}>
          <ToastProvider>{children}</ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
