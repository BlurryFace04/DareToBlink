'use client'

import { Inter } from "next/font/google"
import "./globals.css"
import { usePathname } from "next/navigation"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()

  // Default metadata values
  let title = "X Dares"
  let description = "X Dares on Blinks - powered by Catoff"
  let url = `https://xdares.catoff.xyz${pathname}`
  let imageUrl = "https://xdares.catoff.xyz/og.png"

  // Dynamic metadata based on the route
  if (pathname.startsWith("/dare/")) {
    title = "X Dares"
    description = "X Dares on Blinks - powered by Catoff"
    imageUrl = "https://xdares.catoff.xyz/og.png"
  }

  return (
    <html lang="en">
      <head>
        <title>{title}</title>
        <meta name="description" content={description} />

        {/* Facebook Meta Tags */}
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={imageUrl} />

        {/* Twitter Meta Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="xdares.catoff.xyz" />
        <meta property="twitter:url" content={url} />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
