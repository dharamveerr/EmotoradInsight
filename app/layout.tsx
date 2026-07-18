import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "chatbot.team",
  description: "WhatsApp Chatbot Analytics Dashboard",
  icons: {
    icon: [
      { url: "/favicon.ico?v=4", sizes: "32x32", type: "image/x-icon" },
      { url: "/favicon-192.png?v=4", sizes: "192x192", type: "image/png" },
      { url: "/favicon.png?v=4", sizes: "256x256", type: "image/png" },
    ],
    apple: "/favicon.png?v=4",
    shortcut: "/favicon.ico?v=4",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Apply saved theme before paint to avoid a light/dark flash. Raw
            inline script in <head> runs during HTML parsing, before React.
            type is text/javascript on the server (so it executes) and
            text/plain on the client (so React's dev warning about rendering
            <script> tags is avoided); suppressHydrationWarning covers the
            resulting type mismatch. */}
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
