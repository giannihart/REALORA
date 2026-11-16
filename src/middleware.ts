import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const hits = new Map<string, { count: number; reset: number }>();

function rateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = hits.get(key);
  if (!row || row.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  row.count += 1;
  return row.count > limit;
}

function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const ip = clientIp(request);
  if (path.startsWith("/auth") && rateLimited(`auth:${ip}`, 30, 60_000)) {
    return new NextResponse("Too many auth attempts. Try again in a minute.", { status: 429 });
  }
  if (path.startsWith("/invite") && rateLimited(`invite:${ip}`, 20, 60_000)) {
    return new NextResponse("Too many invite attempts. Try again in a minute.", { status: 429 });
  }
  if (
    path.startsWith("/api/public/acris-lookup") &&
    rateLimited(`acris:${ip}`, 12, 60_000)
  ) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const mode = process.env.NEXT_PUBLIC_DATA_MODE;
  if (mode !== "supabase" && mode !== "production") {
    return NextResponse.next();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.next();

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/portal") && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/auth";
    redirect.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirect);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
