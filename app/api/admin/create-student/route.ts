import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { buildStudentCategory, STUDENT_DIVISIONS, STUDENT_GENDERS } from '@/lib/utils/studentCategory'
import { normalizeBooleanValue } from './route-helpers'

type AccountMode = 'student_only' | 'guardian_only' | 'student_and_guardian'

type StudentPayload = {
  full_name: string
  avatar_url?: string | null
  date_of_birth?: string | null
  dni?: string | null
  phone?: string | null
  email?: string | null
  medical_notes?: string | null
  current_distance_m?: number | null
  division?: string | null
  gender?: string | null
  category?: string | null
  level?: string | null
  has_own_bow?: boolean
  assigned_bow?: boolean
  bow_poundage?: number | null
  is_active?: boolean
  is_country_club_tiabaya_member?: boolean
}

type GuardianPayload = {
  full_name: string
  email: string
  phone?: string | null
  dni?: string | null
  relationship?: string | null
}

type CreateBody = {
  accountMode: AccountMode
  student: StudentPayload
  guardian?: GuardianPayload | null
}

type UpdateBody = {
  studentId: string
  accountMode: AccountMode
  student: StudentPayload
  guardian?: GuardianPayload | null
}

const ACCESS_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized === '' ? null : normalized
}

function normalizeOptionalDate(value: unknown) {
  const normalized = normalizeText(value)
  return normalized === '' ? null : normalized
}

function normalizeOptionalDni(value: unknown) {
  const normalized = normalizeText(value)
  if (normalized === '') return null
  return normalized
}

function formatErrorMessage(stage: string, error: any, fallback: string) {
  const parts = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code ? `code=${error.code}` : null,
  ].filter(Boolean)

  if (parts.length === 0) {
    return `${fallback} [${stage}]`
  }

  return `${parts.join(' | ')} [${stage}]`
}

function serializeError(stage: string, error: any, fallback: string) {
  return {
    stage,
    message: formatErrorMessage(stage, error, fallback),
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  }
}

function validateDniField(value: unknown, label: string) {
  const normalized = normalizeOptionalDni(value)
  if (normalized && !/^[0-9]{8}$/.test(normalized)) {
    return `${label} debe tener exactamente 8 digitos.`
  }
  return null
}

function generateAccessCode(length = 6) {
  let result = ''

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * ACCESS_CODE_CHARS.length)
    result += ACCESS_CODE_CHARS[randomIndex]
  }

  return result
}

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null

  if (!url || !anonKey) {
    throw new Error('Faltan variables publicas de Supabase.')
  }

  return { url, anonKey, serviceKey }
}

async function requireAdminRequest(req: Request) {
  const { url, anonKey, serviceKey } = getEnv()
  const authHeader = req.headers.get('authorization') || ''

  if (!authHeader.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Sesion invalida.' }, { status: 401 }) }
  }

  const accessToken = authHeader.replace('Bearer ', '').trim()
  if (!accessToken) {
    return { error: NextResponse.json({ error: 'Sesion invalida.' }, { status: 401 }) }
  }

  const actorClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })

  const adminClient = serviceKey
    ? createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    : actorClient

  const { data: authData, error: authError } = await actorClient.auth.getUser(accessToken)
  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: 'Sesion expirada.' }, { status: 401 }) }
  }

  const { data: actorProfile, error: actorError } = await actorClient
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', authData.user.id)
    .maybeSingle()

  if (actorError || !actorProfile) {
    return { error: NextResponse.json({ error: 'No se pudo validar al administrador.' }, { status: 403 }) }
  }

  if (actorProfile.role !== 'admin' || actorProfile.is_active === false) {
    return { error: NextResponse.json({ error: 'No autorizado.' }, { status: 403 }) }
  }

  return { admin: adminClient, actorId: actorProfile.id, hasServiceRole: !!serviceKey }
}

async function generateUniqueAccessCode(admin: SupabaseClient) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = generateAccessCode()
    const { data: existingCode } = await admin
      .from('profiles')
      .select('id')
      .eq('access_code', candidate)
      .maybeSingle()

    if (!existingCode) return candidate
  }

  throw new Error('No se pudo generar un codigo de acceso unico.')
}

