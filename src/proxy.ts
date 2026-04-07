import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/i18n/config";

const { auth } = NextAuth(authConfig);

function detectPreferredLocale(pathname: string, cookieLocale?: string): "fr" | "en" {
  if (cookieLocale && isLocale(cookieLocale)) return cookieLocale;
  // Keep login/register in French by default if no preference saved yet.
  if (pathname === "/login" || pathname === "/register") return DEFAULT_LOCALE;
  return DEFAULT_LOCALE;
}

export default auth((request) => {
  const { nextUrl, cookies } = request;
  const { pathname } = nextUrl;

  // Skip API/internal/static files and direct file requests.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const maybeLocale = pathname.split("/")[1] ?? "";
  const hasLocale = isLocale(maybeLocale);
  const cookieLocale = cookies.get(LOCALE_COOKIE)?.value;

  if (!hasLocale) {
    const locale = detectPreferredLocale(pathname, cookieLocale);
    const url = nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    const response = NextResponse.redirect(url);
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  }

  const locale = maybeLocale as "fr" | "en";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-taskapp-locale", locale);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  if (cookieLocale !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
