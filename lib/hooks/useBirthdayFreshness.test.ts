// @vitest-environment jsdom
import {act,renderHook,cleanup} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {useBirthdayFreshness} from './useBirthdayFreshness'
afterEach(()=>{cleanup();vi.useRealTimers()})
it('expires independently of the device wall clock and notifies once',()=>{
 vi.useFakeTimers(); const expired=vi.fn(); const now=performance.now(); const snap={received_at_monotonic:now,deadline_monotonic:now+1000}
 const {result}=renderHook(()=>useBirthdayFreshness('s1',snap,expired)); expect(result.current).toBe(true)
 act(()=>vi.advanceTimersByTime(1001)); expect(result.current).toBe(false); expect(expired).toHaveBeenCalledTimes(1)
})
it('requires a fresh response after backgrounding and rejects a previous scope snapshot',()=>{
 const now=performance.now();const snap={received_at_monotonic:now,deadline_monotonic:now+100000}
 const {result,rerender}=renderHook(({scope,snapshot})=>useBirthdayFreshness(scope,snapshot),{initialProps:{scope:'s1',snapshot:snap}})
 expect(result.current).toBe(true)
 act(()=>window.dispatchEvent(new Event('focus')));expect(result.current).toBe(false)
 rerender({scope:'s1',snapshot:{received_at_monotonic:performance.now()+1,deadline_monotonic:now+100000}}); expect(result.current).toBe(true)
 rerender({scope:'s2',snapshot:snap});expect(result.current).toBe(false)
})

it('does not accept an in-flight response begun before focus and requests a new check',()=>{
 const refresh=vi.fn(); const before=performance.now()-100
 const {result,rerender}=renderHook(({snapshot})=>useBirthdayFreshness('s1',snapshot,refresh),{initialProps:{snapshot:{request_started_at_monotonic:before,received_at_monotonic:before+1,deadline_monotonic:before+100000}}})
 act(()=>window.dispatchEvent(new Event('focus')))
 rerender({snapshot:{request_started_at_monotonic:before,received_at_monotonic:performance.now()+1,deadline_monotonic:before+100000}})
 expect(result.current).toBe(false);expect(refresh).toHaveBeenCalled()
})

it('rejects a result fetched in the background until a request starts after returning visible',()=>{
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
 const now=performance.now()
 const {result,rerender}=renderHook(({snapshot})=>useBirthdayFreshness('s1',snapshot),{initialProps:{snapshot:{request_started_at_monotonic:now,received_at_monotonic:now,deadline_monotonic:now+100000}}})
 act(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
 const backgroundStart=performance.now()
 rerender({snapshot:{request_started_at_monotonic:backgroundStart,received_at_monotonic:backgroundStart+1,deadline_monotonic:now+100000}})
 expect(result.current).toBe(false)
 act(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'))})
 rerender({snapshot:{request_started_at_monotonic:backgroundStart,received_at_monotonic:backgroundStart+1,deadline_monotonic:now+100000}})
 expect(result.current).toBe(false)
 const visibleStart=performance.now()+1
 rerender({snapshot:{request_started_at_monotonic:visibleStart,received_at_monotonic:visibleStart+1,deadline_monotonic:now+100000}})
 expect(result.current).toBe(true)
})
