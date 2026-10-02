import { describe, expect, it } from 'vitest'
import { parseDashboardPreferences } from '../app/lib/dashboard-preferences'

describe('dashboard preferences', () => {
  it.each([null, '', '{broken', 'null', '[]', '42', '"work"', '{}', '{"metric":"work"}', '{"metric":"cost","stackBy":"unknown"}', '{"metric":"unknown","stackBy":"client"}', '{"metric":[],"stackBy":"project"}', '{"metric":"work","stackBy":"project","extra":true}'])('defaults invalid storage %s', (raw) => {
    expect(parseDashboardPreferences(raw)).toEqual({ metric: 'work', stackBy: 'project' })
  })
  it.each(['work', 'cost'])('accepts %s with each supported grouping', (metric) => {
    for (const stackBy of ['none', 'client', 'project']) {
      expect(parseDashboardPreferences(JSON.stringify({ metric, stackBy }))).toEqual({ metric, stackBy })
    }
  })
})