async function findGuardianProfile(admin: SupabaseClient, guardian: GuardianPayload) {
  const email = normalizeNullableText(guardian.email)
  const dni = normalizeOptionalDni(guardian.dni)

  // Buscar solo perfiles con role=guardian
  if (email) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, email, phone, dni, access_code, is_active, role')
      .eq('role', 'guardian')
      .eq('email', email)
      .maybeSingle()

    if (data) return data
  }

  if (dni) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, email, phone, dni, access_code, is_active, role')
      .eq('role', 'guardian')
      .eq('dni', dni)
      .maybeSingle()

    if (data) return data
  }

  return null
}

// Busca o crea un perfil de tutor, manejando todos los edge cases:
// - Si ya existe un profile guardian con ese email → reusa
// - Si existe el email en auth.users pero sin profile guardian → crea profile guardian
// - Si no existe en ningun lado → crea auth user + profile
async function findOrCreateGuardianForStudent(
  admin: SupabaseClient,
  guardian: GuardianPayload,
  hasServiceRole: boolean,
) {
  // 1. Buscar si ya existe un perfil guardian con ese email/DNI
  const existing = await findGuardianProfile(admin, guardian)
  if (existing) {
    // Actualizar datos del guardian existente
    await admin
      .from('profiles')
      .update({
        full_name: normalizeText(guardian.full_name),
        phone: normalizeNullableText(guardian.phone),
        dni: normalizeOptionalDni(guardian.dni),
      })
      .eq('id', existing.id)

    return { id: existing.id, access_code: existing.access_code, reused: true }
  }

  // 2. No hay perfil guardian → verificar si el email ya existe en profiles ACTIVOS con otro rol
  const email = normalizeText(guardian.email)
  const { data: conflictProfile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()

  if (conflictProfile) {
    throw new Error(
      `El email ${email} ya pertenece a un perfil con rol "${conflictProfile.role}". ` +
      `Usa un email diferente para el tutor.`
    )
  }

  // 3. Necesitamos crear un nuevo perfil guardian → requiere service role
  if (!hasServiceRole) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para crear la cuenta del tutor.')
  }

  const accessCode = await generateUniqueAccessCode(admin)

  // 4. Intentar crear usuario auth
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: normalizeText(guardian.full_name) },
    app_metadata: { role: 'guardian' },
  })

  let userId: string
  let authUserReused = false

  if (createError) {
    // Si el email ya existe en auth.users (usuario huerfano sin profile)
    const isEmailTaken = createError.message?.toLowerCase().includes('already been registered')
    if (!isEmailTaken) {
      throw new Error(createError.message || 'No se pudo crear la cuenta del tutor.')
    }

    // Buscar el usuario auth huerfano
    const { data: userList, error: listError } = await admin.auth.admin.listUsers()
    if (listError) throw new Error(listError.message)

    const orphanUser = userList.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )
    if (!orphanUser) {
      throw new Error('El email ya esta registrado pero no se pudo encontrar la cuenta.')
    }

    userId = orphanUser.id
    authUserReused = true
  } else {
    if (!created.user) throw new Error('No se pudo crear la cuenta del tutor.')
    userId = created.user.id
  }

  // 5. Crear perfil de guardian
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: userId,
      full_name: normalizeText(guardian.full_name),
      email,
      phone: normalizeNullableText(guardian.phone),
      dni: normalizeOptionalDni(guardian.dni),
      role: 'guardian',
      is_active: true,
      access_code: accessCode,
    }, { onConflict: 'id' })

  if (profileError) {
    if (!authUserReused) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined)
    }
    throw new Error(profileError.message)
  }

  return { id: userId, access_code: accessCode, reused: false }
}

