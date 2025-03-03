import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";

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
            This policy is designed to comply with the UK General Data Protection Regulation (UK GDPR).
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Information We Collect</h2>
          <p>We collect the following types of information:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Message content you send to our AI system</li>
            <li>Conversation history</li>
            <li>Technical data such as IP address, browser type, and device information</li>
            <li>Essential cookies required for the service to function properly</li>
          </ul>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Legal Basis for Processing</h2>
          <p>
            We process your personal data on the following legal grounds:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Consent</strong>: For the use of cookies essential to the service's functionality</li>
            <li><strong>Legitimate Interest</strong>: For providing the AI service and processing conversation data, which is necessary for the functionality you've requested</li>
            <li><strong>Contract</strong>: For fulfilling our obligation to provide you with our AI discovery service</li>
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
          <h2 className="text-xl font-semibold mb-2 text-foreground">Data Retention</h2>
          <p>
            We store your conversations to provide continuity in your experience with GloriaMundo.
            Your conversation data is retained until you explicitly delete it using the tools provided.
            If your account remains inactive for 12 months, we may delete your conversation history.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Data Security</h2>
          <p>
            We implement appropriate technical and organizational measures to protect your personal data:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>In Transit</strong>: All data is encrypted using TLS/SSL when transmitted between your device and our servers, and between our servers and the Perplexity API</li>
            <li><strong>At Rest</strong>: We use industry-standard encryption for stored data and implement access controls to limit who can view your information</li>
          </ul>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Third-Party Services and Data Transfers</h2>
          <p>
            We use the Perplexity API to power our AI responses. Your queries are sent to Perplexity
            solely for the purpose of generating AI responses and not for any other use without your explicit consent.
            We also use Google AdSense for displaying advertisements, which may use cookies to personalize ads.
          </p>
          <p className="mt-2">
            <strong>Cross-Border Transfers</strong>: Your data may be processed outside the UK through the Perplexity API.
            Such transfers are protected by appropriate safeguards such as Standard Contractual Clauses.
            For more information on how Perplexity processes your data, please refer to the 
            <a href="https://www.perplexity.ai/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-primary hover:underline cursor-pointer ml-1">
              Perplexity Privacy Policy
              <ExternalLink className="h-3 w-3 ml-1" />
            </a>.
          </p>
        </section>
        
        <section>
          <h2 className="text-xl font-semibold mb-2 text-foreground">Your Rights Under GDPR</h2>
          <p>Under the UK GDPR, you have the following rights:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Right to access</strong>: You can view your conversation history through the sidebar interface</li>
            <li><strong>Right to erasure</strong>: You can delete individual conversations or clear all conversations using the provided options</li>
            <li><strong>Right to object</strong>: You can object to our processing of your data by contacting us</li>
            <li><strong>Right to restriction</strong>: You can request restriction of processing your data</li>
            <li><strong>Right to data portability</strong>: You can request a copy of your data in a structured format</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights beyond what's available in the application interface,
            please contact us using the information in the Contact section.
          </p>
        </section>
        
        <section id="cookies">
          <h2 className="text-xl font-semibold mb-2 text-foreground">Cookies</h2>
          <p>
            We use cookies on our website, which are categorized as follows:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-2">
            <li>
              <strong>Essential Cookies</strong>: Necessary for the core functionality of our service. These cookies cannot be
              disabled and don't track you for advertising purposes. They are used for:
              <ul className="list-circle pl-6 mt-1 space-y-1 text-xs">
                <li>Remembering your preferences and settings</li>
                <li>Maintaining your session state</li>
                <li>Enabling basic functionality like conversation history</li>
                <li>Storing your cookie consent preferences</li>
              </ul>
            </li>
            <li>
              <strong>Analytics Cookies</strong>: Help us understand how visitors interact with our website, allowing us to improve the user experience.
              These cookies collect anonymous information about page visits and navigation.
            </li>
            <li>
              <strong>Advertising Cookies</strong>: Used to deliver advertisements relevant to your interests, both on our site and others.
              These cookies track your browsing habits to deliver targeted advertising.
            </li>
            <li>
              <strong>Preferences Cookies</strong>: Remember choices you make to enhance your experience, such as saved
              conversation themes or interface customizations.
            </li>
          </ul>
          <p className="mt-2">
            You have complete control over non-essential cookies through our Cookie Preferences settings, accessible at any time via the 
            cookie settings button at the bottom-right of the screen. You can also adjust your browser settings to block cookies, 
            but this may affect the functionality of our service.
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
            If you have any questions about this Privacy Policy or would like to exercise your data protection rights, please 
            <Link href="/contact">
              <span className="text-primary hover:underline cursor-pointer ml-1">contact us</span>
            </Link>.
          </p>
          <p className="mt-2">
            Email: andy@gloriamundo.com
          </p>
        </section>
        
        <p className="text-sm text-muted-foreground/70 pt-6">Last updated: March 3, 2025</p>
      </div>
    </div>
  );
}