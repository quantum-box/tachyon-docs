import { getCategories } from "@/lib/library-api";
import Link from "next/link";
import { FileText, ArrowRight, BookOpen, Zap, Search } from "lucide-react";

export default async function Home() {
  let categories: Awaited<ReturnType<typeof getCategories>> = [];
  let error: string | null = null;

  try {
    categories = await getCategories();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch documents";
  }

  const totalDocs = categories.reduce(
    (sum, cat) => sum + cat.documents.length,
    0
  );

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8">
      {/* Hero */}
      <div className="py-8 lg:py-12">
        <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-gray-50 mb-3">
          Tachyon Platform Documentation
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl">
          クラウドプラットフォームの機能、設定、APIリファレンスを網羅したドキュメントです。
        </p>
        <p className="mt-3 text-sm text-blue-600 dark:text-blue-400">
          Preview deploy verification branch for March 14, 2026.
        </p>
      </div>

      {/* Quick links */}
      <div className="grid sm:grid-cols-3 gap-4 mb-12">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
            <BookOpen size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Getting Started
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              プラットフォームの基本的な使い方
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400">
            <Zap size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              API Reference
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              APIの仕様と使用例
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400">
            <Search size={18} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Quick Search
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-[10px]">
                &#8984;K
              </kbd>{" "}
              で検索
            </p>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-8">
          <p className="text-amber-800 dark:text-amber-200 text-sm">
            ドキュメントの取得に失敗しました: {error}
          </p>
          <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">
            環境変数 (LIBRARY_API_URL, LIBRARY_ORG_USERNAME, LIBRARY_REPO_USERNAME)
            を確認してください
          </p>
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 ? (
        <div className="space-y-10">
          {categories.map((cat) => (
            <section key={cat.key}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <span>{cat.name}</span>
                <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                  {cat.documents.length} docs
                </span>
              </h2>
              <div className="grid gap-2">
                {cat.documents.map((doc) => (
                  <Link
                    key={doc.id}
                    href={`/docs/${doc.slug}`}
                    className="group flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all"
                  >
                    <FileText
                      size={16}
                      className="shrink-0 text-gray-400 dark:text-gray-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {doc.title}
                      </h3>
                      {doc.excerpt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                          {doc.excerpt}
                        </p>
                      )}
                    </div>
                    <ArrowRight
                      size={14}
                      className="shrink-0 text-gray-300 dark:text-gray-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors"
                    />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        !error && (
          <div className="text-center py-12">
            <BookOpen
              size={48}
              className="mx-auto text-gray-300 dark:text-gray-600 mb-4"
            />
            <p className="text-gray-500 dark:text-gray-400">
              ドキュメントはまだありません。
            </p>
          </div>
        )
      )}

      {/* Footer stats */}
      {totalDocs > 0 && (
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800 text-center text-xs text-gray-400 dark:text-gray-500">
          {totalDocs} documents across {categories.length} categories
        </div>
      )}
    </div>
  );
}
