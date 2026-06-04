export interface NormalizedToolInput {
  input?: Record<string, unknown>
  changed: boolean
  corrections: string[]
  error?: {
    error: string
    code: string
    detail?: Record<string, unknown>
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return isObjectRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function normalizeLlmToolInput(toolName: string, rawInput: unknown): NormalizedToolInput {
  if (!isObjectRecord(rawInput)) {
    return {
      changed: false,
      corrections: [],
      error: {
        error: `Invalid ${toolName} input: expected an object.`,
        code: 'INVALID_TOOL_INPUT',
      },
    }
  }

  const input = { ...rawInput }
  const corrections: string[] = []

  if (toolName === 'resolve_player_action' && typeof input.action === 'string') {
    const parsedAction = parseJsonObject(input.action.trim())
    if (!parsedAction) {
      return {
        changed: false,
        corrections,
        error: {
          error: 'Invalid resolve_player_action input: action was a string, but not a valid JSON object.',
          code: 'INVALID_STRINGIFIED_ACTION',
          detail: {
            actionPreview: input.action.slice(0, 160),
          },
        },
      }
    }

    input.action = parsedAction
    corrections.push('parsed_stringified_action')
  }

  return {
    input,
    changed: corrections.length > 0,
    corrections,
  }
}
