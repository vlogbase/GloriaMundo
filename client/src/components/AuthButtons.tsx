import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { FaGoogle, FaSignOutAlt } from "react-icons/fa";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string;
  creditBalance: number;
}

export function AuthButtons() {
  const queryClient = useQueryClient();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Query for current user
  const { data: user, isLoading } = useQuery<User | null>({ 
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            return null;
          }
          throw new Error(`Failed to fetch user data: ${response.statusText}`);
        }
        
        const userData = await response.json();
        return userData as User;
      } catch (error) {
        console.error('Failed to fetch user data:', error);
        return null;
      }
    }
  });

  const handleLogin = () => {
    setIsLoggingIn(true);
    window.location.href = '/auth/google';
  };

  const handleLogout = async () => {
    try {
      window.location.href = '/api/auth/logout';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  // If user is not logged in, show login button
  if (!user && !isLoading) {
    return (
      <Button 
        variant="outline" 
        className="flex items-center gap-2" 
        onClick={handleLogin}
        disabled={isLoggingIn}
      >
        <FaGoogle className="h-4 w-4" />
        <span>{isLoggingIn ? 'Redirecting...' : 'Sign in with Google'}</span>
      </Button>
    );
  }

  // If user is logged in, show user menu
  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="flex items-center justify-start gap-2 p-2">
            <div className="flex flex-col space-y-1 leading-none">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <DropdownMenuItem 
            className="text-red-500 cursor-pointer flex items-center gap-2"
            onClick={handleLogout}
          >
            <FaSignOutAlt className="h-4 w-4" />
            <span>Logout</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Loading state
  return null;
}