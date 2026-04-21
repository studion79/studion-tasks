import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { cookies, headers } from "next/headers";
import PwaRegister from "@/components/PwaRegister";
import ThemeManager from "@/components/ThemeManager";
import ZoomLock from "@/components/ZoomLock";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "@/i18n/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeInitScript = `(function(){try{var raw=localStorage.getItem("taskapp:display-prefs");var mode="system";if(raw){var parsed=JSON.parse(raw);if(parsed&&(parsed.themeMode==="light"||parsed.themeMode==="dark"||parsed.themeMode==="system")){mode=parsed.themeMode;}}var prefersDark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var dark=mode==="dark"||(mode==="system"&&prefersDark);var root=document.documentElement;root.dataset.theme=mode;root.classList.toggle("dark",dark);root.style.colorScheme=dark?"dark":"light";}catch(_e){}})();`;

export const metadata: Metadata = {
  title: "Task App",
  description: "Project and task management",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Task App",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#6366f1",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const headerLocale = headerStore.get("x-taskapp-locale") ?? "";
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value ?? "";
  const locale = isLocale(headerLocale)
    ? headerLocale
    : isLocale(cookieLocale)
      ? cookieLocale
      : DEFAULT_LOCALE;
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "vdev";

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          <ThemeManager />
          <ZoomLock />
          {children}
          <PwaRegister />
        </SessionProvider>
        <div className="pointer-events-none hidden sm:block fixed bottom-3 right-3 z-40 rounded-full border border-gray-200/80 bg-white/90 px-2.5 py-1 text-[10px] font-medium text-gray-600 shadow-sm backdrop-blur dark:border-gray-700/80 dark:bg-gray-900/85 dark:text-gray-300">
          {appVersion.startsWith("v") ? appVersion : `v${appVersion}`}
        </div>
      </body>
    </html>
  );
}
