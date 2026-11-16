import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { SiteFooter } from "@/components/public/SiteFooter";
import { Providers } from "./providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "REALORA",
    template: "%s · REALORA",
  },
  description:
    "Discover homes and coordinate the entire transaction in one place.",
  icons: {
    icon: [
      { url: "/favicon.ico?v=realora2", sizes: "any" },
      { url: "/icon.png?v=realora2", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png?v=realora2", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full antialiased`}>
      <body className="min-h-full bg-cream font-sans text-forest">
        <Providers>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-lime focus:px-4 focus:py-2"
          >
            Skip to content
          </a>
          <Suspense fallback={<div className="h-14 border-b border-line bg-cream" />}>
            <Header />
          </Suspense>
          {children}
          <Suspense fallback={null}>
            <SiteFooter />
          </Suspense>
        </Providers>
      </body>
    </html>
  );
}
