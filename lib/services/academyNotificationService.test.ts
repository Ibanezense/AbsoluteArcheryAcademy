import { describe, expect, it, vi } from 'vitest'
import { createAcademyNotification, getStudentNotificationFeed, getPreparedStudentNotificationFeed } from './academyNotificationService'

describe('academy notification service', () => {
  it('sends the exact audience and a Lima end date without publishing a preview', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'notice', error: null })
    await createAcademyNotification({ rpc }, { title: ' Aviso ', body: ' Mensaje ', audience: 'all', studentIds: ['unrelated'], endDate: '2026-10-31' }, false)
    expect(rpc).toHaveBeenCalledWith('admin_create_academy_notification', { p_title: 'Aviso', p_body: 'Mensaje', p_audience: 'all', p_student_ids: [], p_expires_at: '2026-11-01T05:00:00.000Z', p_publish: false })
  })
  it('fails closed on malformed feeds and returns backend failures', async () => {
    await expect(getStudentNotificationFeed({ rpc: async () => ({ data: { notices: [], membership: { expired: 'yes' } }, error: null }) }, 'student')).rejects.toThrow()
    await expect(getStudentNotificationFeed({ rpc: async () => ({ data: null, error: { message: 'No autorizado' } }) }, 'student')).rejects.toThrow('No autorizado')
  })
})

it('ignores malformed optional birthday data without losing manual notices',async()=>{
 const base={notices:[{id:'manual',title:'Aviso',body:'Texto'}],membership:{expired:false,state_key:''}}
 const result=await getStudentNotificationFeed({rpc:async()=>({data:{...base,birthday_version:1,birthday_ready:true,calendar:{today_lima:'invalid',valid_for_ms:100},birthday:{}},error:null})},'student')
 expect(result).toEqual(base)
})

it('keeps existing notices when preparation is unavailable on an older schema',async()=>{
 const feed={notices:[{id:'n',title:'Aviso',body:'Texto'}],membership:{expired:false,state_key:''}}
 const rpc=vi.fn().mockResolvedValueOnce({data:null,error:{code:'PGRST202',message:'RPC missing'}}).mockResolvedValueOnce({data:feed,error:null})
 expect(await getPreparedStudentNotificationFeed({rpc},'s1')).toMatchObject(feed)
})
