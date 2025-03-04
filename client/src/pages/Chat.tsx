import { useEffect, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { Welcome } from "@/components/Welcome";
import { Sidebar } from "@/components/Sidebar";
import { AdSense } from "@/components/AdSense";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { useChat } from "@/hooks/useChat";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { useConversations } from "@/hooks/useConversations";
import { useTheme } from "@/hooks/use-theme";
import { Menu, Globe, Sparkles, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useModelSelection } from "@/hooks/useModelSelection";
import { Message } from "@/lib/types";

// Theme toggle component
const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}>
      {theme === 'light' ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </Button>
  );
};

export default function Chat() {
  // Get the conversation ID from the URL if available (support both formats)
  const [matchOld, paramsOld] = useRoute("/conversation/:id");
  const [matchNew, paramsNew] = useRoute("/chat/:id");
  
  // Determine the conversation ID from URL parameters
  let conversationId: number | undefined = undefined;
  if (matchOld && paramsOld) {
    conversationId = parseInt(paramsOld.id);
  } else if (matchNew && paramsNew) {
    conversationId = parseInt(paramsNew.id);
  }
  
  // State to track whether to show the PWA install banner
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  
  // This state is no longer needed as it's handled by useConversations
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const { 
    isMobileSidebarOpen, 
    toggleMobileSidebar, 
    conversations, 
    createConversation,
    clearConversations,
    sidebarState,
    toggleSidebarCollapse
  } = useConversations();
  
  const { 
    messages, 
    isLoadingMessages,
    isLoadingResponse,
    activeConversationId,
    sendMessage,
    loadConversation,
    startNewConversation
  } = useStreamingChat();
  
  // Load conversation when ID changes in URL
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, loadConversation]);
  
  // Scroll behavior when messages change
  useEffect(() => {
    if (messages.length > 0) {
      // If there's a latest message ref (AI response), scroll to it
      if (latestMessageRef.current) {
        latestMessageRef.current.scrollIntoView({ 
          behavior: "smooth", 
          block: "start" // Ensures we scroll to the top of the element
        });
      } else if (messagesEndRef.current) {
        // Otherwise scroll to the bottom to see the latest user message
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    } else if (messagesEndRef.current) {
      // If there are no messages yet, scroll to the bottom
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);
  
  // Effect to show PWA install banner after first AI response
  useEffect(() => {
    // Check if we have at least one AI response in the messages
    const hasAiResponse = messages.some(m => m.role === 'assistant');
    
    if (hasAiResponse && !showPwaBanner) {
      // Set a small delay before showing the banner so it appears after the user has read the response
      const timer = setTimeout(() => {
        setShowPwaBanner(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [messages, showPwaBanner]);
  
  const handleSendMessage = async (content: string, image?: string) => {
    if (!activeConversationId) {
      const newConversation = await createConversation("New Conversation");
      await sendMessage(newConversation.id, content, image);
    } else {
      await sendMessage(activeConversationId, content, image);
    }
  };
  
  const handleNewConversation = async () => {
    await startNewConversation();
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <div className={cn(
      "flex h-screen overflow-hidden bg-background",
      sidebarState === 'collapsed' ? "sidebar-collapsed" : ""
    )}>
      {/* Sidebar component */}
      <Sidebar 
        conversations={conversations}
        currentConversationId={activeConversationId}
        isOpen={isMobileSidebarOpen}
        onClose={toggleMobileSidebar}
        onNewConversation={handleNewConversation}
        onClearConversations={clearConversations}
        isCollapsed={sidebarState === 'collapsed'}
        onToggleCollapse={toggleSidebarCollapse}
      />
      
      {/* Main content */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        sidebarState === 'collapsed' ? "ml-16 md:ml-16" : "ml-0 md:ml-0"
      )}>
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-background">
          <Button variant="ghost" size="icon" onClick={toggleMobileSidebar}>
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/">
            <h1 className="font-semibold text-lg text-primary flex items-center cursor-pointer">
              <Globe className="mr-2 text-secondary h-5 w-5" />
              GloriaMundo
            </h1>
          </Link>
          <ThemeToggle />
        </div>
        
        {/* Desktop theme toggle - top right */}
        <div className="hidden md:block absolute top-4 right-4 z-10">
          <ThemeToggle />
        </div>
        
        {/* Chat messages area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6 space-y-6">
          {isLoadingMessages ? (
            <div className="flex justify-center items-center h-full">
              <div className="typing-indicator">
                <span className="h-2 w-2 bg-primary rounded-full animate-bounce delay-0"></span>
                <span className="h-2 w-2 bg-primary rounded-full animate-bounce delay-150 mx-1"></span>
                <span className="h-2 w-2 bg-primary rounded-full animate-bounce delay-300"></span>
              </div>
            </div>
          ) : messages.length === 0 && !isLoadingResponse ? (
            <Welcome 
              onSuggestionClick={handleSuggestionClick} 
              isLoading={isLoadingResponse} 
            />
          ) : messages.length === 0 && isLoadingResponse ? (
            <div className="flex justify-center items-center h-full">
              <div className="typing-indicator">
                <span className="h-3 w-3 bg-primary rounded-full animate-bounce delay-0"></span>
                <span className="h-3 w-3 bg-primary rounded-full animate-bounce delay-150 mx-2"></span>
                <span className="h-3 w-3 bg-primary rounded-full animate-bounce delay-300"></span>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => {
                // Add ref to the latest message (usually AI's message)
                const isLatestMessage = index === messages.length - 1 && message.role === 'assistant';
                return (
                  <div key={message.id} ref={isLatestMessage ? latestMessageRef : undefined}>
                    <ChatMessage message={message} />
                  </div>
                );
              })}
              

              
              {/* Loading indicator for AI response */}
              {isLoadingResponse && (
                <motion.div 
                  className="w-full max-w-4xl mx-auto px-4 sm:px-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="w-full">
                    <div className="flex space-x-1 py-2">
                      <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-0"></div>
                      <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-150"></div>
                      <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-300"></div>
                    </div>
                  </div>
                </motion.div>
              )}
              
              {/* Auto-scroll anchor */}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
        
        {/* Chat input */}
        <ChatInput 
          onSendMessage={handleSendMessage} 
          isLoading={isLoadingResponse} 
        />
      </div>
      
      {/* PWA Install Banner - Show after first AI response */}
      <PwaInstallBanner show={showPwaBanner} />
    </div>
  );
}
