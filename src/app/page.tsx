import { redirect } from 'next/navigation'
import { auth } from '../lib/auth/config'

export default async function RootPage() {
  const session = await auth()
  if (session?.user) {
    if (session.user.role === 'superadmin') redirect('/admin')
    redirect('/app')
  }
  redirect('/landing')
}
