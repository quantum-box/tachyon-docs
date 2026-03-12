import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tachyon Docs",
  description: "Tachyon Platform Documentation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-white text-gray-900 antialiased">
        <header className="border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
            <a href="/" className="text-xl font-bold text-gray-900">
              Tachyon Docs
            </a>
            <span className="text-sm text-gray-500">Platform Documentation</span>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-200 mt-16">
          <div className="max-w-5xl mx-auto px-4 py-6 text-sm text-gray-500">
            Quantum Box, Inc.
          </div>
        </footer>
      </body>
    </html>
  );
}
