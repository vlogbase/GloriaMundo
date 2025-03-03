import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { Plus, Globe, Trash2, X } from "lucide-react";
import { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId?: number;
  isOpen: boolean;
  onClose: () => void;
  onNewConversation: () => void;
  onClearConversations: () => void;
}

export const Sidebar = ({ 
  conversations, 
  currentConversationId, 
  isOpen,
  onClose,
  onNewConversation,
  onClearConversations
}: SidebarProps) => {
  const [_, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 md:relative md:z-0 md:h-screen flex flex-col w-64 bg-background border-r border-border transition-transform duration-300 md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Link href="/">
            <h1 className="font-semibold text-xl text-primary flex items-center cursor-pointer">
              <Globe className="mr-2 text-secondary h-5 w-5" />
              GloriaMundo
            </h1>
          </Link>
          <Button variant="ghost" size="icon" onClick={onNewConversation}>
            <Plus className="h-5 w-5" />
          </Button>
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
