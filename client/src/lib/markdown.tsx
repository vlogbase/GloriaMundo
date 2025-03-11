import ReactMarkdown from "react-markdown";
import { CodeBlock } from "@/components/CodeBlock";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { refreshSkimlinks } from "./utils";
import { useEffect, useRef } from "react";

interface MarkdownRendererProps {
  children: string;
}

export const MarkdownRenderer = ({ children }: MarkdownRendererProps) => {
  // Keep a reference to the container div to help with Skimlinks integration
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Setup effect to call refreshSkimlinks after component renders/updates
  useEffect(() => {
    // Wait briefly for the DOM to update before triggering refreshSkimlinks
    const timer = setTimeout(() => {
      refreshSkimlinks();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [children]);

  // Define the components for ReactMarkdown
  const components = {
    h1: (props: any) => (
      <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />
    ),
    h2: (props: any) => (
      <h2 className="text-xl font-bold mt-6 mb-3" {...props} />
    ),
    h3: (props: any) => (
      <h3 className="text-lg font-semibold mt-4 mb-2" {...props} />
    ),
    h4: (props: any) => (
      <h4 className="text-base font-medium mt-4 mb-2" {...props} />
    ),
    p: (props: any) => (
      <p className="mb-4 leading-relaxed" {...props} />
    ),
    a: ({ href, children, ...props }: any) => (
      <a
        href={href}
        className="text-primary hover:underline break-all"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    ),
    ul: (props: any) => (
      <ul className="list-disc pl-5 mb-4 space-y-2" {...props} />
    ),
    ol: (props: any) => (
      <ol className="list-decimal pl-5 mb-4 space-y-2" {...props} />
    ),
    li: (props: any) => <li className="leading-relaxed" {...props} />,
    blockquote: (props: any) => (
      <blockquote
        className="border-l-4 border-primary/30 pl-4 italic my-4"
        {...props}
      />
    ),
    img: ({ alt, src, ...props }: any) => (
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
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      const content = String(children).replace(/\n$/, "");
      
      return !inline && (match || content.includes('\n')) ? (
        <SyntaxHighlighter
          style={atomDark}
          language={language || "text"}
          PreTag="div"
          className="rounded-md my-4"
          {...props}
        >
          {content}
        </SyntaxHighlighter>
      ) : (
        <code
          className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
          {...props}
        >
          {children}
        </code>
      );
    },
    table: (props: any) => (
      <div className="overflow-x-auto my-4">
        <table
          className="min-w-full divide-y divide-border rounded-md"
          {...props}
        />
      </div>
    ),
    thead: (props: any) => (
      <thead className="bg-muted" {...props} />
    ),
    tbody: (props: any) => (
      <tbody className="divide-y divide-border" {...props} />
    ),
    tr: (props: any) => (
      <tr className="hover:bg-muted/50" {...props} />
    ),
    th: (props: any) => (
      <th
        className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
        {...props}
      />
    ),
    td: (props: any) => (
      <td className="px-4 py-2 whitespace-nowrap" {...props} />
    ),
    hr: (props: any) => (
      <hr className="my-6 border-border" {...props} />
    ),
  };

  return (
    <div className="w-full overflow-hidden break-words" ref={containerRef}>
      <ReactMarkdown 
        components={components} 
        rehypePlugins={[rehypeRaw]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};
