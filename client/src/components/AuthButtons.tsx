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
import { Link } from "wouter";

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
    // Format credit balance as dollars
    const dollarAmount = user.creditBalance / 10000;
    const displayBalance = dollarAmount.toFixed(2);
    const lowBalance = dollarAmount < 0.50;

    return (
      <div className="flex items-center gap-2">
        {/* Account button with credit balance */}
        <Button
          variant="outline"
          size="sm"
          className={`hidden md:flex items-center gap-1.5 ${lowBalance ? 'text-red-600 hover:text-red-700' : 'text-primary'}`}
          asChild
        >
          <Link href="/credits">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="5" />
              <path d="M20 21v-2a7 7 0 0 0-14 0v2" />
            </svg>
            <span>Account: ${displayBalance}{lowBalance ? ' (Low)' : ''}</span>
          </Link>
        </Button>
        
        {/* User dropdown menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full overflow-hidden border-2 border-primary/30 hover:border-primary/60 transition-colors">
              <Avatar className="h-full w-full">
                <AvatarImage 
                  src={user.avatarUrl} 
                  alt={user.name} 
                  className="object-cover"
                />
                <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              {lowBalance && (
                <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 border border-background"></span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center justify-start gap-3 p-3 border-b border-border/60">
              <Avatar className="h-10 w-10">
                <AvatarImage 
                  src={user.avatarUrl} 
                  alt={user.name} 
                  className="object-cover"
                />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {user.name.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col space-y-1 leading-none">
                <p className="font-medium text-base">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            
            <div className="p-3 border-b border-border/60">
              <div className="flex flex-col gap-1">
                <div className="text-sm text-muted-foreground">Current Balance</div>
                <div className={`text-base font-semibold ${lowBalance ? 'text-red-600' : 'text-primary'}`}>
                  ${displayBalance}
                </div>
                <div className="text-xs text-muted-foreground">
                  {user.creditBalance.toLocaleString()} credits available
                </div>
              </div>
            </div>
            
            <div className="p-2">
              <DropdownMenuItem 
                asChild
                className="h-10 cursor-pointer"
              >
                <a href="/credits" className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <div className="flex flex-col">
                    <span className="font-medium">Account Management</span>
                    <span className="text-xs text-muted-foreground">View usage and add funds</span>
                  </div>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-red-500 h-9 cursor-pointer flex items-center gap-2"
                onClick={handleLogout}
              >
                <FaSignOutAlt className="h-4 w-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Loading state
  return null;
}