import './globals.css'

export const metadata = {
  title: 'Roulette Physics Predictor',
  description: 'Physics-based roulette prediction webapp inspired by Doyne Farmer methodology',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}