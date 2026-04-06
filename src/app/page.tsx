// Root → landing page (unauthenticated) or app (authenticated)
import { redirect } from 'next/navigation'
import { auth } from '../lib/auth/config'

export default async function RootPage() {
  const session = await auth()
  if (session?.user) redirect('/cashflow-app.html')
  redirect('/landing')
}
