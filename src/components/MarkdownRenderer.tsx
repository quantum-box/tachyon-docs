"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import React from "react";

function slugifyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u3000-\u9fff\uf900-\ufaff-]/g, "");
}

function extractText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement(node) && node.props) {
    return extractText(
      (node.props as { children?: React.ReactNode }).children
    );
  }
  return "";
}

function HeadingWithId({
  level,
  children,
  ...props
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children?: React.ReactNode;
  [key: string]: unknown;
}) {
  const text = extractText(children);
  const id = slugifyText(text);
  const Tag = `h${level}` as const;
  return (
    <Tag id={id} {...props}>
      <a href={`#${id}`} className="anchor-link">
        {children}
      </a>
    </Tag>
  );
}

const components: Components = {
  h1: ({ children, ...props }) => (
    <HeadingWithId level={1} {...props}>
      {children}
    </HeadingWithId>
  ),
  h2: ({ children, ...props }) => (
    <HeadingWithId level={2} {...props}>
      {children}
    </HeadingWithId>
  ),
  h3: ({ children, ...props }) => (
    <HeadingWithId level={3} {...props}>
      {children}
    </HeadingWithId>
  ),
  h4: ({ children, ...props }) => (
    <HeadingWithId level={4} {...props}>
      {children}
    </HeadingWithId>
  ),
  h5: ({ children, ...props }) => (
    <HeadingWithId level={5} {...props}>
      {children}
    </HeadingWithId>
  ),
  h6: ({ children, ...props }) => (
    <HeadingWithId level={6} {...props}>
      {children}
    </HeadingWithId>
  ),
  a: ({ href, children, ...props }) => {
    const isExternal = href?.startsWith("http");
    return (
      <a
        href={href}
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        {...props}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt || ""}
      className="rounded-lg shadow-sm max-w-full"
      loading="lazy"
      {...props}
    />
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4">
      <table {...props}>{children}</table>
    </div>
  ),
  pre: ({ children, ...props }) => (
    <pre className="not-prose rounded-lg overflow-x-auto" {...props}>
      {children}
    </pre>
  ),
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
