import { expect, it } from 'vitest'
import { memberProjectDestination, memberSessionDestination, memberWorkReturnDestination } from '../app/lib/member-work-navigation'

it('builds flat project and session destinations with encoded path segments and opaque session ids', () => {
  expect(memberProjectDestination('member/a', 'project ?#', '2024-01-01', '2024-01-31')).toEqual({
    path: '/team/member-projects/member%2Fa/project%20%3F%23',
    query: { dateStart: '2024-01-01', dateEnd: '2024-01-31' },
  })
  expect(memberSessionDestination('member/a', 'session ?#&=', '2024-01-01', '2024-01-31')).toEqual({
    path: '/team/member-sessions/member%2Fa',
    query: { session_id: 'session ?#&=', dateStart: '2024-01-01', dateEnd: '2024-01-31' },
  })
})

it('does not build links for blank keys and returns to the member with the selected date range', () => {
  expect(memberProjectDestination('member', '', '2024-01-01', '2024-01-31')).toBeNull()
  expect(memberProjectDestination('', 'project', '2024-01-01', '2024-01-31')).toBeNull()
  expect(memberSessionDestination('member', '   ', '2024-01-01', '2024-01-31')).toBeNull()
  expect(memberWorkReturnDestination('member/a', '2024-01-01', '2024-01-31')).toEqual({
    path: '/team/member%2Fa',
    query: { dateStart: '2024-01-01', dateEnd: '2024-01-31' },
  })
})
