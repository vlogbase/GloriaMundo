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
import { Plus, Trash2, X, Menu, ChevronRight, Home, LogIn } from "lucide-react";
import { Conversation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { useQuery } from "@tanstack/react-query";

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

interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  creditBalance: number;
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
  
  // Query for current user to check authentication status
  const { data: user, isLoading: isUserLoading } = useQuery<User | null>({ 
    queryKey: ['/api/auth/me'],
    staleTime: 5 * 60 * 1000, // 5 minutes - share cache with other components
  });
  
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
            <Logo
              size={24}
              onClick={() => {
                setLocation("/");
                onClose();
              }}
              className="my-1 cursor-pointer"
            />
            <Button 
              variant="outline" 
              className="p-2 w-full flex justify-center"
              onClick={onNewConversation} 
              title="New Chat"
            >
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
          
          {/* Clear conversations button - Only show for authenticated users */}
          {user && (
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
          )}
        </aside>
      )}
      
      {/* Full Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 md:relative md:z-0 md:h-screen flex flex-col bg-background border-r border-border transition-all duration-300 md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full",
        isCollapsed ? "md:hidden" : "w-64"
      )}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <Logo
            size={32}
            onClick={() => {
              setLocation("/");
              onClose();
            }}
            className="cursor-pointer"
          />
          {/* Collapse button on desktop */}
          <div className="flex space-x-1">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onNewConversation} 
              className="flex items-center gap-1 rounded-md font-medium"
            >
              <Plus className="h-4 w-4" />
              <span>New Chat</span>
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
            {/* Show login prompt for non-authenticated users */}
            {isUserLoading ? (
              <div className="flex justify-center items-center py-8">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : !user ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-muted p-4 rounded-lg w-full space-y-4">
                  <h3 className="font-medium">Sign in for chat history</h3>
                  <p className="text-sm text-muted-foreground">
                    Sign in to save your conversation history across devices
                  </p>
                  <Button 
                    onClick={() => window.location.href = '/auth/google'} 
                    className="w-full"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Sign in with Google
                  </Button>
                </div>
              </div>
            ) : conversations.length === 0 ? (
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
        
        {/* Bottom actions - Only show for authenticated users */}
        {user && (
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
        )}
      </aside>
    </>
  );
};
