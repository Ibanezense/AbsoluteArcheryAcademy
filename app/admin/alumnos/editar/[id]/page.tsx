'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, ImagePlus, KeyRound, Save, ShieldCheck, UserRound } from 'lucide-react'
import AdminGuard from '@/components/AdminGuard'
import { useToast } from '@/components/ui/ToastProvider'
import { supabase } from '@/lib/supabaseClient'
import { useStudentDetail } from '@/lib/hooks/useStudentDetail'
import { studentKeys } from '@/lib/queries/studentQueries'
import { calculateAge } from '@/lib/utils/dateUtils'
import { buildStudentCategory, STUDENT_DIVISIONS, STUDENT_GENDERS } from '@/lib/utils/studentCategory'

type AccountMode = 'student_only' | 'guardian_only' | 'student_and_guardian'

type StudentFormState = {
  full_name: string
  avatar_url: string
  date_of_birth: string
  dni: string
  phone: string
  email: string
  medical_notes: string
  current_distance_m: string
  division: string
  gender: string
  level: string
  has_own_bow: boolean
  assigned_bow: boolean
  bow_poundage: string
  is_active: boolean
  is_country_club_tiabaya_member: boolean
}

type GuardianFormState = {
  full_name: string
  email: string
  phone: string
  dni: string
  relationship: string
}

type CreatedCodes = {
  student_access_code: string | null
  guardian_access_code: string | null
  guardian_reused?: boolean
  guardian_created?: boolean
}

const DISTANCES = [10, 15, 20, 30, 40, 50, 60, 70]

function emptyStudentForm(): StudentFormState {
  return {
    full_name: '',
    avatar_url: '',
    date_of_birth: '',
    dni: '',
    phone: '',
    email: '',
    medical_notes: '',
    current_distance_m: '',
    division: '',
    gender: '',
    level: '',
    has_own_bow: false,
    assigned_bow: false,
    bow_poundage: '',
    is_active: true,
    is_country_club_tiabaya_member: false,
  }
}

function emptyGuardianForm(): GuardianFormState {
  return {
    full_name: '',
    email: '',
    phone: '',
    dni: '',
    relationship: 'Tutor',
  }
}

function buildAccountMode(hasStudentAccess: boolean, hasGuardianAccess: boolean): AccountMode {
  if (hasStudentAccess && hasGuardianAccess) return 'student_and_guardian'
  if (hasGuardianAccess) return 'guardian_only'
  return 'student_only'
}

