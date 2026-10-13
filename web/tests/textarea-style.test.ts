import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const inputSource = readFileSync(resolve(process.cwd(), 'app/components/ui/input/Input.vue'), 'utf8')
const textareaSource = readFileSync(resolve(process.cwd(), 'app/components/ui/textarea/Textarea.vue'), 'utf8')

function classBinding(source: string): string {
  const match = source.match(/:class="cn\(([\s\S]*?)\)"/)
  expect(match, 'control class binding').toBeTruthy()
  return match![1]!
}

describe('shared textarea styling', () => {
  it('shares input field surface and state indicators without constraining multiline sizing', () => {
    const inputClasses = classBinding(inputSource)
    const textareaClasses = classBinding(textareaSource)

    for (const classes of [inputClasses, textareaClasses]) {
      expect(classes).toContain('control-field')
      expect(classes).toContain('focus-visible:ring-focus-indicator focus-visible:ring-3')
      expect(classes).toContain('aria-invalid:ring-destructive aria-invalid:focus-visible:ring-destructive aria-invalid:ring-3')
    }
    expect(textareaClasses).not.toContain('control-size')
    expect(textareaClasses).toContain('field-sizing-content min-h-16')
    expect(textareaClasses).toContain('disabled:cursor-not-allowed disabled:opacity-50')
    expect(textareaSource).toContain('useVModel')
  })
})
