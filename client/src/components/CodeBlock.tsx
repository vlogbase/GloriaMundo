import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  language: string;
  value: string;
}

export const CodeBlock = ({ language, value }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-4 rounded-md overflow-hidden bg-zinc-950 text-zinc-50">
      {language && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-800 text-xs text-zinc-400">
          <span>{language}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-zinc-50 hover:bg-zinc-700"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}
      <pre className={cn("p-4 overflow-x-auto text-sm whitespace-pre-wrap sm:whitespace-pre", !language && "pt-3")}>
        <code className="break-words">{value}</code>
      </pre>
    </div>
  );
};
