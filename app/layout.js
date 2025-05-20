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

export const metadata = {
  title: "HelloHi Chat - Chat with your friends",
  description: "Chat with your friends on HelloHi",
  keywords: "chat, messaging, hello hi, hello hi chat",
  authors: [{ name: "Abhay" }],
  openGraph: {
    title: "HelloHi Chat - Chat with your friends",
    description: "Chat with your friends on HelloHi",
    url: "https://hellohi-chat.vercel.app/",
    siteName: "HelloHi Chat",
    
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
