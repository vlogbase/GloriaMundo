import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { Welcome } from "@/components/Welcome";
import { Sidebar } from "@/components/Sidebar";
import { AdSense } from "@/components/AdSense";
import { PwaInstallBanner } from "@/components/PwaInstallBanner";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { Menu, Globe, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function Chat() {
  // Get the conversation ID from the URL if available
  const [match, params] = useRoute("/conversation/:id");
  const conversationId = match ? parseInt(params.id) : undefined;
  
  // State to track whether to show the PWA install banner
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { 
    isMobileSidebarOpen, 
    toggleMobileSidebar, 
    conversations, 
    createConversation,
    clearConversations
  } = useConversations();
  
  const { 
    messages, 
    isLoadingMessages,
    isLoadingResponse,
    activeConversationId,
    sendMessage,
    loadConversation,
    startNewConversation
  } = useChat();
  
  // Load conversation when ID changes in URL
  useEffect(() => {
    if (conversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId, loadConversation]);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
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
  
  const handleSendMessage = async (content: string) => {
    if (!activeConversationId) {
      const newConversation = await createConversation("New Conversation");
      await sendMessage(newConversation.id, content);
    } else {
      await sendMessage(activeConversationId, content);
    }
  };
  
  const handleNewConversation = async () => {
    await startNewConversation();
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar component */}
      <Sidebar 
        conversations={conversations}
        currentConversationId={activeConversationId}
        isOpen={isMobileSidebarOpen}
        onClose={toggleMobileSidebar}
        onNewConversation={handleNewConversation}
        onClearConversations={clearConversations}
      />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-white">
          <Button variant="ghost" size="icon" onClick={toggleMobileSidebar}>
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="font-semibold text-lg text-primary flex items-center">
            <Globe className="mr-2 text-secondary h-5 w-5" />
            GloriaMundo
          </h1>
          <Button variant="ghost" size="icon" onClick={handleNewConversation}>
            <Globe className="h-5 w-5 text-primary" />
          </Button>
        </div>
        
        {/* Chat messages area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
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
            <div className="max-w-4xl mx-auto">
              <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 shadow-sm border-none p-10">
                <div className="flex flex-col items-center justify-center space-y-6 text-center">
                  <div className="h-24 w-24 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center text-white relative">
                    <Globe className="h-12 w-12" />
                    <motion.div 
                      className="absolute -right-2 -top-2"
                      animate={{ 
                        scale: [0.8, 1.2, 0.8],
                        rotate: [0, 10, 0, -10, 0],
                        opacity: [0.7, 1, 0.7]
                      }}
                      transition={{ 
                        duration: 2,
                        repeat: Infinity
                      }}
                    >
                      <Sparkles className="h-8 w-8 text-yellow-400" />
                    </motion.div>
                  </div>
                  
                  <h2 className="text-2xl font-semibold mt-6">Discovering wonderful things...</h2>
                  <p className="text-muted-foreground max-w-md">
                    GloriaMundo is exploring the world to bring you a joyful, informative response. Just a moment while we gather the perfect information for you!
                  </p>
                  
                  <div className="flex space-x-3 mt-4">
                    <motion.div
                      animate={{ 
                        scale: [1, 1.2, 1],
                        y: [0, -10, 0]
                      }}
                      transition={{ 
                        duration: 1.5,
                        repeat: Infinity,
                        repeatType: "loop",
                        delay: 0
                      }}
                      className="h-3 w-3 bg-primary rounded-full"
                    />
                    <motion.div
                      animate={{ 
                        scale: [1, 1.2, 1],
                        y: [0, -10, 0]
                      }}
                      transition={{ 
                        duration: 1.5,
                        repeat: Infinity,
                        repeatType: "loop",
                        delay: 0.2
                      }}
                      className="h-3 w-3 bg-primary rounded-full"
                    />
                    <motion.div
                      animate={{ 
                        scale: [1, 1.2, 1],
                        y: [0, -10, 0]
                      }}
                      transition={{ 
                        duration: 1.5,
                        repeat: Infinity,
                        repeatType: "loop",
                        delay: 0.4
                      }}
                      className="h-3 w-3 bg-primary rounded-full"
                    />
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              

              
              {/* Loading indicator for AI response */}
              {isLoadingResponse && (
                <div className="max-w-4xl mx-auto flex gap-4">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-r from-primary to-secondary flex-shrink-0 flex items-center justify-center text-white">
                    <Globe size={14} />
                  </div>
                  <div className="flex-1">
                    <div className="bg-white p-4 rounded-lg shadow-sm rounded-tl-none inline-block">
                      <div className="flex space-x-1">
                        <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-0"></div>
                        <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-150"></div>
                        <div className="h-2 w-2 bg-primary rounded-full animate-bounce delay-300"></div>
                      </div>
                    </div>
                  </div>
                </div>
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
