// TODO: Re-enable Clerk middleware once valid API keys are configured
// import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// TEMPORARY: Bypass all auth — all routes are public
export default function middleware(_req: NextRequest) {
  return NextResponse.next();
}

/*
 * ORIGINAL CLERK MIDDLEWARE (restore when keys are set up):
 *
 * import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
 *
 * const isPublicRoute = createRouteMatcher([
 *   "/", "/pricing", "/about", "/sign-in(.*)", "/sign-up(.*)", "/api/webhooks/(.*)",
 * ]);
 * const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/admin(.*)"]);
 * const isProtectedRoute = createRouteMatcher([
 *   "/dashboard(.*)", "/command-center(.*)", "/deals(.*)", "/missions(.*)",
 *   "/documents(.*)", "/account(.*)", "/data-sources(.*)",
 *   "/api/user/(.*)", "/api/subscriptions/(.*)", "/api/deals/(.*)",
 *   "/api/missions/(.*)", "/api/documents/(.*)", "/api/data-sources/(.*)", "/api/upload(.*)",
 * ]);
 *
 * export default clerkMiddleware(async (auth, req) => {
 *   const { userId, sessionClaims } = await auth();
 *   if (isPublicRoute(req)) return NextResponse.next();
 *   if (isAdminRoute(req)) {
 *     if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));
 *     const metadata = sessionClaims?.metadata as { role?: string } | undefined;
 *     if (metadata?.role !== "ADMIN") return NextResponse.redirect(new URL("/", req.url));
 *   }
 *   if (isProtectedRoute(req)) {
 *     if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));
 *   }
 *   return NextResponse.next();
 * });
 */

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
