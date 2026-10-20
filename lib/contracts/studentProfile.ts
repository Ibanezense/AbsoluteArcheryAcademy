export type StudentProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  date_of_birth: string | null
  email: string | null
  phone: string | null
  division: string | null
  gender: string | null
  level: string | null
  category: string | null
  current_distance_m: number | null
  has_own_bow: boolean | null
  bow_poundage: number | null
}

export type StudentProfileResponse = {
  student_id: string
  profile: StudentProfile
  checked_at: string
}
