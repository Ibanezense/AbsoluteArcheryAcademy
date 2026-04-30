'use client'

import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/button'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/ToastProvider'
import {
  useAdminMembershipRenewalRequests,
  useApproveMembershipRenewalRequest,
} from '@/lib/hooks/useMembershipRenewal'
import { formatSoles } from '@/lib/utils/membershipRenewal'

export default function AdminMembershipRenewalRequests() {
  const { data: requests = [], isLoading, error } = useAdminMembershipRenewalRequests()
  const approveMutation = useApproveMembershipRenewalRequest()
  const toast = useToast()

  async function handleApprove(requestId: string) {
    try {
      await approveMutation.mutateAsync({
        requestId,
        notes: 'Voucher validado por administracion',
      })
      toast.push({ message: 'Membresia activada correctamente.', type: 'success' })
    } catch (approveError: any) {
      toast.push({ message: approveError?.message || 'No se pudo aprobar la solicitud.', type: 'error' })
    }
  }

  if (isLoading) {
    return (
      <section className="card p-5">
        <div className="flex items-center justify-center py-6">
          <Spinner />
        </div>
      </section>
    )
  }

  if (error || requests.length === 0) {
    return null
  }

  return (
    <section className="card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-textpri">Solicitudes de renovacion</h2>
        <p className="text-sm text-textsec">Pagos enviados por alumnos pendientes de validacion.</p>
      </div>

      <div className="space-y-3">
        {requests.map((request) => (
          <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-line bg-bg/40 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar
                url={request.student?.avatar_url || null}
                name={request.student?.full_name || 'Alumno'}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate font-medium text-textpri">{request.student?.full_name || 'Alumno'}</p>
                <p className="text-sm text-textsec">
                  {request.plan?.name || `${request.classes_included} clases`} · {formatSoles(request.requested_price)}
                  {request.is_country_club_price ? ' · CCT' : ''}
                </p>
              </div>
            </div>
            <Button
              onClick={() => handleApprove(request.id)}
              disabled={approveMutation.isPending}
              className="w-full sm:w-auto"
            >
              {approveMutation.isPending ? 'Validando...' : 'Validar y activar'}
            </Button>
          </div>
        ))}
      </div>
    </section>
  )
}
