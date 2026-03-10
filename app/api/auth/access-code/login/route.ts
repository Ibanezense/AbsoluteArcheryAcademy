import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function normalizeAccessCode(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().toUpperCase()
}

function isSupportedAccessCode(value: string) {
  return /^[A-Z0-9]{6,8}$/.test(value)
}

function getRoleRedirect(role: string | null | undefined) {
  if (role === 'admin') return '/admin'
  if (role === 'guardian') return '/hub'
  return '/'
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const accessCode = normalizeAccessCode(body?.accessCode)

    if (!isSupportedAccessCode(accessCode)) {
      return NextResponse.json(
        { error: 'Ingresa un codigo valido.' },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: 'Faltan variables de entorno de Supabase.' },
        { status: 500 }
      )
    }

    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, full_name, is_active')
      .eq('access_code', accessCode)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      )
    }

    if (!profile) {
      return NextResponse.json(
        { error: 'Codigo no reconocido.' },
        { status: 401 }
      )
    }

    if (profile.is_active === false) {
      return NextResponse.json(
        { error: 'Esta cuenta esta inactiva. Contacta al administrador.' },
        { status: 403 }
      )
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id)
    if (userError || !userData.user?.email) {
      return NextResponse.json(
        { error: 'No se pudo preparar el acceso para esta cuenta.' },
        { status: 500 }
      )
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
    })

    if (linkError || !linkData.properties?.email_otp) {
      return NextResponse.json(
        { error: linkError?.message || 'No se pudo generar la sesion.' },
        { status: 500 }
      )
    }

    const { data: authData, error: verifyError } = await authClient.auth.verifyOtp({
      email: userData.user.email,
      token: linkData.properties.email_otp,
      type: 'magiclink',
    })

    if (verifyError || !authData.session) {
      return NextResponse.json(
        { error: verifyError?.message || 'No se pudo abrir la sesion.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      role: profile.role,
      full_name: profile.full_name,
      redirectTo: getRoleRedirect(profile.role),
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Error inesperado.' },
      { status: 500 }
    )
  }
}
