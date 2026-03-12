import { getDocument, getDocuments, extractHeadings } from "@/lib/library-api";
import { notFound } from "next/navigation";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { TableOfContents } from "@/components/TableOfContents";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  try {
    const docs = await getDocuments();
    return docs.map((doc) => ({ slug: doc.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDocument(slug).catch(() => null);

  if (!doc) {
    return { title: "Not Found" };
  }

  return {
    title: doc.title,
    description: doc.excerpt || `${doc.title} - Tachyon Platform Documentation`,
    openGraph: {
      title: `${doc.title} | Tachyon Docs`,
      description:
        doc.excerpt || `${doc.title} - Tachyon Platform Documentation`,
      type: "article",
      modifiedTime: doc.updatedAt,
      ...(doc.publishedAt && { publishedTime: doc.publishedAt }),
    },
  };
}

export default async function DocPage({ params }: Props) {
  const { slug } = await params;
  let doc;

  try {
    doc = await getDocument(slug);
  } catch {
    notFound();
  }

  if (!doc) notFound();

  const headings = extractHeadings(doc.content);
  const isMarkdown =
    doc.content.includes("#") ||
    doc.content.includes("```") ||
    doc.content.includes("**");

  return (
    <div className="flex">
      {/* Main content */}
      <article className="flex-1 min-w-0 max-w-3xl mx-auto px-4 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 mb-6">
          <Link
            href="/"
            className="hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            Docs
          </Link>
          <ChevronRight size={14} />
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            {doc.category}
          </span>
          <ChevronRight size={14} />
          <span className="text-gray-900 dark:text-gray-100 truncate">
            {doc.title}
          </span>
        </nav>

        {/* Title & meta */}
        <header className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-gray-50">
            {doc.title}
          </h1>
          <div className="flex items-center gap-3 mt-3 text-sm text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
              {doc.category}
            </span>
            {doc.updatedAt && (
              <time dateTime={doc.updatedAt}>
                Updated{" "}
                {new Date(doc.updatedAt).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </time>
            )}
          </div>
        </header>

        {/* Content */}
        <div className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-pre:bg-transparent prose-pre:p-0">
          {isMarkdown ? (
            <MarkdownRenderer content={doc.content} />
          ) : (
            <div dangerouslySetInnerHTML={{ __html: doc.content }} />
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-gray-200 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            &copy; Quantum Box, Inc. All rights reserved.
          </p>
        </footer>
      </article>

      {/* Table of Contents */}
      <TableOfContents headings={headings} />
    </div>
  );
}