export default function AdminAlumnoEditorPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const toast = useToast()
  const detailQuery = useStudentDetail(isNew ? '' : id)

  const [studentForm, setStudentForm] = useState<StudentFormState>(emptyStudentForm)
  const [guardianForm, setGuardianForm] = useState<GuardianFormState>(emptyGuardianForm)
  const [accountMode, setAccountMode] = useState<AccountMode>('guardian_only')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createdCodes, setCreatedCodes] = useState<CreatedCodes | null>(null)

  useEffect(() => {
    if (!detailQuery.data || isNew) return

    const data = detailQuery.data
    const hasStudentAccess = !!data.self_account
    const hasGuardianAccess = !!data.guardian

    setStudentForm({
      full_name: data.full_name,
      avatar_url: data.avatar_url || '',
      date_of_birth: data.date_of_birth || '',
      dni: data.dni || '',
      phone: data.phone || '',
      email: data.email || data.self_account?.email || '',
      medical_notes: data.medical_notes || '',
      current_distance_m: data.current_distance_m ? String(data.current_distance_m) : '',
      division: data.division || '',
      gender: data.gender || '',
      level: data.level || '',
      has_own_bow: data.has_own_bow,
      assigned_bow: data.assigned_bow,
      bow_poundage: data.bow_poundage ? String(data.bow_poundage) : '',
      is_active: data.is_active,
      is_country_club_tiabaya_member: data.is_country_club_tiabaya_member,
    })

    setGuardianForm({
      full_name: data.guardian?.full_name || '',
      email: data.guardian?.email || '',
      phone: data.guardian?.phone || '',
      dni: data.guardian?.dni || '',
      relationship: data.guardian?.relationship || 'Tutor',
    })

    setCreatedCodes({
      student_access_code: data.self_account?.access_code || null,
      guardian_access_code: data.guardian?.access_code || null,
    })

    setAccountMode(buildAccountMode(hasStudentAccess, hasGuardianAccess))
  }, [detailQuery.data, isNew])

  const showStudentAccountFields = accountMode !== 'guardian_only'
  const showGuardianFields = accountMode !== 'student_only'
  const computedAge = useMemo(
    () => calculateAge(studentForm.date_of_birth),
    [studentForm.date_of_birth]
  )
  const computedCategory = useMemo(
    () =>
      buildStudentCategory({
        dateOfBirth: studentForm.date_of_birth,
        division: studentForm.division,
        gender: studentForm.gender,
      }) || '',
    [studentForm.date_of_birth, studentForm.division, studentForm.gender]
  )

  const canSubmit = useMemo(() => {
    if (!studentForm.full_name.trim()) return false
    if (showStudentAccountFields && !studentForm.email.trim()) return false
    if (showGuardianFields && (!guardianForm.full_name.trim() || !guardianForm.email.trim())) return false
    return true
  }, [guardianForm.email, guardianForm.full_name, showGuardianFields, showStudentAccountFields, studentForm.email, studentForm.full_name])

  async function uploadAvatar(file?: File) {
    if (!file) return

    try {
      setUploadingAvatar(true)
      const extension = file.name.split('.').pop() || 'jpg'
      const path = `avatars/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      setStudentForm((current) => ({ ...current, avatar_url: data.publicUrl }))
      toast.push({ message: 'Foto actualizada.', type: 'success' })
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo subir la foto.', type: 'error' })
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function submitForm() {
    if (!canSubmit) {
      toast.push({ message: 'Completa los campos obligatorios.', type: 'error' })
      return
    }

    // refreshSession() fuerza la renovación del JWT si está expirado,
    // evitando enviar tokens caducados al API (causa del 401 "Sesion expirada")
    const { data: refreshed } = await supabase.auth.refreshSession()
    const accessToken = refreshed.session?.access_token

    if (!accessToken) {
      toast.push({ message: 'Sesion expirada. Vuelve a iniciar sesion.', type: 'error' })
      return
    }

    setSaving(true)

    try {
      const payload = {
        accountMode,
        student: {
          full_name: studentForm.full_name,
          avatar_url: studentForm.avatar_url || null,
          date_of_birth: studentForm.date_of_birth || null,
          dni: studentForm.dni || null,
          phone: studentForm.phone || null,
          email: studentForm.email || null,
          medical_notes: studentForm.medical_notes || null,
          current_distance_m: studentForm.current_distance_m ? Number(studentForm.current_distance_m) : null,
          division: studentForm.division || null,
          gender: studentForm.gender || null,
          category: computedCategory || null,
          level: studentForm.level || null,
          has_own_bow: studentForm.has_own_bow,
          assigned_bow: studentForm.assigned_bow,
          bow_poundage: studentForm.bow_poundage ? Number(studentForm.bow_poundage) : null,
          is_active: studentForm.is_active,
          is_country_club_tiabaya_member: studentForm.is_country_club_tiabaya_member,
        },
        guardian: showGuardianFields
          ? {
              full_name: guardianForm.full_name,
              email: guardianForm.email,
              phone: guardianForm.phone || null,
              dni: guardianForm.dni || null,
              relationship: guardianForm.relationship || 'Tutor',
            }
          : null,
      }

      const response = await fetch('/api/admin/create-student', {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(isNew ? payload : { ...payload, studentId: id }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('admin-student-save-error', JSON.stringify({
          status: response.status,
          result,
        }, null, 2))

        const errorMessage =
          typeof result?.error === 'string'
            ? result.error
            : result?.error?.message || 'No se pudo guardar el alumno.'

        throw new Error(errorMessage)
      }

      setCreatedCodes({
        student_access_code: result.student_access_code || null,
        guardian_access_code: result.guardian_access_code || null,
        guardian_reused: result.guardian_reused,
        guardian_created: result.guardian_created,
      })

      toast.push({
        message: isNew ? 'Alumno creado correctamente.' : 'Alumno actualizado.',
        type: 'success',
      })

      if (isNew && result.student_id) {
        await queryClient.invalidateQueries({ queryKey: studentKeys.all })
        router.replace(`/admin/alumnos/${result.student_id}`)
        return
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: studentKeys.all }),
        queryClient.invalidateQueries({ queryKey: studentKeys.detail(id) }),
        detailQuery.refetch(),
      ])
    } catch (error: any) {
      toast.push({ message: error.message || 'No se pudo guardar el alumno.', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <section className="rounded-3xl border border-white/10 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                className="btn-ghost mt-1 !px-3"
                onClick={() => router.push(isNew ? '/admin/alumnos' : `/admin/alumnos/${id}`)}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-accent">{isNew ? 'Nuevo' : 'Edicion'}</p>
                <h1 className="mt-2 text-3xl font-bold text-textpri">
                  {isNew ? 'Alta de alumno' : 'Editar alumno'}
                </h1>
                <p className="mt-2 text-sm text-textsec">
                  Configura ficha tecnica, foto, cuenta del alumno y tutor desde una sola pantalla.
                </p>
              </div>
            </div>

            <button className="btn inline-flex items-center justify-center gap-2" onClick={submitForm} disabled={saving || !canSubmit}>
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </section>

        {!isNew && detailQuery.isLoading ? (
          <div className="card p-8 text-center text-textsec">Cargando datos del alumno...</div>
        ) : !isNew && detailQuery.error && !detailQuery.data ? (
          <div className="card p-8 text-center">
            <p className="text-danger">{detailQuery.error instanceof Error ? detailQuery.error.message : 'No se pudo cargar el alumno.'}</p>
            <button className="btn mt-4" onClick={() => router.push('/admin/alumnos')}>
              Volver al listado
            </button>
          </div>
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <div className="rounded-3xl border border-white/10 bg-card p-5">
                  <h2 className="text-lg font-semibold text-textpri">Foto y datos base</h2>
                  <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-24 w-24 overflow-hidden rounded-full bg-white/10">
                        {studentForm.avatar_url ? (
                          <Image
                            src={studentForm.avatar_url}
                            alt={studentForm.full_name || 'Alumno'}
                            width={96}
                            height={96}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="grid h-full w-full place-items-center text-xs text-textsec">Sin foto</div>
                        )}
                      </div>
                      <label className="btn-outline inline-flex cursor-pointer items-center gap-2 text-sm">
                        <ImagePlus className="h-4 w-4" />
                        {uploadingAvatar ? 'Subiendo...' : 'Cambiar foto'}
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => uploadAvatar(event.target.files?.[0])} />
                      </label>
                    </div>

                    <div className="grid flex-1 gap-4 sm:grid-cols-2">
                      <div className="grid gap-2 sm:col-span-2">
                        <label className="text-sm text-textsec">Nombre completo</label>
                        <input
                          className="input"
                          value={studentForm.full_name}
                          onChange={(event) => setStudentForm((current) => ({ ...current, full_name: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm text-textsec">Fecha de nacimiento</label>
                        <input
                          type="date"
                          className="input"
                          value={studentForm.date_of_birth}
                          onChange={(event) => setStudentForm((current) => ({ ...current, date_of_birth: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm text-textsec">DNI</label>
                        <input
                          className="input"
                          value={studentForm.dni}
                          maxLength={8}
                          onChange={(event) => setStudentForm((current) => ({ ...current, dni: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm text-textsec">Edad</label>
                        <input
                          className="input"
                          value={computedAge !== null ? `${computedAge} años` : ''}
                          readOnly
                          placeholder="Se calcula con la fecha de nacimiento"
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm text-textsec">Telefono</label>
                        <input
                          className="input"
                          value={studentForm.phone}
                          onChange={(event) => setStudentForm((current) => ({ ...current, phone: event.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm text-textsec">Estado</label>
                        <select
                          className="input"
                          value={String(studentForm.is_active)}
                          onChange={(event) => setStudentForm((current) => ({ ...current, is_active: event.target.value === 'true' }))}
                        >
                          <option value="true">Activo</option>
                          <option value="false">Inactivo</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-card p-5">
                  <h2 className="text-lg font-semibold text-textpri">Configuracion tecnica</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Distancia actual</label>
                      <select
                        className="input"
                        value={studentForm.current_distance_m}
                        onChange={(event) => setStudentForm((current) => ({ ...current, current_distance_m: event.target.value }))}
                      >
                        <option value="">Sin asignar</option>
                        {DISTANCES.map((distance) => (
                          <option key={distance} value={distance}>
                            {distance} m
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Libraje actual</label>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={studentForm.bow_poundage}
                        onChange={(event) => setStudentForm((current) => ({ ...current, bow_poundage: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">División</label>
                      <select
                        className="input"
                        value={studentForm.division}
                        onChange={(event) => setStudentForm((current) => ({ ...current, division: event.target.value }))}
                      >
                        <option value="">Sin definir</option>
                        {STUDENT_DIVISIONS.map((division) => (
                          <option key={division} value={division}>
                            {division}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Género</label>
                      <select
                        className="input"
                        value={studentForm.gender}
                        onChange={(event) => setStudentForm((current) => ({ ...current, gender: event.target.value }))}
                      >
                        <option value="">Sin definir</option>
                        {STUDENT_GENDERS.map((gender) => (
                          <option key={gender} value={gender}>
                            {gender}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Categoría</label>
                      <input
                        className="input"
                        value={computedCategory}
                        readOnly
                        placeholder="Se compone con división, año de nacimiento y género"
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Nivel</label>
                      <input
                        className="input"
                        value={studentForm.level}
                        onChange={(event) => setStudentForm((current) => ({ ...current, level: event.target.value }))}
                      />
                    </div>
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-bg/40 p-4 text-sm text-textpri">
                      <input
                        type="checkbox"
                        checked={studentForm.has_own_bow}
                        onChange={(event) =>
                          setStudentForm((current) => ({
                            ...current,
                            has_own_bow: event.target.checked,
                            assigned_bow: event.target.checked ? false : current.assigned_bow,
                          }))
                        }
                      />
                      Usa arco propio
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-bg/40 p-4 text-sm text-textpri">
                      <input
                        type="checkbox"
                        checked={studentForm.assigned_bow}
                        onChange={(event) =>
                          setStudentForm((current) => ({
                            ...current,
                            assigned_bow: event.target.checked,
                            has_own_bow: event.target.checked ? false : current.has_own_bow,
                          }))
                        }
                      />
                      Tiene arco asignado
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-bg/40 p-4 text-sm text-textpri">
                      <input
                        type="checkbox"
                        checked={studentForm.is_country_club_tiabaya_member}
                        onChange={(event) =>
                          setStudentForm((current) => ({
                            ...current,
                            is_country_club_tiabaya_member: event.target.checked,
                          }))
                        }
                      />
                      Afiliado al Country Club Tiabaya
                    </label>
                    <div className="grid gap-2 sm:col-span-2">
                      <label className="text-sm text-textsec">Notas medicas o restricciones</label>
                      <textarea
                        className="input min-h-28 resize-y"
                        value={studentForm.medical_notes}
                        onChange={(event) => setStudentForm((current) => ({ ...current, medical_notes: event.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-white/10 bg-card p-5">
                  <h2 className="text-lg font-semibold text-textpri">Accesos</h2>
                  <div className="mt-4 grid gap-4">
                    <div className="grid gap-2">
                      <label className="text-sm text-textsec">Modo de cuenta</label>
                      <select
                        className="input"
                        value={accountMode}
                        onChange={(event) => setAccountMode(event.target.value as AccountMode)}
                      >
                        <option value="guardian_only">Solo tutor</option>
                        <option value="student_only">Solo alumno</option>
                        <option value="student_and_guardian">Alumno y tutor</option>
                      </select>
                    </div>

                    {showStudentAccountFields && (
                      <div className="rounded-2xl border border-white/10 bg-bg/40 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-textpri">
                          <UserRound className="h-4 w-4 text-textsec" />
                          Cuenta del alumno
                        </div>
                        <div className="mt-3 grid gap-3">
                          <div className="grid gap-2">
                            <label className="text-sm text-textsec">Email de acceso</label>
                            <input
                              className="input"
                              value={studentForm.email}
                              onChange={(event) => setStudentForm((current) => ({ ...current, email: event.target.value }))}
                            />
                          </div>
                          <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs text-textpri">
                            <KeyRound className="h-3 w-3 text-textsec" />
                            {createdCodes?.student_access_code || 'Se generara al guardar'}
                          </div>
                        </div>
                      </div>
                    )}

                    {showGuardianFields && (
                      <div className="rounded-2xl border border-white/10 bg-bg/40 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-textpri">
                          <ShieldCheck className="h-4 w-4 text-textsec" />
                          Tutor
                        </div>
                        <div className="mt-3 grid gap-3">
                          <div className="grid gap-2">
                            <label className="text-sm text-textsec">Nombre del tutor</label>
                            <input
                              className="input"
                              value={guardianForm.full_name}
                              onChange={(event) => setGuardianForm((current) => ({ ...current, full_name: event.target.value }))}
                            />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-sm text-textsec">Email del tutor</label>
                            <input
                              className="input"
                              value={guardianForm.email}
                              onChange={(event) => setGuardianForm((current) => ({ ...current, email: event.target.value }))}
                            />
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="grid gap-2">
                              <label className="text-sm text-textsec">Telefono</label>
                              <input
                                className="input"
                                value={guardianForm.phone}
                                onChange={(event) => setGuardianForm((current) => ({ ...current, phone: event.target.value }))}
                              />
                            </div>
                            <div className="grid gap-2">
                              <label className="text-sm text-textsec">DNI</label>
                              <input
                                className="input"
                                maxLength={8}
                                value={guardianForm.dni}
                                onChange={(event) => setGuardianForm((current) => ({ ...current, dni: event.target.value }))}
                              />
                            </div>
                          </div>
                          <div className="grid gap-2">
                            <label className="text-sm text-textsec">Relacion</label>
                            <input
                              className="input"
                              value={guardianForm.relationship}
                              onChange={(event) => setGuardianForm((current) => ({ ...current, relationship: event.target.value }))}
                            />
                          </div>
                          <div className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs text-textpri">
                            <KeyRound className="h-3 w-3 text-textsec" />
                            {createdCodes?.guardian_access_code || 'Se generara o reutilizara al guardar'}
                          </div>
                          {createdCodes?.guardian_reused && (
                            <p className="text-xs text-textsec">Se reutilizara la cuenta existente del tutor para este alumno.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!isNew && detailQuery.data?.active_membership && (
                  <div className="rounded-3xl border border-white/10 bg-card p-5">
                    <h2 className="text-lg font-semibold text-textpri">Membresia activa</h2>
                    <div className="mt-4 rounded-2xl border border-white/10 bg-bg/40 p-4">
                      <p className="font-medium text-textpri">{detailQuery.data.active_membership.custom_name}</p>
                      <p className="mt-2 text-sm text-textsec">
                        {detailQuery.data.active_membership.classes_remaining} clases restantes · vence {detailQuery.data.active_membership.end_date || 'sin fecha'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button className="btn inline-flex items-center justify-center gap-2" onClick={submitForm} disabled={saving || !canSubmit}>
                <Save className="h-4 w-4" />
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button className="btn-outline" onClick={() => router.push(isNew ? '/admin/alumnos' : `/admin/alumnos/${id}`)}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </AdminGuard>
  )
}
