import { useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatInput } from "@/components/ChatInput";
import { Welcome } from "@/components/Welcome";
import { Sidebar } from "@/components/Sidebar";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { Menu, Globe } from "lucide-react";

export default function Chat() {
  // Get the conversation ID from the URL if available
  const [match, params] = useRoute("/conversation/:id");
  const conversationId = match ? parseInt(params.id) : undefined;
  
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
          ) : messages.length === 0 ? (
            <Welcome onSuggestionClick={handleSuggestionClick} />
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
    </div>
  );
}
