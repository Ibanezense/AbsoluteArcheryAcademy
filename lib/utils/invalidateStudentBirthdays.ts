import type { QueryClient } from '@tanstack/react-query'

export async function invalidateStudentBirthdayQueries(client: Pick<QueryClient, 'invalidateQueries'>, studentId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['admin-student-birthdays'] }),
    client.invalidateQueries({ predicate: query => query.queryKey[0] === 'student-notifications' && query.queryKey[2] === studentId }),
  ])
}
