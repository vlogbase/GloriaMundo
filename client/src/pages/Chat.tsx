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
import { AuthButtons } from "@/components/AuthButtons";
import { useChat } from "@/hooks/useChat";
import { useConversations } from "@/hooks/useConversations";
import { useTheme } from "@/hooks/use-theme";
import { Menu, Globe, Sparkles, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useModelSelection } from "@/hooks/useModelSelection";
import { Message } from "@/lib/types";
import { useDocuments } from "@/hooks/useDocuments";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { Document } from "@/hooks/useDocuments";

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
  
  // State for document preview modal
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const userMessageRef = useRef<HTMLDivElement>(null);
  
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
    activeConversationId,
    uploadDocument
  } = useChat();
  
  // Use the documents hook for document management
  const {
    documents,
    isLoading: isLoadingDocuments,
    fetchDocuments,
    deleteDocument,
    addDocument
  } = useDocuments(activeConversationId);
  
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
    console.log('[Chat] Messages state changed, message count:', messages.length);
    
    // When messages are loaded or updated
    if (messages.length > 0) {
      // When loading is done, prioritize scrolling to the latest message
      if (!isLoadingResponse) {
        if (latestMessageRef.current) {
          console.log('[Chat] Scrolling to latest message');
          latestMessageRef.current.scrollIntoView({ 
            behavior: "smooth", 
            block: "start" // Ensures we scroll to the top of the message
          });
        } else if (messagesEndRef.current) {
          console.log('[Chat] No latest message ref found, scrolling to end');
          messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }
      
      // Only scroll to first message on initial load when there's no last message reference
      // and we're not expecting more messages (not loading response)
      else if (!latestMessageRef.current && !isLoadingResponse) {
        const firstMessage = document.querySelector('.first-message');
        if (firstMessage) {
          console.log('[Chat] First message element found, scrolling to it');
          firstMessage.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    } else if (messagesEndRef.current) {
      // If there are no messages yet, scroll to the bottom
      console.log('[Chat] No messages, scrolling to end');
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
  
  const handleSendMessage = async (content: string, image?: string) => {
    try {
      if (!activeConversationId) {
        // Create a new conversation and send the first message
        const newConversation = await createConversation("New Conversation");
        await sendMessage(newConversation.id, content, image);
      } else {
        // Send to existing conversation
        await sendMessage(activeConversationId, content, image);
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
    }
  };
  
  const handleNewConversation = async () => {
    await startNewConversation();
  };
  
  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };
  
  // Handler for document uploads
  const handleDocumentUpload = async (file: File) => {
    try {
      // This will create a conversation if needed
      const result = await uploadDocument(file);
      
      // If we have document data in the result, add it to our documents list
      if (result && result.document) {
        addDocument(result.document);
      }
      
      return result;
    } catch (error) {
      console.error("Error handling document upload:", error);
      throw error;
    }
  };
  
  // Handler for document preview
  const handlePreviewDocument = (document: Document) => {
    setPreviewDocument(document);
    setIsPreviewOpen(true);
  };

  return (
    <div className={cn(
      "flex h-[100dvh] overflow-hidden bg-background",
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
        "flex-1 flex flex-col overflow-hidden transition-all duration-300 h-[100dvh]",
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
          <div className="flex items-center gap-2">
            <AuthButtons />
            <ThemeToggle />
          </div>
        </div>
        
        {/* Desktop header controls - top right */}
        <div className="hidden md:flex absolute top-4 right-4 z-10 items-center gap-3">
          <AuthButtons />
          <ThemeToggle />
        </div>
        
        {/* Chat messages area - with layout stabilization to prevent CLS */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4 md:p-6 space-y-6"
          style={{
            /* Using flex-1 instead of fixed height - this will allow content to scroll properly */
            contain: "layout paint size", /* Improve paint/layout performance */
            contentVisibility: "auto", /* Optimize rendering for off-screen content */
          }}
        >
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

              
              {/* Debug info showing total message count */}
              <div className="text-xs text-muted-foreground opacity-50 mb-4">
                Message count: {messages.length}
              </div>

              {/* Specific user message presence logging for first message debugging */}
              {(() => {
                const userMessages = messages.filter(m => m.role === 'user');
                const assistantMessages = messages.filter(m => m.role === 'assistant');
                console.log('[Chat] Current messages state:', {
                  total: messages.length,
                  userCount: userMessages.length,
                  assistantCount: assistantMessages.length,
                  firstMessage: messages.length > 0 ? messages[0] : null
                });
                return null;
              })()}
              
              {messages.map((message: Message, index: number) => {
                // Add refs to both user and AI messages
                const isLatestAssistantMessage = index === messages.length - 1 && message.role === 'assistant';
                const isLatestUserMessage = index === messages.length - 1 && message.role === 'user' && isLoadingResponse;
                const isFirstEverMessage = index === 0;
                
                // For debugging, log each message being rendered
                console.log(`[Chat] Rendering message ${index}:`, {
                  id: message.id,
                  role: message.role,
                  content: message.content ? message.content.substring(0, 30) + '...' : 'No content',
                  isLatestAssistantMessage,
                  isLatestUserMessage,
                  isFirstEverMessage
                });
                
                // Determine which ref to use
                let refToUse = undefined;
                if (isLatestAssistantMessage) {
                  refToUse = latestMessageRef;
                } else if (isLatestUserMessage) {
                  refToUse = userMessageRef;
                }
                
                // Add a key that's more unique and stable than just the message ID
                const messageKey = `${message.role}-${message.id}-${index}`;
                
                return (
                  <div 
                    key={messageKey} 
                    ref={refToUse}
                    className={isFirstEverMessage ? 'first-message' : ''}
                  >
                    <ChatMessage 
                      message={message} 
                      relatedDocuments={message.role === 'user' ? documents : []} 
                    />
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
          onUploadDocument={handleDocumentUpload}
          documents={documents}
          onPreviewDocument={handlePreviewDocument}
        />
      </div>
      
      {/* PWA Install Banner - Show after first AI response */}
      <PwaInstallBanner show={showPwaBanner} />
      
      {/* Document Preview Modal */}
      {previewDocument && (
        <DocumentPreviewModal 
          isOpen={isPreviewOpen}
          documentId={previewDocument.id}
          fileName={previewDocument.fileName}
          fileType={previewDocument.fileType}
          onClose={() => {
            setIsPreviewOpen(false);
            setPreviewDocument(null);
          }}
        />
      )}
    </div>
  );
}
