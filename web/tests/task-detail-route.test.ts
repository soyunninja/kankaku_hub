import { describe, expect, it } from 'vitest'
import { taskDetailRoute } from '../app/lib/task-detail-route'

describe('task ownership route', () => {
  it('uses only the actual matching project relation', () => {
    expect(taskDetailRoute({ id: 't', project: 'p' }, [{ id: 'other', client: 'wrong' }, { id: 'p', client: 'c' }])).toBe('/organizacion/clientes/c/proyectos/p/tareas/t')
  })
  it('supports protected records with real IDs', () => {
    expect(taskDetailRoute({ id: 't', project: 'protectedproject' }, [{ id: 'protectedproject', client: 'protectedclient' }])).toBe('/organizacion/clientes/protectedclient/proyectos/protectedproject/tareas/t')
  })
  it.each([[[]], [[{ id: 'p', client: '' }]]])('uses the ownership-resolving compatibility route for an unavailable relation', projects => {
    expect(taskDetailRoute({ id: 't', project: 'p' }, projects)).toBe('/organizacion/tareas/t')
  })
})
