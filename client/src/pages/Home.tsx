import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FcGoogle } from "react-icons/fc";
import { SiSlack } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";

export default function Home() {
  const [, setLocation] = useLocation();

  const signInWithProvider = async (provider: 'google' | 'slack') => {
    try {
      const response = await apiRequest('POST', '/api/auth/signin', { provider });
      const data = await response.json();

      // Redirect to the OAuth URL provided by the backend
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Sign in error:", error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Welcome to Conversify</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signInWithProvider('google')}
          >
            <FcGoogle className="mr-2 h-5 w-5" />
            Sign in with Google
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signInWithProvider('slack')}
          >
            <SiSlack className="mr-2 h-5 w-5 text-[#4A154B]" />
            Sign in with Slack
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}