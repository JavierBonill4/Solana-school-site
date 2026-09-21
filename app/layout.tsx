import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { TopBar } from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Solana School",
  description:
    "Learn Solana: community developer resources, challenges, and a place to track your progress.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700;800&family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,400&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
      </head>
      <body>
        <Providers>
          <TopBar />
          <main className="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
