export type SiteCapacityRow = {
  sessionId: string; site: 'tiabaya' | 'umacollo'; name: string; start: string; end: string;
  occupied: number; academyBowsInUse: number; unknownBowUsage: number
}

export async function fetchAdminSiteCapacity(client: { rpc: (name: 'admin_dashboard_site_capacity') => PromiseLike<{ data: unknown; error: { message?: string } | null }> }): Promise<SiteCapacityRow[]> {
  const { data, error } = await client.rpc('admin_dashboard_site_capacity')
  if (error || !Array.isArray(data)) throw new Error('No se pudo cargar la disponibilidad por sede.')
  return data.map((value): SiteCapacityRow => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Los datos de disponibilidad están incompletos.')
    const row = value as Record<string, unknown>
    const counts = [row.occupied_people, row.academy_bows_in_use, row.unknown_bow_usage]
    if (!row || typeof row.session_id !== 'string' || typeof row.location_name !== 'string' || !['tiabaya', 'umacollo'].includes(String(row.location_code)) || typeof row.start_at !== 'string' || !Number.isFinite(Date.parse(row.start_at)) || typeof row.end_at !== 'string' || !Number.isFinite(Date.parse(row.end_at)) || counts.some(n => typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) || Number(row.academy_bows_in_use) + Number(row.unknown_bow_usage) > Number(row.occupied_people)) throw new Error('Los datos de disponibilidad están incompletos.')
    return { sessionId: row.session_id, site: row.location_code as SiteCapacityRow['site'], name: row.location_name, start: row.start_at, end: row.end_at, occupied: row.occupied_people as number, academyBowsInUse: row.academy_bows_in_use as number, unknownBowUsage: row.unknown_bow_usage as number }
  })
}
