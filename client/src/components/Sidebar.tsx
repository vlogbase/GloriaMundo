import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";
import { Plus, Globe, Trash2, X, Menu, ChevronRight, Home } from "lucide-react";
import { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId?: number;
  isOpen: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onClearConversations: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar = ({ 
  conversations, 
  currentConversationId, 
  isOpen,
  onClose,
  onNewConversation,
  onClearConversations,
  isCollapsed = false,
  onToggleCollapse
}: SidebarProps) => {
  const [_, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Note: We no longer need to store collapse state in localStorage here
  // as it's now managed by the useConversations hook with cookies
  
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      {/* Collapsed slim sidebar with just icons - visible on desktop when collapsed */}
      {isCollapsed && (
        <aside className="hidden md:flex fixed inset-y-0 left-0 z-50 flex-col w-16 bg-background border-r border-border">
          {/* Top buttons group */}
          <div className="p-4 border-b border-border flex flex-col items-center space-y-4">
            <Link href="/">
              <Button variant="ghost" size="icon" title="Home" onClick={() => setLocation("/")}>
                <Home className="h-5 w-5" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={onNewConversation} title="New Chat">
              <Plus className="h-5 w-5" />
            </Button>
            {/* Toggle expand button moved closer to top controls */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onToggleCollapse}
              title="Expand Sidebar"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          
          {/* Empty space */}
          <div className="flex-1"></div>
          
          {/* Clear conversations button */}
          <div className="p-4 border-t border-border flex justify-center">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  title="Clear Conversations"
                >
                  <Trash2 className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Clear all conversations?</DialogTitle>
                  <DialogDescription>
                    This will permanently delete all your conversations. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={() => {
                      onClearConversations();
                      setIsDialogOpen(false);
                      setLocation("/");
                    }}
                  >
                    Clear all
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </aside>
      )}
      
      {/* Full Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 md:relative md:z-0 md:h-screen flex flex-col bg-background border-r border-border transition-all duration-300 md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        isCollapsed ? "md:hidden" : "w-64"
      )}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link href="/" onClick={() => setLocation("/")}>
            <h1 className="font-semibold text-xl text-primary flex items-center cursor-pointer">
              <Globe className="mr-2 text-secondary h-5 w-5" />
              GloriaMundo
            </h1>
          </Link>
          {/* Collapse button on desktop */}
          <div className="flex space-x-1">
            <Button variant="ghost" size="icon" onClick={onNewConversation} title="New Chat">
              <Plus className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="hidden md:flex"
              onClick={onToggleCollapse}
              title="Collapse Sidebar"
            >
              <ChevronRight className="h-5 w-5 rotate-180" />
            </Button>
          </div>
        </div>
        
        {/* Conversation list */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {conversations.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                No conversations yet
              </p>
            ) : (
              conversations.map((conversation) => (
                <Link 
                  key={conversation.id} 
                  href={`/chat/${conversation.id}`}
                  onClick={onClose}
                >
                  <div 
                    className={cn(
                      "p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors",
                      currentConversationId === conversation.id && "bg-muted"
                    )}
                  >
                    <h3 className="font-medium truncate">{conversation.title}</h3>
                    <p className="text-sm text-muted-foreground truncate">
                      {formatDistanceToNow(new Date(conversation.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </ScrollArea>
        
        {/* Mobile close button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-4 right-4 md:hidden"
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
        
        {/* Bottom actions */}
        <div className="p-4 border-t border-border space-y-2">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 h-5 w-5" />
                <span>Clear conversations</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all conversations?</DialogTitle>
                <DialogDescription>
                  This will permanently delete all your conversations. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => {
                    onClearConversations();
                    setIsDialogOpen(false);
                    setLocation("/");
                  }}
                >
                  Clear all
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </aside>
    </>
  );
};
