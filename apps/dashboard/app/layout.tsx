import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '../components/AuthProvider'

export const metadata: Metadata = {
  title: 'Event Platform',
  description: 'Universal real-time observability',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}