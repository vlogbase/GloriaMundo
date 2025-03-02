import ReactMarkdown from "react-markdown";
import { CodeBlock } from "@/components/CodeBlock";

interface MarkdownRendererProps {
  children: string;
}

export const MarkdownRenderer = ({ children }: MarkdownRendererProps) => {
  return (
    <ReactMarkdown
      components={{
        h1: ({ node, ...props }) => (
          <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />
        ),
        h2: ({ node, ...props }) => (
          <h2 className="text-xl font-bold mt-6 mb-3" {...props} />
        ),
        h3: ({ node, ...props }) => (
          <h3 className="text-lg font-semibold mt-4 mb-2" {...props} />
        ),
        h4: ({ node, ...props }) => (
          <h4 className="text-base font-medium mt-4 mb-2" {...props} />
        ),
        p: ({ node, ...props }) => (
          <p className="mb-4 leading-relaxed" {...props} />
        ),
        a: ({ node, ...props }) => (
          <a
            className="text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            {...props}
          />
        ),
        ul: ({ node, ...props }) => (
          <ul className="list-disc pl-5 mb-4 space-y-2" {...props} />
        ),
        ol: ({ node, ...props }) => (
          <ol className="list-decimal pl-5 mb-4 space-y-2" {...props} />
        ),
        li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
        blockquote: ({ node, ...props }) => (
          <blockquote
            className="border-l-4 border-primary/30 pl-4 italic my-4"
            {...props}
          />
        ),
        img: ({ node, alt, src, ...props }) => (
          <div className="my-4 rounded-lg overflow-hidden">
            <img
              alt={alt}
              src={src}
              className="w-full h-auto object-cover rounded-lg"
              {...props}
            />
            {alt && <p className="text-xs text-muted-foreground mt-1">{alt}</p>}
          </div>
        ),
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";

          return !inline ? (
            <CodeBlock language={language} value={String(children).replace(/\n$/, "")} />
          ) : (
            <code
              className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
              {...props}
            >
              {children}
            </code>
          );
        },
        table: ({ node, ...props }) => (
          <div className="overflow-x-auto my-4">
            <table
              className="min-w-full divide-y divide-border rounded-md"
              {...props}
            />
          </div>
        ),
        thead: ({ node, ...props }) => (
          <thead className="bg-muted" {...props} />
        ),
        tbody: ({ node, ...props }) => (
          <tbody className="divide-y divide-border" {...props} />
        ),
        tr: ({ node, ...props }) => (
          <tr className="hover:bg-muted/50" {...props} />
        ),
        th: ({ node, ...props }) => (
          <th
            className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
            {...props}
          />
        ),
        td: ({ node, ...props }) => (
          <td className="px-4 py-2 whitespace-nowrap" {...props} />
        ),
        hr: ({ node, ...props }) => (
          <hr className="my-6 border-border" {...props} />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
};
