// Tipos de base de datos
export type BookingStatus = 'reserved' | 'cancelled' | 'attended' | 'no_show'
export type SessionStatus = 'scheduled' | 'cancelled'
export type UserRole = 'student' | 'coach' | 'admin'
export type GroupType = 'children' | 'youth' | 'adult' | 'assigned' | 'ownbow'

// Profile
export interface Profile {
  id: string
  full_name: string | null
  avatar_url?: string | null
  role?: UserRole
  membership_type?: string | null
  classes_remaining?: number
  membership_start?: string | null
  membership_end?: string | null
  distance_m?: number | null
  group_type?: GroupType | null
  is_active?: boolean
  created_at?: string
}

// Session
export interface Session {
  id: string
  start_at: string
  end_at: string
  coach_id?: string | null
  distance?: number | null
  capacity: number
  status: SessionStatus
  notes?: string | null
  created_at?: string
}

// Session with availability
export interface SessionWithAvailability extends Session {
  spots_left: number
  instructor_name?: string | null
}

// Booking
export interface Booking {
  id: string
  user_id: string
  session_id: string
  status: BookingStatus
  group_type?: GroupType | null
  distance_m?: number | null
  created_at: string
}

// Booking with relations
export interface BookingWithProfile extends Booking {
  profiles: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

export interface BookingWithSession extends Booking {
  sessions: Session | null
}

// Admin specific types
export interface AdminBooking {
  booking_id: string
  student_id: string
  student_name: string
  session_id: string
  start_at: string
  end_at: string
  distance: number
  capacity: number
  current_reservations: number
  status: BookingStatus
  classes_remaining: number
  coach_name: string | null
  booking_created: string
}

export interface AdminStudent {
  id: string
  full_name: string
  avatar_url: string | null
  membership_type: string | null
  classes_remaining: number
  status: 'active' | 'inactive'
}

// Equipment & Infrastructure
export interface Equipment {
  id: string
  name: string
  type: 'bow' | 'target' | 'accessory'
  status: 'available' | 'in_use' | 'maintenance'
  notes?: string | null
  created_at: string
}

export interface ShootingLane {
  id: string
  lane_number: number
  distance_meters: number
  is_active: boolean
  notes?: string | null
  created_at: string
}

// Roster/Attendance
export interface RosterLine {
  session_id: string
  distance_m: number
  targets: number
  reserved_count: number
}

// UI Helper types
export interface ToastMessage {
  message: string
  type: 'success' | 'error' | 'info'
}

export interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}
