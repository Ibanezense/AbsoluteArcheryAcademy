import { notFound } from 'next/navigation'
import StudentProgressPage from '@/components/student/progress/StudentProgressPage'

export const dynamic = 'force-dynamic'

export default function MiProgresoPage() {
  if (process.env.STUDENT_PROGRESS_ENABLED !== 'true') notFound()
  return <StudentProgressPage />
}
