"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { trKey } from "@/lib/i18n/client";
import { useClientLocale } from "@/lib/i18n/useClientLocale";

type Item = {
  href: string;
  key: "home" | "me" | "templates" | "new";
  match: (pathname: string) => boolean;
  icon: React.ReactNode;
};

const ITEMS: Item[] = [
  {
    href: "/",
    key: "home",
    match: (p) => p === "/" || p.startsWith("/projects"),
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: "/templates",
    key: "templates",
    match: (p) => p.startsWith("/templates"),
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1" strokeWidth="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
        <rect x="13" y="13" width="8" height="8" rx="1" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: "/projects/new",
    key: "new",
    match: (p) => p.startsWith("/projects/new"),
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M12 4v16m8-8H4" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/me",
    key: "me",
    match: (p) => p.startsWith("/me"),
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const locale = useClientLocale(pathname);
  const t = (key: Parameters<typeof trKey>[1]) => trKey(locale, key);

  const label = (key: Item["key"]) => {
    if (key === "home") return t("mobile.home");
    if (key === "templates") return t("mobile.templates");
    if (key === "new") return t("mobile.new");
    return t("mobile.mySpace");
  };

  return (
    <nav className="sm:hidden fixed left-1/2 -translate-x-1/2 w-[min(90vw,20rem)] mobile-safe-bottom z-40 rounded-2xl border border-gray-200/80 dark:border-gray-700/80 bg-white/94 dark:bg-gray-900/94 backdrop-blur-xl shadow-[0_18px_40px_-24px_rgba(15,23,42,0.5)]">
      <ul className="grid grid-cols-4 gap-0.5 p-1">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={[
                  "flex flex-col items-center justify-center min-h-10 rounded-xl text-[9px] font-medium",
                  active
                    ? "text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40"
                    : "text-gray-500 dark:text-gray-400",
                ].join(" ")}
              >
                {item.icon}
                <span className="mt-0.5">{label(item.key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
