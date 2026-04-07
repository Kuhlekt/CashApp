import { auth } from '../../lib/auth/config'
import { redirect } from 'next/navigation'

// /app — clean URL for the cash application
// Actual HTML is served via /api/serve-app to preserve script execution
export default async function AppPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  redirect('/api/serve-app')
}
