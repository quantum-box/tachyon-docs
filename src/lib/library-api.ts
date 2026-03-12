const API_URL = process.env.LIBRARY_API_URL || "https://libraryapi.n1.tachy.one";
const PLATFORM_ID = process.env.PLATFORM_ID || "tn_01j91h09tpj5ehwbwfwfxpak2b";

export interface Document {
  id: string;
  title: string;
  slug: string;
  content: string;
  publishedAt: string | null;
  updatedAt: string;
  category?: string;
}

export interface DocumentList {
  documents: Document[];
  total: number;
}

async function graphqlQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Platform-Id": PLATFORM_ID,
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    throw new Error(`Library API error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(json.errors[0]?.message || "GraphQL error");
  }

  return json.data;
}

export async function getDocuments(): Promise<Document[]> {
  const data = await graphqlQuery<{ documents: { nodes: Document[] } }>(`
    query {
      documents(first: 100) {
        nodes {
          id
          title
          slug
          content
          publishedAt
          updatedAt
        }
      }
    }
  `);
  return data.documents.nodes;
}

export async function getDocument(slug: string): Promise<Document | null> {
  const data = await graphqlQuery<{ documentBySlug: Document | null }>(`
    query($slug: String!) {
      documentBySlug(slug: $slug) {
        id
        title
        slug
        content
        publishedAt
        updatedAt
      }
    }
  `, { slug });
  return data.documentBySlug;
}
