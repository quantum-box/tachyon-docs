import { getDocuments } from "@/lib/library-api";
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://docs.txcloud.app";

  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];

  try {
    const documents = await getDocuments();
    for (const doc of documents) {
      entries.push({
        url: `${baseUrl}/docs/${doc.slug}`,
        lastModified: new Date(doc.updatedAt),
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  } catch {
    // If API is unavailable, return only the home page
  }

  return entries;
}
