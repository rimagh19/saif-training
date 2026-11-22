import type { Metadata, Viewport } from "next";
import "@fontsource/noto-naskh-arabic/400.css";
import "@fontsource/noto-naskh-arabic/700.css";
import "./globals.css";
import { getDict } from "@/lib/i18n-server";
import { dirOf } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDict();
  return { title: { default: d.app_name, template: `%s · ${d.app_short}` }, description: d.app_name };
}

export const viewport: Viewport = { themeColor: "#1b1f2a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, d } = await getDict();
  return (
    <html lang={lang} dir={dirOf(lang)} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <I18nProvider lang={lang} dict={d}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
