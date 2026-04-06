import { auth } from '../../lib/auth/config'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  // Immediately redirect to the full app
  redirect('/cashflow-app.html')
}
