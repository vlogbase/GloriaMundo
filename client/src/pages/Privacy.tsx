import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Privacy() {
  return (
    <div className="container max-w-4xl mx-auto px-4 py-10">
      <Link href="/">
        <Button variant="ghost" className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to GloriaMundo
        </Button>
      </Link>
      
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="space-y-6 text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Introduction</h2>
          <p>
            At GloriaMundo, we respect your privacy and are committed to protecting your personal data.
            This Privacy Policy explains how we collect, use, and safeguard your information when you use our AI discovery platform.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Information We Collect</h2>
          <p>We collect the following types of information:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Message content you send to our AI system</li>
            <li>Conversation history</li>
            <li>Technical data such as IP address, browser type, and device information</li>
            <li>Cookies and usage data to improve our services</li>
          </ul>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">How We Use Your Information</h2>
          <p>We use the collected information for:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Providing and improving our AI services</li>
            <li>Maintaining conversation context and history</li>
            <li>Analyzing usage patterns to enhance user experience</li>
            <li>Detecting and preventing security issues</li>
          </ul>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Data Storage</h2>
          <p>
            We store your conversations to provide continuity in your experience with GloriaMundo.
            You can delete your conversation history at any time using the clear conversations option.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Third-Party Services</h2>
          <p>
            We use the Perplexity API to power our AI responses. Your queries are sent to Perplexity
            in accordance with their privacy policy. We also use Google AdSense for displaying advertisements,
            which may use cookies to personalize ads.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Your Rights</h2>
          <p>GloriaMundo offers the following privacy controls:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>View your conversation history through the sidebar interface</li>
            <li>Delete individual conversations using the delete button in the sidebar</li>
            <li>Clear all conversation history with the "Clear conversations" option</li>
          </ul>
          <p className="mt-2">
            If you have additional privacy concerns or requests regarding your data, 
            please contact us using the information in the Contact section.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The updated version will be indicated by
            an updated "Last Updated" date at the top of this page.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, please 
            <Link href="/contact">
              <span className="text-primary hover:underline cursor-pointer ml-1">contact us</span>
            </Link>.
          </p>
        </section>
        
        <p className="text-sm text-muted-foreground/70 pt-6">Last updated: March 3, 2025</p>
      </div>
    </div>
  );
}