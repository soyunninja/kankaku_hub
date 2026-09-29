import { expect, test } from '@playwright/test'
import { apiLogin, comboboxList, comboboxTrigger, login, pbOrigin, pbUrl, selectCombobox } from './helpers'

interface CatalogProject { id: string, name: string, client: string }
interface CatalogClient { id: string, name: string }

// Read the existing rich seed; this spec never creates or edits PB records.
for (const mode of ['grouped', 'flat'] as const) {
  test(`entries project choices track client changes in ${mode} mode`, async ({ page, request }) => {
    test.setTimeout(60_000)
    const isolatedStack = (process.env.PW_BASE_URL === 'http://127.0.0.1:3002' && pbOrigin() === 'http://127.0.0.1:8092')
      || (process.env.PW_BASE_URL === 'http://127.0.0.1:3003' && pbOrigin() === 'http://127.0.0.1:8093')
    if (!isolatedStack) {
      throw new Error('Run this read-only spec only against an isolated :3002/:8092 or :3003/:8093 stack')
    }

    const token = await apiLogin(request)
    const headers = { Authorization: token }
    const [clientsResponse, projectsResponse] = await Promise.all([
      request.get(pbUrl('/api/collections/clients/records?perPage=200'), { headers }),
      request.get(pbUrl('/api/collections/projects/records?perPage=200'), { headers }),
    ])
    expect(clientsResponse.ok()).toBeTruthy()
    expect(projectsResponse.ok()).toBeTruthy()
    const clients = (await clientsResponse.json()).items as CatalogClient[]
    const projects = (await projectsResponse.json()).items as CatalogProject[]
    const owners = clients.filter(c => projects.some(p => p.client === c.id))
    expect(owners.length, 'Rich seed needs projects owned by two distinct clients').toBeGreaterThanOrEqual(2)
    const [first, second] = owners as [CatalogClient, CatalogClient, ...CatalogClient[]]
    const firstProject = projects.find(p => p.client === first.id)!
    const secondProject = projects.find(p => p.client === second.id)!

    await page.addInitScript((flat) => {
      window.localStorage.setItem('kankaku-locale', 'en')
      if (flat) window.localStorage.setItem('kankaku-entries-group-by-session', '0')
    }, mode === 'flat')
    await login(page)
    await page.goto('/entries')
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

    // Switching owner must clear the old project, not merely remove its option.
    await selectCombobox(clientSelect, second.name)
    await assertProjectOptions(second.id)
    await expect(projectSelect).toContainText('All')
    await selectCombobox(projectSelect, secondProject.name)

    // Clearing the client restores every project and retains the valid selection.
    await selectCombobox(clientSelect, 'All')
    await assertProjectOptions()
    await expect(projectSelect).toContainText(secondProject.name)
    await selectCombobox(clientSelect, second.name)
    await assertProjectOptions(second.id)
    await expect(projectSelect).toContainText(secondProject.name)
  })
}
