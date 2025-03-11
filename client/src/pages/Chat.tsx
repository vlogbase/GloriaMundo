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
import { SkimlinksDebug } from "@/components/SkimlinksDebug";
import { SkimlinksTestLinks } from "@/components/SkimlinksTestLinks";
import { SkimwordsTest } from "@/components/SkimwordsTest";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { useTheme } from "@/hooks/use-theme";
import { Menu, Globe, Sparkles, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { cn, refreshSkimlinks } from "@/lib/utils";
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
  const userMessageRef = useRef<HTMLDivElement>(null);
  
  // Initialize Skimlinks when the component mounts
  useEffect(() => {
    console.log("Initializing Skimlinks on page load");
    
    // Try initial refresh
    refreshSkimlinks({ debug: true });
    
    // Set up a delayed refresh for after the page has fully loaded
    const initialTimer = setTimeout(() => {
      refreshSkimlinks();
    }, 3000);
    
    return () => clearTimeout(initialTimer);
  }, []);
  
  // Add a ref to track if we've already scrolled to the user message
  const hasScrolledToUserMessageRef = useRef<boolean>(false);
  const { 
    isMobileSidebarOpen, 
    toggleMobileSidebar, 
    conversations, 
    createConversation,
    clearConversations,
    sidebarState,
    toggleSidebarCollapse
  } = useConversations();
  
  // Use the standard chat hook for message handling
  const { 
    messages, 
    isLoadingMessages,
    isLoadingResponse,
    sendMessage,
    loadConversation,
    startNewConversation,
    activeConversationId
  } = useChat();
  
  // Load conversation when ID changes in URL
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, loadConversation]);
  
  // Separate effects for loading state and message changes to control scroll behavior
  
  // First, handle scrolling specifically when loading state changes
  useEffect(() => {
    // When loading starts, scroll to user message once and set flag
    if (isLoadingResponse && userMessageRef.current && !hasScrolledToUserMessageRef.current) {
      userMessageRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start" // Position the user message at the top of the viewport
      });
      hasScrolledToUserMessageRef.current = true; // Prevent repeated scrolling during streaming
    }
    
    // When loading finishes, reset the scroll flag
    if (!isLoadingResponse) {
      hasScrolledToUserMessageRef.current = false;
    }
  }, [isLoadingResponse]);
  
  // Handle regular scrolling behavior when messages change
  useEffect(() => {
    // When loading is done, scroll to the latest message
    if (!isLoadingResponse && messages.length > 0) {
      if (latestMessageRef.current) {
        latestMessageRef.current.scrollIntoView({ 
          behavior: "smooth", 
          block: "start" // Ensures we scroll to the top of the message
        });
      } else if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    } else if (messagesEndRef.current) {
      // If there are no messages yet, scroll to the bottom
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoadingResponse]);
  
  // Effect to show PWA install banner after first AI response
  useEffect(() => {
    // Check if we have at least one AI response in the messages
    const hasAiResponse = messages.some((m: Message) => m.role === 'assistant');
    
    if (hasAiResponse && !showPwaBanner) {
      // Set a small delay before showing the banner so it appears after the user has read the response
      const timer = setTimeout(() => {
        setShowPwaBanner(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [messages, showPwaBanner]);
  
  // Effect to initialize and refresh Skimlinks when messages change
  useEffect(() => {
    // Only attempt to refresh Skimlinks if we have assistant messages to monetize
    if (messages.some(m => m.role === 'assistant')) {
      // Initial delay to let the DOM settle
      const timer = setTimeout(() => {
        // Refresh Skimlinks with debug enabled for development
        refreshSkimlinks({ debug: true });
        
        // Additional refresh after a longer delay to catch any late renders
        setTimeout(() => {
          refreshSkimlinks();
        }, 2000);
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [messages]);
  
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
              {messages.map((message: Message, index: number) => {
                // Add refs to both user and AI messages
                const isLatestAssistantMessage = index === messages.length - 1 && message.role === 'assistant';
                const isLatestUserMessage = index === messages.length - 2 && message.role === 'user' && isLoadingResponse;
                
                // Determine which ref to use
                let refToUse = undefined;
                if (isLatestAssistantMessage) {
                  refToUse = latestMessageRef;
                } else if (isLatestUserMessage) {
                  refToUse = userMessageRef;
                }
                
                return (
                  <div key={message.id} ref={refToUse}>
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
              
              {/* Skimlinks Tools - For testing and diagnostics */}
              <div className="mt-8 space-y-4">
                <SkimlinksTestLinks />
                <SkimwordsTest />
                <SkimlinksDebug />
              </div>
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
