import { getDocument, getDocuments } from "@/lib/library-api";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  try {
    const docs = await getDocuments();
    return docs.map((doc) => ({ slug: doc.slug }));
  } catch {
    return [];
  }
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let doc;
  try {
    doc = await getDocument(slug);
  } catch {
    notFound();
  }

  if (!doc) notFound();

  return (
    <article className="prose prose-gray max-w-none">
      <h1>{doc.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: doc.content }} />
    </article>
  );
}
