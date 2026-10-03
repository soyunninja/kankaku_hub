import { expect, test } from '@playwright/test'
import { apiLogin, comboboxList, comboboxTrigger, login, pbOrigin, pbUrl, selectCombobox } from './helpers'

interface Client { id: string, name: string }
interface Project { id: string, name: string, client: string }
interface Task { id: string, title: string, project: string, status: string }

// Catalog-only regression: no fixture writes, and never run against the owner's :8090 instance.
test('tasks client and project filters constrain board, list and server-paged history', async ({ page, request }) => {
  test.setTimeout(60_000)
  const isolatedStack = (process.env.PW_BASE_URL === 'http://127.0.0.1:3002' && pbOrigin() === 'http://127.0.0.1:8092')
    || (process.env.PW_BASE_URL === 'http://127.0.0.1:3003' && pbOrigin() === 'http://127.0.0.1:8093')
  if (!isolatedStack) {
    throw new Error('Run this read-only spec only against an isolated :3002/:8092 or :3003/:8093 stack')
  }

  const token = await apiLogin(request)
  const headers = { Authorization: token }
  const [clientsResponse, projectsResponse, tasksResponse] = await Promise.all([
    request.get(pbUrl('/api/collections/clients/records?perPage=200'), { headers }),
    request.get(pbUrl('/api/collections/projects/records?perPage=200'), { headers }),
    request.get(pbUrl('/api/collections/tasks/records?perPage=200'), { headers }),
  ])
  expect(clientsResponse.ok()).toBeTruthy()
  expect(projectsResponse.ok()).toBeTruthy()
  expect(tasksResponse.ok()).toBeTruthy()
  const clients = (await clientsResponse.json()).items as Client[]
  const projects = (await projectsResponse.json()).items as Project[]
  const tasks = (await tasksResponse.json()).items as Task[]
  const owners = clients.filter(c => projects.some(p => p.client === c.id))
  expect(owners.length, 'Seed needs projects under two clients').toBeGreaterThanOrEqual(2)
  const [first, second] = owners as [Client, Client, ...Client[]]
  const firstProject = projects.find(p => p.client === first.id)!
  const secondProject = projects.find(p => p.client === second.id)!

  await page.addInitScript(() => window.localStorage.setItem('kankaku-locale', 'en'))
  await login(page)
  await page.goto('/tasks')
  const clientSelect = comboboxTrigger(page, 'Client')
  const projectSelect = comboboxTrigger(page, 'Project')
  const projectList = comboboxList(page, 'Project')
  const assertProjectOptions = async (clientId?: string) => {
    await projectSelect.click()
    const expected = ['All', ...projects.filter(p => !clientId || p.client === clientId).map(p => p.name)].sort()
    await expect.poll(async () => (await projectList.getByRole('option').allTextContents()).map(value => value.trim()).sort()).toEqual(expected)
    await page.keyboard.press('Escape')
    await expect(projectList).toBeHidden()
  }
  await assertProjectOptions()

  await selectCombobox(clientSelect, first.name)
  await assertProjectOptions(first.id)
  await selectCombobox(projectSelect, firstProject.name)
  await selectCombobox(clientSelect, second.name)
  await expect(projectSelect).toContainText('All')
  await assertProjectOptions(second.id)
  await selectCombobox(projectSelect, secondProject.name)
  await selectCombobox(clientSelect, 'All')
  await expect(projectSelect).toContainText(secondProject.name)
  await assertProjectOptions()
  await selectCombobox(clientSelect, second.name)
  await expect(projectSelect).toContainText(secondProject.name)
  await selectCombobox(projectSelect, secondProject.name)

  expect(secondProject.client).toBe(second.id)
  const activeInSecondProject = tasks.filter(t => t.status !== 'done' && t.project === secondProject.id)
  const cards = page.locator('[role="button"][draggable="true"]')
  await expect.poll(() => cards.count()).toBe(activeInSecondProject.length)
  await page.getByRole('group', { name: 'Task view' }).getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.locator('table tbody tr')).toHaveCount(activeInSecondProject.length)

  await page.getByRole('button', { name: 'Completed history' }).click()
  const historyRequest = page.waitForResponse(response => response.url().includes('/api/collections/tasks/records')
    && new URL(response.url()).searchParams.get('filter')?.includes(first.id) === true)
  await selectCombobox(clientSelect, first.name)
  const response = await historyRequest
  expect(response.ok()).toBeTruthy()
  const filter = new URL(response.url()).searchParams.get('filter') ?? ''
  expect(filter).toContain('project.client')
  expect(filter).toContain(first.id)
  const history = await response.json() as { totalItems: number, items: Task[] }
  expect(history.totalItems).toBe(tasks.filter(t => t.status === 'done' && projects.some(p => p.id === t.project && p.client === first.id)).length)
  await expect(page.locator('table tbody tr')).toHaveCount(history.items.length)
  const projectRequest = page.waitForResponse(response => response.url().includes('/api/collections/tasks/records')
    && new URL(response.url()).searchParams.get('filter')?.includes(firstProject.id) === true)
  await selectCombobox(projectSelect, firstProject.name)
  const projectHistory = await projectRequest
  expect(projectHistory.ok()).toBeTruthy()
  const projectPage = await projectHistory.json() as { totalItems: number, items: Task[] }
  expect(projectPage.totalItems).toBe(tasks.filter(t => t.status === 'done' && t.project === firstProject.id).length)
  await expect(page.locator('table tbody tr')).toHaveCount(projectPage.items.length)

  const title = tasks.find(t => t.status === 'done' && t.project === firstProject.id)?.title
  if (title) {
    const searchRequest = page.waitForResponse(response => response.url().includes('/api/collections/tasks/records')
      && new URL(response.url()).searchParams.get('filter')?.includes('title ~') === true)
    await page.getByRole('searchbox', { name: /Search completed task titles/ }).fill(title)
    const searchResponse = await searchRequest
    expect(searchResponse.ok()).toBeTruthy()
    const searchFilter = new URL(searchResponse.url()).searchParams.get('filter') ?? ''
    expect(searchFilter).toContain(first.id)
    expect(searchFilter).toContain(firstProject.id)
  }
})
