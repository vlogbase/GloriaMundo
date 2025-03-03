import { Link } from "wouter";

export const Footer = () => {
  return (
    <div className="w-full text-center py-2 text-xs text-muted-foreground/50 select-none">
      <div className="flex justify-center space-x-4">
        <Link href="/privacy">
          <span className="hover:text-muted-foreground cursor-pointer transition-colors">Privacy</span>
        </Link>
        <Link href="/contact">
          <span className="hover:text-muted-foreground cursor-pointer transition-colors">Contact</span>
        </Link>
      </div>
    </div>
  );
};