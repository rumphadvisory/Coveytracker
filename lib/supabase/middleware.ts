import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from "./env";

// The marketing site, demo and sign-in are public; everything else is the app.
const PUBLIC_PATHS = ["/", "/login", "/demo", "/auth", "/robots.txt"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!supabaseConfigured) {
    return response; // not configured yet — the landing page explains setup
  }

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => (p === "/" ? path === "/" : path.startsWith(p)));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Already signed in: skip the sign-in form. (The home page stays viewable; it links to the app.)
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/field";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