async function createManagedProfile(
  admin: SupabaseClient,
  input: {
    email: string
    full_name: string
    phone?: string | null
    dni?: string | null
    role: 'guardian' | 'student'
    is_active?: boolean
  }
) {
  const accessCode = await generateUniqueAccessCode(admin)

  // Intentar crear el usuario en auth
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
    app_metadata: { role: input.role },
  })

  // Si el email ya existe en auth, reusar el usuario existente (caso: alumno eliminado y re-registrado)
  if (createError?.message?.includes('already been registered')) {
    const { data: existingUsers } = await admin.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === input.email.toLowerCase()
    )

    if (!existingUser) {
      throw new Error('El email esta registrado en auth pero no se encontro el usuario.')
    }

    // Reactivar el perfil existente con los datos nuevos
    const profileUpsert = {
      id: existingUser.id,
      full_name: input.full_name,
      email: input.email,
      phone: normalizeNullableText(input.phone),
      dni: normalizeOptionalDni(input.dni),
      role: input.role,
      is_active: input.is_active ?? true,
      access_code: accessCode,
    }

    const { error: profileError } = await admin
      .from('profiles')
      .upsert(profileUpsert, { onConflict: 'id' })

    if (profileError) {
      throw new Error(profileError.message)
    }

    return {
      id: existingUser.id,
      access_code: accessCode,
      reused: true,
    }
  }

  if (createError || !created.user) {
    throw new Error(createError?.message || 'No se pudo crear la cuenta.')
  }

  const profileInsert = {
    id: created.user.id,
    full_name: input.full_name,
    email: input.email,
    phone: normalizeNullableText(input.phone),
    dni: normalizeOptionalDni(input.dni),
    role: input.role,
    is_active: input.is_active ?? true,
    access_code: accessCode,
  }

  const { error: profileError } = await admin
    .from('profiles')
    .upsert(profileInsert, { onConflict: 'id' })
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => undefined)
    throw new Error(profileError.message)
  }

  return {
    id: created.user.id,
    access_code: accessCode,
    reused: false,
  }
}

async function getProfileAccessCode(admin: SupabaseClient, profileId: string | null | undefined) {
  if (!profileId) return null

  const { data } = await admin
    .from('profiles')
    .select('access_code')
    .eq('id', profileId)
    .maybeSingle()

  return data?.access_code || null
}

function validateCreateBody(body: CreateBody) {
  const accountMode = body.accountMode
  const student = body.student

  if (!student || normalizeText(student.full_name) === '') {
    return 'El nombre del alumno es obligatorio.'
  }

  if (!['student_only', 'guardian_only', 'student_and_guardian'].includes(accountMode)) {
    return 'Modo de cuenta invalido.'
  }

  if (accountMode !== 'guardian_only' && normalizeText(student.email) === '') {
    return 'El alumno necesita email si tendra cuenta propia.'
  }

  const studentDniError = validateDniField(student.dni, 'El DNI del alumno')
  if (studentDniError) return studentDniError

  if (student.division && !STUDENT_DIVISIONS.includes(student.division as any)) {
    return 'La division del alumno es invalida.'
  }

  if (student.gender && !STUDENT_GENDERS.includes(student.gender as any)) {
    return 'El genero del alumno es invalido.'
  }

  if (accountMode !== 'student_only') {
    if (!body.guardian || normalizeText(body.guardian.full_name) === '' || normalizeText(body.guardian.email) === '') {
      return 'El tutor necesita nombre y email.'
    }

    const guardianDniError = validateDniField(body.guardian.dni, 'El DNI del tutor')
    if (guardianDniError) return guardianDniError
  }

  return null
}

function validateUpdateBody(body: UpdateBody) {
  if (!body.studentId) return 'Alumno invalido.'
  return validateCreateBody({
    accountMode: body.accountMode,
    student: body.student,
    guardian: body.guardian,
  })
}

