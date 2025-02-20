import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import type { Chat, Message } from "@shared/schema";

export default function Chat() {
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const { toast } = useToast();

  const { data: chats, isLoading: chatsLoading } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
  });

  const { data: messages, isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/chats", selectedChat, "messages"],
    enabled: !!selectedChat,
  });

  const createChat = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/chats", {
        title: "New Chat",
        user_id: 1, // This should come from auth context
      });
      return await res.json();
    },
    onSuccess: (newChat) => {
      setSelectedChat(newChat.id);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create chat",
      });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedChat) return;
      const res = await apiRequest("POST", `/api/chats/${selectedChat}/messages`, {
        content,
        role: "user",
      });
      return await res.json();
    },
    onSuccess: () => {
      setMessage("");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message",
      });
    },
  });

  return (
    <div className="flex h-screen">
      <div className="w-64 border-r bg-gray-50 p-4">
        <Button
          className="w-full mb-4"
          onClick={() => createChat.mutate()}
          disabled={createChat.isPending}
        >
          New Chat
        </Button>
        <ScrollArea className="h-[calc(100vh-8rem)]">
          {chatsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {chats?.map((chat) => (
                <Button
                  key={chat.id}
                  variant={selectedChat === chat.id ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setSelectedChat(chat.id)}
                >
                  {chat.title}
                </Button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
      
      <div className="flex-1 flex flex-col">
        <ScrollArea className="flex-1 p-4">
          {messagesLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {messages?.map((msg) => (
                <Card key={msg.id} className={msg.role === "user" ? "ml-auto w-2/3" : "w-2/3"}>
                  <CardContent className="pt-4">
                    {msg.content}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
        
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage.mutate(message);
                }
              }}
            />
            <Button
              onClick={() => sendMessage.mutate(message)}
              disabled={!message || sendMessage.isPending}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
