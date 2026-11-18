// Password protection for the admin pages (HTTP Basic auth). Any user name, password = ADMIN_PASSWORD.
// Without ADMIN_PASSWORD concert, the admin pages do not exist (404).
import { NextResponse, type NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  // Compare in constant time so the password cannot be guessed from response times.
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function proxy(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return new NextResponse("Not found", { status: 404 });
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [, given = ""] = atob(header.slice(6)).split(/:(.*)/s);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {
      // malformed header: ask again
    }
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="FullDJSet admin", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/admin", "/admin/:path*"] };
