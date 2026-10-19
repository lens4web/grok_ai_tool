import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { cookies, headers } from "next/headers";
import { AppProvider } from "@/components/AppContext";
import { detectLocale, direction, isLocale, type LanguagePreference, type ThemePreference } from "@/lib/i18n";
import { pageMetadata, websiteSchema, SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

async function requestLocale() {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const savedLanguage = cookieStore.get("grok_language")?.value;
  return isLocale(savedLanguage) ? savedLanguage : detectLocale((requestHeaders.get("accept-language") ?? "en").split(",").map(item => item.split(";")[0].trim()));
}

export async function generateMetadata(): Promise<Metadata> { return pageMetadata(await requestLocale()); }

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const savedLanguage = cookieStore.get("grok_language")?.value;
  const language: LanguagePreference = isLocale(savedLanguage) ? savedLanguage : "system";
  const locale = language === "system" ? detectLocale((requestHeaders.get("accept-language") ?? "en").split(",").map(item => item.split(";")[0].trim())) : language;
  const savedTheme = cookieStore.get("grok_theme")?.value;
  const theme: ThemePreference = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";
  return (
    <html
      lang={locale} dir={direction(locale)} data-theme={theme} suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppProvider initialLocale={locale} initialLanguage={language} initialTheme={theme}>{children}</AppProvider>
        <script type="application/ld+json" nonce={requestHeaders.get("x-nonce") ?? undefined}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema(locale)).replace(/</g, '\\u003c') }} />
        {process.env.NODE_ENV === "production" && <Script
          id="umami-analytics"
          src="https://pulse.lens4web.com/app-script"
          strategy="afterInteractive"
          defer
          nonce={requestHeaders.get("x-nonce") ?? undefined}
          data-website-id="579c414a-8f8e-4155-af9d-a43608657e38"
          data-domains={new URL(SITE_URL).hostname}
          data-exclude-search="true"
          data-exclude-hash="true"
          data-do-not-track="true"
        />}
      </body>
    </html>
  );
}
