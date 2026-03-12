const API_URL =
  process.env.LIBRARY_API_URL || "https://libraryapi.n1.tachy.one";
const PLATFORM_ID =
  process.env.PLATFORM_ID || "tn_01j91h09tpj5ehwbwfwfxpak2b";
const ORG_USERNAME = process.env.LIBRARY_ORG_USERNAME || "";
const REPO_USERNAME = process.env.LIBRARY_REPO_USERNAME || "";

// === Public Types ===

export interface Document {
  id: string;
  title: string;
  slug: string;
  content: string;
  category: string;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  excerpt: string;
}

export interface Category {
  key: string;
  name: string;
  documents: Document[];
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface SearchItem {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
}

// === Internal Types ===

interface PropertyDef {
  id: string;
  name: string;
  typ: string;
  meta?: {
    options?: { id: string; key: string; name: string }[];
  } | null;
}

interface PropertyDataValue {
  string?: string;
  integer?: number;
  html?: string;
  markdown?: string;
  select?: string;
  multiSelect?: string[];
  id?: string;
  date?: string;
}

interface PropertyData {
  propertyId: string;
  value: PropertyDataValue;
}

interface DataItem {
  id: string;
  name: string;
  propertyData: PropertyData[];
  createdAt: string;
  updatedAt: string;
}

interface DataListResult {
  items: DataItem[];
  paginator: {
    currentPage: number;
    totalItems: number;
    totalPages: number;
  };
}

// === GraphQL Client ===

async function graphqlQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
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

// === Utilities ===

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\u3000-\u9fff\uf900-\ufaff-]/g, "")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}

function extractExcerpt(content: string, maxLength = 160): string {
  const plain = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/!\[.*?\]\(.+?\)/g, "")
    .replace(/[>\-*+]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.length > maxLength
    ? plain.slice(0, maxLength) + "..."
    : plain;
}

// === Data Mapping ===

function mapDataToDocument(
  item: DataItem,
  properties: PropertyDef[]
): Document {
  const propMap = new Map(properties.map((p) => [p.id, p]));

  let content = "";
  let category = "";
  let slug = "";
  let publishedAt: string | null = null;

  for (const pd of item.propertyData) {
    const prop = propMap.get(pd.propertyId);
    if (!prop) continue;

    const val = pd.value;
    const nameLower = prop.name.toLowerCase();

    // Content: MARKDOWN or HTML property
    if (prop.typ === "MARKDOWN" && val.markdown) {
      content = val.markdown;
    } else if (prop.typ === "HTML" && val.html) {
      content = val.html;
    }

    // Slug: property named "slug"
    if (nameLower === "slug") {
      if (val.string) slug = val.string;
      else if (val.id) slug = val.id;
    }

    // Category: first SELECT property
    if (prop.typ === "SELECT" && val.select && !category) {
      category = val.select;
    }

    // Published date
    if (nameLower.includes("publish") && val.date) {
      publishedAt = val.date;
    }
  }

  if (!slug) {
    slug = slugify(item.name);
  }

  return {
    id: item.id,
    title: item.name,
    slug,
    content,
    category: category || "General",
    publishedAt,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
    excerpt: extractExcerpt(content),
  };
}

// === GraphQL Queries ===

const PROPERTIES_QUERY = `
  query($org: String!, $repo: String!) {
    properties(orgUsername: $org, repoUsername: $repo) {
      id
      name
      typ
      meta {
        ... on SelectType {
          options { id key name }
        }
        ... on MultiSelectType {
          options { id key name }
        }
      }
    }
  }
`;

const DATA_LIST_QUERY = `
  query($org: String!, $repo: String!, $pageSize: Int, $page: Int) {
    dataList(orgUsername: $org, repoUsername: $repo, pageSize: $pageSize, page: $page) {
      items {
        id
        name
        propertyData {
          propertyId
          value {
            ... on StringValue { string }
            ... on IntegerValue { integer }
            ... on HtmlValue { html }
            ... on MarkdownValue { markdown }
            ... on SelectValue { select }
            ... on MultiSelectValue { multiSelect }
            ... on IdValue { id }
            ... on DateValue { date }
          }
        }
        createdAt
        updatedAt
      }
      paginator {
        currentPage
        totalItems
        totalPages
      }
    }
  }
`;

// === Public API ===

let cachedProperties: PropertyDef[] | null = null;

async function getProperties(): Promise<PropertyDef[]> {
  if (cachedProperties) return cachedProperties;

  const data = await graphqlQuery<{ properties: PropertyDef[] }>(
    PROPERTIES_QUERY,
    { org: ORG_USERNAME, repo: REPO_USERNAME }
  );

  cachedProperties = data.properties;
  return data.properties;
}

export async function getDocuments(): Promise<Document[]> {
  const [properties, dataResult] = await Promise.all([
    getProperties(),
    graphqlQuery<{ dataList: DataListResult }>(DATA_LIST_QUERY, {
      org: ORG_USERNAME,
      repo: REPO_USERNAME,
      pageSize: 200,
      page: 1,
    }),
  ]);

  return dataResult.dataList.items.map((item) =>
    mapDataToDocument(item, properties)
  );
}

export async function getDocument(slug: string): Promise<Document | null> {
  const documents = await getDocuments();
  return documents.find((d) => d.slug === slug) || null;
}

export async function getCategories(): Promise<Category[]> {
  const documents = await getDocuments();
  const categoryMap = new Map<string, Document[]>();

  for (const doc of documents) {
    const existing = categoryMap.get(doc.category) || [];
    existing.push(doc);
    categoryMap.set(doc.category, existing);
  }

  return Array.from(categoryMap.entries())
    .map(([key, docs]) => ({
      key,
      name: key,
      documents: docs.sort((a, b) => a.title.localeCompare(b.title, "ja")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function toSearchItems(documents: Document[]): SearchItem[] {
  return documents.map((doc) => ({
    slug: doc.slug,
    title: doc.title,
    category: doc.category,
    excerpt: doc.excerpt,
  }));
}

export function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{2,4})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      const text = match[2]
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1")
        .trim();
      const id = text
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\w\u3000-\u9fff\uf900-\ufaff-]/g, "");
      headings.push({ level, text, id });
    }
  }

  return headings;
}
