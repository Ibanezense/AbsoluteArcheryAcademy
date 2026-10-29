import { describe, expect, it, vi } from 'vitest'
import { getAdminStudentBirthdayFlags, prepareStudentBirthdayDay, dismissStudentBirthday } from './studentBirthdayService'
const calendar = { today_lima: '2026-10-28', valid_for_ms: 10000 }
const notice = { id:'birthday:s1:2026',source:'birthday' as const,celebration_year:2026,celebration_on:'2026-10-28',title:'Cumpleaños',body:'Texto' }
describe('birthday service', () => {
  it('prepares only the authorized requested context and routes annual dismissal separately', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({data:{ready:true,today_lima:'2026-10-28'},error:null}).mockResolvedValueOnce({data:{success:true,already_closed:false,celebration_year:2026},error:null})
    expect(await prepareStudentBirthdayDay({rpc}, 's1')).toMatchObject({ready:true})
    await dismissStudentBirthday({rpc},'s1',notice)
    expect(rpc.mock.calls).toEqual([['prepare_student_birthday_day',{p_student_id:'s1'}],['dismiss_student_birthday',{p_student_id:'s1',p_celebration_year:2026,p_celebration_on:'2026-10-28'}]])
  })
  it('deduplicates and chunks IDs, does not invent flags for omitted IDs', async () => {
    const rpc=vi.fn().mockResolvedValue({data:{ready:true,calendar,students:[{student_id:'s0',is_birthday_today:true}]},error:null})
    const result=await getAdminStudentBirthdayFlags({rpc},Array.from({length:501},(_,i)=>`s${i}`))
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(result.students).toEqual([{student_id:'s0',is_birthday_today:true}])
    expect(result.deadline_monotonic).toBeGreaterThan(result.received_at_monotonic)
  })
  it('rejects incompatible calendars instead of merging different days',async()=>{
    const rpc=vi.fn().mockResolvedValueOnce({data:{ready:true,calendar,students:[]},error:null}).mockResolvedValueOnce({data:{ready:true,calendar:{...calendar,today_lima:'2026-10-29'},students:[]},error:null})
    await expect(getAdminStudentBirthdayFlags({rpc},Array.from({length:501},(_,i)=>`s${i}`))).rejects.toThrow('día')
  })
  it('distinguishes unavailable daily results and backend errors',async()=>{
    const result=await getAdminStudentBirthdayFlags({rpc:async()=>({data:{ready:false,calendar,students:[]},error:null})},[])
    expect(result.ready).toBe(false)
    await expect(prepareStudentBirthdayDay({rpc:async()=>({data:null,error:{message:'No autorizado',code:'42501'}})},'s1')).rejects.toMatchObject({code:'42501'})
  })
})

it('never accepts an ID not requested and distinguishes partial output',async()=>{
 const result=await getAdminStudentBirthdayFlags({rpc:async()=>({data:{ready:true,calendar,students:[{student_id:'foreign',is_birthday_today:true},{student_id:'s1',is_birthday_today:false}]},error:null})},['s1','s2'])
 expect(result.students).toEqual([{student_id:'s1',is_birthday_today:false}])
})