function studentRowFromPayload(student: StudentPayload, existingAffiliation?: boolean | null) {
  const dateOfBirth = normalizeOptionalDate(student.date_of_birth)
  const division = normalizeNullableText(student.division)
  const gender = normalizeNullableText(student.gender)

  return {
    full_name: normalizeText(student.full_name),
    avatar_url: normalizeNullableText(student.avatar_url),
    date_of_birth: dateOfBirth,
    dni: normalizeOptionalDni(student.dni),
    phone: normalizeNullableText(student.phone),
    email: normalizeNullableText(student.email),
    medical_notes: normalizeNullableText(student.medical_notes),
    current_distance_m: student.current_distance_m ?? null,
    division,
    gender,
    category: buildStudentCategory({
      dateOfBirth,
      division,
      gender,
      fallbackCategory: normalizeNullableText(student.category),
    }),
    level: normalizeNullableText(student.level),
    has_own_bow: !!student.has_own_bow,
    assigned_bow: !!student.assigned_bow,
    bow_poundage: student.bow_poundage ?? null,
    is_active: student.is_active ?? true,
    is_country_club_tiabaya_member: normalizeBooleanValue(
      student.is_country_club_tiabaya_member,
      existingAffiliation ?? false,
    ),
  }
}

function getSingleRelation<T>(value: T | T[] | null | undefined) {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function getRelationList<T>(value: T | T[] | null | undefined) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

async function handleCreate(req: Request) {
  const auth = await requireAdminRequest(req)
  if ('error' in auth) return auth.error

  const body = (await req.json()) as CreateBody
  const validationError = validateCreateBody(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { admin, actorId } = auth
  const createdUserIds: string[] = []
  let stage = 'create:init'

  try {
    stage = 'create:normalize-student'
    const student = studentRowFromPayload(body.student)
    const accountMode = body.accountMode

    let selfProfileId: string | null = null
    let studentAccessCode: string | null = null

    if (accountMode !== 'guardian_only') {
      if (!auth.hasServiceRole) {
        return NextResponse.json(
          { error: 'Falta SUPABASE_SERVICE_ROLE_KEY para crear cuentas nuevas de alumno.' },
          { status: 500 }
        )
      }

      stage = 'create:create-student-profile'
      const createdStudentProfile = await createManagedProfile(admin, {
        email: normalizeText(body.student.email),
        full_name: student.full_name,
        phone: student.phone,
        dni: student.dni,
        role: 'student',
        is_active: student.is_active,
      })

      createdUserIds.push(createdStudentProfile.id)
      selfProfileId = createdStudentProfile.id
      studentAccessCode = createdStudentProfile.access_code
    }

    let guardianProfileId: string | null = null
    let guardianAccessCode: string | null = null
    let guardianReused = false

    if (accountMode !== 'student_only' && body.guardian) {
      stage = 'create:find-or-create-guardian'
      const guardianResult = await findOrCreateGuardianForStudent(admin, body.guardian, auth.hasServiceRole)
      guardianProfileId = guardianResult.id
      guardianAccessCode = guardianResult.access_code
      guardianReused = guardianResult.reused
      if (!guardianResult.reused) createdUserIds.push(guardianResult.id)
    }

    stage = 'create:insert-student'
    const { data: insertedStudent, error: studentInsertError } = await admin
      .from('students')
      .insert({
        ...student,
        is_country_club_tiabaya_member: student.is_country_club_tiabaya_member,
        self_profile_id: selfProfileId,
        created_by: actorId,
      })
      .select('id')
      .single()

    if (studentInsertError || !insertedStudent) {
      throw new Error(studentInsertError?.message || 'No se pudo crear el alumno.')
    }

    if (guardianProfileId) {
      stage = 'create:link-guardian'
      const { error: guardianLinkError } = await admin.from('student_guardians').insert({
        student_id: insertedStudent.id,
        guardian_profile_id: guardianProfileId,
        relationship: normalizeNullableText(body.guardian?.relationship) || 'Tutor',
        created_by: actorId,
      })

      if (guardianLinkError) {
        throw new Error(guardianLinkError.message)
      }
    }

    return NextResponse.json({
      student_id: insertedStudent.id,
      student_access_code: studentAccessCode,
      guardian_access_code: guardianAccessCode,
      guardian_reused: guardianReused,
    })
  } catch (error: any) {
    await Promise.all(createdUserIds.map((userId) => auth.admin.auth.admin.deleteUser(userId).catch(() => undefined)))
    console.error('admin-create-student error', { stage, error })

    return NextResponse.json(
      { error: serializeError(stage, error, 'Error inesperado al crear el alumno.') },
      { status: 500 }
    )
  }
}

async function handleUpdate(req: Request) {
  const auth = await requireAdminRequest(req)
  if ('error' in auth) return auth.error

  const body = (await req.json()) as UpdateBody
  const validationError = validateUpdateBody(body)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { admin, actorId } = auth
  let stage = 'update:load-student'

  stage = 'update:select-existing-student'
  const { data: existingStudent, error: existingStudentError } = await admin
    .from('students')
    .select(`
      id,
      self_profile_id,
      is_country_club_tiabaya_member,
      guardians:student_guardians (
        id,
        relationship,
        guardian_profile_id
      )
    `)
    .eq('id', body.studentId)
    .maybeSingle()

  if (existingStudentError || !existingStudent) {
    return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 })
  }

  try {
    stage = 'update:normalize-student'
    const student = studentRowFromPayload(
      body.student,
      (existingStudent as any).is_country_club_tiabaya_member
    )
    const accountMode = body.accountMode
    const existingGuardianLink = getSingleRelation((existingStudent as any).guardians)

    stage = 'update:update-student-row'
    const { error: studentUpdateError } = await admin
      .from('students')
      .update({
        ...student,
        is_country_club_tiabaya_member: student.is_country_club_tiabaya_member,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.studentId)

    if (studentUpdateError) throw new Error(studentUpdateError.message)

    let selfAccessCode: string | null = null
    let guardianAccessCode: string | null = null
    let guardianCreated = false
    const existingSelfProfileId = (existingStudent as any).self_profile_id as string | null

    // --- Manejar transiciones de modo para self_profile ---
    if (existingSelfProfileId && accountMode === 'guardian_only') {
      // Transición a guardian_only: desactivar perfil propio del alumno
      stage = 'update:deactivate-self-profile'
      await admin
        .from('profiles')
        .update({ is_active: false, access_code: null })
        .eq('id', existingSelfProfileId)

      stage = 'update:unlink-self-profile'
      await admin
        .from('students')
        .update({ self_profile_id: null, updated_at: new Date().toISOString() })
        .eq('id', body.studentId)

    } else if (existingSelfProfileId) {
      // Ya tiene perfil propio → actualizarlo
      stage = 'update:update-self-profile'
      const { error: selfUpdateError } = await admin
        .from('profiles')
        .update({
          full_name: student.full_name,
          email: student.email,
          phone: student.phone,
          dni: student.dni,
          is_active: student.is_active,
        })
        .eq('id', existingSelfProfileId)

      if (selfUpdateError) throw new Error(selfUpdateError.message)
      stage = 'update:read-self-access-code'
      selfAccessCode = await getProfileAccessCode(admin, existingSelfProfileId)

    } else if (accountMode !== 'guardian_only') {
      // No tiene perfil propio y lo necesita → crear
      if (!auth.hasServiceRole) {
        return NextResponse.json(
          { error: 'Falta SUPABASE_SERVICE_ROLE_KEY para crear la cuenta del alumno.' },
          { status: 500 }
        )
      }

      stage = 'update:create-self-profile'
      const createdStudentProfile = await createManagedProfile(admin, {
        email: normalizeText(body.student.email),
        full_name: student.full_name,
        phone: student.phone,
        dni: student.dni,
        role: 'student',
        is_active: student.is_active,
      })

      stage = 'update:link-self-profile'
      const { error: linkSelfError } = await admin
        .from('students')
        .update({
          self_profile_id: createdStudentProfile.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.studentId)

      if (linkSelfError) throw new Error(linkSelfError.message)
      selfAccessCode = createdStudentProfile.access_code
    }

    if (accountMode !== 'student_only' && body.guardian) {
      if (existingGuardianLink) {
        const guardianProfileId = existingGuardianLink.guardian_profile_id as string
        stage = 'update:update-existing-guardian-profile'
        const { error: guardianUpdateError } = await admin
          .from('profiles')
          .update({
            full_name: normalizeText(body.guardian.full_name),
            email: normalizeText(body.guardian.email),
            phone: normalizeNullableText(body.guardian.phone),
            dni: normalizeOptionalDni(body.guardian.dni),
          })
          .eq('id', guardianProfileId)

        if (guardianUpdateError) throw new Error(guardianUpdateError.message)
        stage = 'update:read-guardian-access-code'
        guardianAccessCode = await getProfileAccessCode(admin, guardianProfileId)

        stage = 'update:update-guardian-link'
        const { error: guardianLinkUpdateError } = await admin
          .from('student_guardians')
          .update({
            relationship: normalizeNullableText(body.guardian.relationship) || 'Tutor',
          })
          .eq('id', existingGuardianLink.id)

        if (guardianLinkUpdateError) throw new Error(guardianLinkUpdateError.message)
      } else {
        stage = 'update:find-or-create-guardian'
        const guardianResult = await findOrCreateGuardianForStudent(admin, body.guardian, auth.hasServiceRole)
        guardianAccessCode = guardianResult.access_code
        guardianCreated = !guardianResult.reused

        stage = 'update:insert-guardian-link'
        const { error: guardianLinkInsertError } = await admin.from('student_guardians').insert({
          student_id: body.studentId,
          guardian_profile_id: guardianResult.id,
          relationship: normalizeNullableText(body.guardian.relationship) || 'Tutor',
          created_by: actorId,
        })

        if (guardianLinkInsertError) throw new Error(guardianLinkInsertError.message)
      }
    }



    return NextResponse.json({
      student_id: body.studentId,
      student_access_code: selfAccessCode,
      guardian_access_code: guardianAccessCode,
      guardian_created: guardianCreated,
    })
  } catch (error: any) {
    console.error('admin-update-student error', { stage, error })
    return NextResponse.json(
      { error: serializeError(stage, error, 'Error inesperado al actualizar el alumno.') },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    return await handleCreate(req)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error inesperado.' },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    return await handleUpdate(req)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error inesperado.' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAdminRequest(req)
    if ('error' in auth) return auth.error

    const url = new URL(req.url)
    const studentId = normalizeText(url.searchParams.get('studentId'))

    if (!studentId) {
      return NextResponse.json({ error: 'Alumno invalido.' }, { status: 400 })
    }

    const { admin } = auth
    let stage = 'delete:load-student'

    stage = 'delete:select-student'
    const { data: studentRow, error: studentError } = await admin
      .from('students')
      .select(`
        id,
        full_name,
        self_profile_id,
        guardians:student_guardians (
          guardian_profile_id
        )
      `)
      .eq('id', studentId)
      .maybeSingle()

    if (studentError || !studentRow) {
      return NextResponse.json({ error: 'Alumno no encontrado.' }, { status: 404 })
    }

    const typedStudent = studentRow as any
    const selfProfileId = typedStudent.self_profile_id as string | null
    const guardianIds = getRelationList(typedStudent.guardians as { guardian_profile_id: string | null } | Array<{ guardian_profile_id: string | null }>)
      .map((row) => row.guardian_profile_id)
      .filter(Boolean) as string[]

    stage = 'delete:delete-student'
    const { error: deleteStudentError } = await admin
      .from('students')
      .delete()
      .eq('id', studentId)

    if (deleteStudentError) {
      return NextResponse.json({ error: deleteStudentError.message }, { status: 500 })
    }

    if (selfProfileId) {
      stage = 'delete:disable-self-profile'
      await admin
        .from('profiles')
        .update({
          is_active: false,
          access_code: null,
        })
        .eq('id', selfProfileId)
    }

    for (const guardianProfileId of guardianIds) {
      stage = 'delete:count-guardian-links'
      const { count } = await admin
        .from('student_guardians')
        .select('id', { count: 'exact', head: true })
        .eq('guardian_profile_id', guardianProfileId)

      if ((count || 0) === 0) {
        stage = 'delete:disable-orphan-guardian'
        await admin
          .from('profiles')
          .update({
            is_active: false,
          })
          .eq('id', guardianProfileId)
      }
    }

    return NextResponse.json({
      deleted: true,
      student_id: studentId,
      full_name: typedStudent.full_name,
    })
  } catch (error: any) {
    console.error('admin-delete-student error', { error })
    return NextResponse.json(
      { error: serializeError('delete:unknown', error, 'Error inesperado.') },
      { status: 500 }
    )
  }
}
