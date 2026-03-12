"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, FileText, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { SearchItem } from "@/lib/library-api";

export function SearchDialog({ items }: { items: SearchItem[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results =
    query.length > 0
      ? items.filter(
          (item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) ||
            item.excerpt.toLowerCase().includes(query.toLowerCase()) ||
            item.category.toLowerCase().includes(query.toLowerCase())
        )
      : [];

  const openDialog = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const navigateTo = useCallback(
    (slug: string) => {
      closeDialog();
      router.push(`/docs/${slug}`);
    },
    [closeDialog, router]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) closeDialog();
        else openDialog();
      }
      if (e.key === "Escape" && isOpen) {
        closeDialog();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, openDialog, closeDialog]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      navigateTo(results[selectedIndex].slug);
    }
  };

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={openDialog}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <Search size={15} />
        <span className="hidden sm:inline">Search...</span>
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 dark:bg-gray-700 rounded">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      {/* Search modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeDialog}
          />
          <div className="relative max-w-xl mx-auto mt-[15vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {/* Search input */}
            <div className="flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
              <Search
                size={18}
                className="text-gray-400 dark:text-gray-500 shrink-0"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search documentation..."
                className="flex-1 px-3 py-3 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
              <button
                onClick={closeDialog}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={16} />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto">
              {query.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Type to search documentation
                </div>
              )}
              {query.length > 0 && results.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No results for &ldquo;{query}&rdquo;
                </div>
              )}
              {results.length > 0 && (
                <ul className="py-2">
                  {results.map((item, i) => (
                    <li key={item.slug}>
                      <button
                        onClick={() => navigateTo(item.slug)}
                        onMouseEnter={() => setSelectedIndex(i)}
                        className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                          i === selectedIndex
                            ? "bg-blue-50 dark:bg-blue-950/50"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <FileText
                          size={16}
                          className="mt-0.5 shrink-0 text-gray-400 dark:text-gray-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {item.title}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
                              {item.category}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                            {item.excerpt}
                          </p>
                        </div>
                        {i === selectedIndex && (
                          <ArrowRight
                            size={14}
                            className="mt-1 shrink-0 text-blue-500"
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer hints */}
            {results.length > 0 && (
              <div className="flex items-center gap-4 px-4 py-2 text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700">
                <span>
                  <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">
                    &uarr;&darr;
                  </kbd>{" "}
                  to navigate
                </span>
                <span>
                  <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">
                    Enter
                  </kbd>{" "}
                  to select
                </span>
                <span>
                  <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[10px]">
                    Esc
                  </kbd>{" "}
                  to close
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
