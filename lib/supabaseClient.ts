
'use client'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables')
}

// Configuración para prevenir conversión automática de fechas
// Esto evita que Supabase JS convierta columnas 'date' de PostgreSQL
// causando problemas de zona horaria (dates que se restan/suman un día)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	db: {
		schema: 'public',
	},
	global: {
		headers: {
			'X-Client-Info': 'archery-reservas-pwa',
		},
	},
})
