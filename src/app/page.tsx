import { getDocuments } from "@/lib/library-api";
import Link from "next/link";

export default async function Home() {
  let documents: Awaited<ReturnType<typeof getDocuments>> = [];
  let error: string | null = null;

  try {
    documents = await getDocuments();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch documents";
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Documentation</h1>
      <p className="text-gray-600 mb-8">
        Tachyon Platform のドキュメント
      </p>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
          <p className="text-yellow-800 text-sm">
            ドキュメントの取得に失敗しました: {error}
          </p>
          <p className="text-yellow-600 text-xs mt-1">
            LIBRARY_API_URL 環境変数を確認してください
          </p>
        </div>
      )}

      {documents.length > 0 ? (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <Link
              key={doc.id}
              href={`/docs/${doc.slug}`}
              className="block border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-900">{doc.title}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {doc.updatedAt && `更新: ${new Date(doc.updatedAt).toLocaleDateString("ja-JP")}`}
              </p>
            </Link>
          ))}
        </div>
      ) : !error ? (
        <p className="text-gray-500">ドキュメントはまだありません。</p>
      ) : null}
    </div>
  );
}
