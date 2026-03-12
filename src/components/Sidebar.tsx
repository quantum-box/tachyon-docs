"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, FileText, X } from "lucide-react";
import { useState } from "react";
import { useSidebar } from "./providers/SidebarProvider";
import type { Category } from "@/lib/library-api";

function SidebarContent({
  categories,
  pathname,
}: {
  categories: Category[];
  pathname: string;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCategory = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (categories.length === 0) {
    return (
      <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
        No documents available
      </div>
    );
  }

  return (
    <nav className="px-3 py-4 space-y-1">
      {categories.map((cat) => (
        <div key={cat.key}>
          <button
            onClick={() => toggleCategory(cat.key)}
            className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            <span>{cat.name}</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${collapsed[cat.key] ? "-rotate-90" : ""}`}
            />
          </button>
          {!collapsed[cat.key] && (
            <ul className="mt-0.5 space-y-0.5">
              {cat.documents.map((doc) => {
                const href = `/docs/${doc.slug}`;
                const isActive = pathname === href;
                return (
                  <li key={doc.id}>
                    <Link
                      href={href}
                      className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-700 font-medium dark:bg-blue-950 dark:text-blue-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      }`}
                    >
                      <FileText size={14} className="shrink-0 opacity-50" />
                      <span className="truncate">{doc.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ categories }: { categories: Category[] }) {
  const { isOpen, close } = useSidebar();
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-y-auto h-[calc(100vh-3.5rem)] sticky top-14">
        <SidebarContent categories={categories} pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={close}
          />
          <div className="absolute left-0 top-0 h-full w-72 bg-white dark:bg-gray-950 shadow-xl overflow-y-auto animate-slide-in">
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-gray-800">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                Navigation
              </span>
              <button
                onClick={close}
                className="p-1 rounded-md text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} />
              </button>
            </div>
            <SidebarContent categories={categories} pathname={pathname} />
          </div>
        </div>
      )}
    </>
  );
}
