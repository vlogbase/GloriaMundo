import { useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FcGoogle } from "react-icons/fc";
import { SiSlack } from "react-icons/si";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        setLocation("/chat");
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [setLocation]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });
  };

  const signInWithSlack = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "slack",
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });
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
            onClick={signInWithGoogle}
          >
            <FcGoogle className="mr-2 h-5 w-5" />
            Sign in with Google
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={signInWithSlack}
          >
            <SiSlack className="mr-2 h-5 w-5 text-[#4A154B]" />
            Sign in with Slack
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
