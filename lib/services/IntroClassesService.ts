import { supabase } from '@/lib/supabaseClient';

export type IntroClientRecord = {
    booking_id: string;
    intro_client_id: string;
    full_name: string;
    age: number;
    phone?: string;
    session_id: string;
    session_start: string;
    session_end: string;
};

export type AvailableIntroSession = {
    session_id: string;
    start_at: string;
    end_at: string;
    capacity: number;
    booked: number;
    available: number;
};

export class IntroClassesService {

    // 1. Obtener los alumnos que vienen de prueba
    static async getUpcomingIntros(): Promise<IntroClientRecord[]> {
        const { data, error } = await supabase
            .from('bookings')
            .select(`
        id,
        session_id,
        sessions!inner ( start_at, end_at ),
        intro_clients!inner ( id, full_name, age, phone )
      `)
            .not('intro_client_id', 'is', 'null')
            .gte('sessions.start_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
            .order('sessions.start_at', { ascending: true });

        if (error) {
            console.error('Error fetching intro classes:', error);
            throw error;
        }

        return (data || []).map((row: any) => ({
            booking_id: row.id,
            intro_client_id: row.intro_clients.id,
            full_name: row.intro_clients.full_name,
            age: row.intro_clients.age,
            phone: row.intro_clients.phone,
            session_id: row.session_id,
            session_start: row.sessions.start_at,
            session_end: row.sessions.end_at,
        }));
    }

    // 2. Obtener turnos con cupo disponible para los próximos 7 días
    static async getAvailableSessions(daysAhead: number = 7): Promise<AvailableIntroSession[]> {
        const now = new Date();
        const future = new Date();
        future.setDate(future.getDate() + daysAhead);

        // Obtener todas las sesiones en ese rango que tengan configurada la distancia de 10m
        const { data: sessionsData, error: sessionsError } = await supabase
            .from('sessions')
            .select(`
                id, 
                start_at, 
                end_at,
                session_distance_allocations!inner (
                    distance_m,
                    slot_capacity,
                    targets
                )
            `)
            .eq('status', 'scheduled')
            .eq('session_distance_allocations.distance_m', 10)
            .gte('start_at', now.toISOString())
            .lte('start_at', future.toISOString())
            .order('start_at', { ascending: true });

        if (sessionsError) throw sessionsError;

        // Obtener los count de bookings agrupados no es trivial sin un RPC en la API Rest de Supabase (sin usar joins complejos).
        // Como son 7 dias y el volumen es manejable, traeremos las reservas y las agruparemos.
        const sessionIds = sessionsData.map(s => s.id);

        if (sessionIds.length === 0) return [];

        const { data: bookingsData, error: bookingsError } = await supabase
            .from('bookings')
            .select('session_id')
            .in('session_id', sessionIds)
            .eq('distance_m', 10)
            .in('status', ['reserved', 'attended', 'no_show']);

        if (bookingsError) throw bookingsError;

        const bookingCounts = bookingsData.reduce((acc, b) => {
            acc[b.session_id] = (acc[b.session_id] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return sessionsData
            .map((s: any) => {
                const booked = bookingCounts[s.id] || 0;

                // Extraer la capacidad desde V3 engine array o objeto unico
                const alloc = Array.isArray(s.session_distance_allocations)
                    ? s.session_distance_allocations[0]
                    : s.session_distance_allocations;

                const slotCapacity = alloc?.slot_capacity || (alloc?.targets ? alloc.targets * 4 : 0);
                const realCapacity = slotCapacity === 0 ? 12 : slotCapacity; // Fallback preventivo

                return {
                    session_id: s.id,
                    start_at: s.start_at,
                    end_at: s.end_at,
                    capacity: realCapacity,
                    booked: booked,
                    available: realCapacity - booked,
                };
            })
            .filter(s => s.available > 0); // Solo devolver los que tienen cupo
    }

    // 3. Registrar "Todo En Uno" (Cliente -> Pago -> Booking)
    static async registerIntroClass(payload: {
        fullName: string;
        age: number;
        phone?: string;
        sessionId: string;
        amountPaid: number;
        paymentMethod: string;
    }): Promise<boolean> {

        // Esta operación requiere de 3 inserts distribuidos (idealmente debería ser un RPC en BD para transaccionalidad, 
        // pero como el schema RLS de admin confía en nosotros, intentaremos insert encadenado validando el último).

        try {
            // a. Insert Client
            const { data: clientData, error: clientErr } = await supabase
                .from('intro_clients')
                .insert({
                    full_name: payload.fullName,
                    age: payload.age,
                    phone: payload.phone
                })
                .select('id')
                .single();

            if (clientErr) throw clientErr;
            const newClientId = clientData.id;

            // b. Insert Booking (para que capture el cupo)
            const { error: bookingErr } = await supabase
                .from('bookings')
                .insert({
                    session_id: payload.sessionId,
                    intro_client_id: newClientId,
                    status: 'reserved',
                    distance_m: 10,
                    bow_usage_type: 'shared_inventory'
                    // no le mandamos user_id, queda NULO validando la constraint
                });

            if (bookingErr) throw bookingErr;

            // c. Insert Payment
            const { error: paymentErr } = await supabase
                .from('intro_payments')
                .insert({
                    intro_client_id: newClientId,
                    amount: payload.amountPaid,
                    payment_method: payload.paymentMethod
                });

            if (paymentErr) {
                console.error('El cupo se reservó pero falló el registro financiero', paymentErr);
            }

            return true;
        } catch (e) {
            console.error('Failed Intro Registration Sequence:', e);
            throw e;
        }
    }
}
