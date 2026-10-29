import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { buildStudentBirthdayWhatsAppUrl } from '@/lib/utils/studentBirthdayWhatsApp'

type Props = { studentId: string; studentName: string; phone: string | null | undefined }

export default function StudentBirthdayAction({ studentId, studentName, phone }: Props) {
  const url = buildStudentBirthdayWhatsAppUrl(phone, studentName)
  const className = 'mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600'
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Saludar a ${studentName} por WhatsApp`} className={className}><MessageCircle className="h-4 w-4" aria-hidden="true" />Saludar por WhatsApp</a>
    : <Link href={`/admin/alumnos/${studentId}`} className={className}>Revisar contacto</Link>
}
