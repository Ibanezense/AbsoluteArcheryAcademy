import StudentBookingAgendaPage from '@/components/student/StudentBookingAgendaPage'

export default function EditarReservaPage({ params }: { params: { id: string } }) {
  return <StudentBookingAgendaPage moveBookingId={params.id} />
}
