export const metadata = { title: 'CashFlow AI' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin:0, padding:0, background:'#020817', color:'#e2e8f0', fontFamily:'system-ui,sans-serif' }}>
        {children}
      </body>
    </html>
  )
}
