import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { SidebarProvider } from "@/components/providers/SidebarProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SidebarToggle } from "@/components/SidebarToggle";
import { Sidebar } from "@/components/Sidebar";
import { SearchDialog } from "@/components/SearchDialog";
import {
  getCategories,
  toSearchItems,
  type Category,
  type SearchItem,
} from "@/lib/library-api";
import { BookOpen } from "lucide-react";

export const metadata: Metadata = {
  title: {
    default: "Tachyon Docs",
    template: "%s | Tachyon Docs",
  },
  description: "Tachyon Platform Documentation - クラウドプラットフォームの公式ドキュメント",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://docs.txcloud.app"
  ),
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "Tachyon Docs",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let categories: Category[] = [];
  let searchItems: SearchItem[] = [];

  try {
    categories = await getCategories();
    const allDocs = categories.flatMap((c) => c.documents);
    searchItems = toSearchItems(allDocs);
  } catch {
    // API may be unreachable; render with empty navigation
  }

  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">
        <ThemeProvider>
          <SidebarProvider>
            <div className="min-h-screen flex flex-col">
              {/* Header */}
              <header className="sticky top-0 z-30 h-14 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md">
                <div className="flex items-center h-full px-4 gap-3">
                  <SidebarToggle />
                  <Link
                    href="/"
                    className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <BookOpen size={20} />
                    <span className="hidden sm:inline">Tachyon Docs</span>
                  </Link>
                  <div className="flex-1" />
                  <SearchDialog items={searchItems} />
                  <ThemeToggle />
                </div>
              </header>

              {/* Body */}
              <div className="flex flex-1">
                <Sidebar categories={categories} />
                <div className="flex-1 min-w-0">{children}</div>
              </div>
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
