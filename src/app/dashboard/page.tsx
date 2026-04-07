import { auth } from '../../lib/auth/config'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'superadmin') redirect('/admin')
  redirect('/app')
}
