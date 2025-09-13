import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!url || !serviceKey) {
      return new NextResponse('Faltan variables SUPABASE_URL o SERVICE_ROLE_KEY', { status: 500 })
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const {
      email,
      full_name,
      phone,
      group_type,
      is_active = true,
      classes_remaining = 0,
      membership_type,
      membership_start,
      membership_end,
      avatar_url,
    } = body

    if (!email || !full_name) {
      return new NextResponse('email y full_name son requeridos', { status: 400 })
    }

    // 1) Crear usuario en auth (sin iniciar sesión aquí)
    const { data: created, error: e1 } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (e1 || !created?.user) {
      return new NextResponse(`Error creando usuario: ${e1?.message || 'desconocido'}`, { status: 500 })
    }
    const uid = created.user.id

    // 2) Crear fila en profiles
    const { error: e2 } = await admin
      .from('profiles')
      .insert({
        id: uid,
        full_name,
        email,
        phone: phone || null,
        group_type: group_type || null,
        is_active,
        classes_remaining,
        membership_type: membership_type || null,
        membership_start: membership_start || null,
        membership_end: membership_end || null,
        avatar_url: avatar_url || null,
      })
    if (e2) {
      // rollback: borrar user si falla el insert en profiles
      await admin.auth.admin.deleteUser(uid).catch(() => {})
      return new NextResponse(`Error creando perfil: ${e2.message}`, { status: 500 })
    }

    return NextResponse.json({ id: uid })
  } catch (err: any) {
    return new NextResponse(err?.message || 'Error inesperado', { status: 500 })
  }
}
