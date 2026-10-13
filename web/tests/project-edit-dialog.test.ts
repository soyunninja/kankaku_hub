import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/components/projects/ProjectEditDialog.vue', 'utf8')

describe('project edit dialog', () => {
  it('retains the complete project editor surface and parent relation selection', () => {
    expect(source).toContain('v-model="form.name" required')
    expect(source).toContain('v-model="form.client"')
    expect(source).toContain('v-model="form.code"')
    expect(source).toContain('<Label for="p-notes">{{ t(\'projects.notes\') }}</Label>')
    expect(source).toContain('<Textarea id="p-notes" v-model="form.notes" maxlength="5000" rows="4" />')
    expect(source).toContain("t('projects.notesHint')")
    expect(source).toContain('v-model="form.active"')
    expect(source).toContain(':disabled="!selectedClientActive"')
    expect(source).toContain("t('projects.inactiveParentNotice')")
    expect(source).toContain('v-model="form.repoPaths[index]"')
    expect(source).toContain('@click="props.editor.removePath(index)"')
    expect(source).toContain('@click="props.editor.addPath"')
    expect(source).toContain(':disabled="saving || !canWrite || !editing"')
    expect(source).toContain('props.editor.close()')
  })
})
