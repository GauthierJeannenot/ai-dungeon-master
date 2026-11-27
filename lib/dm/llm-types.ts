/** Provider-independent, text-only agent transcript. */
export interface TextBlock { type: 'text'; text: string }
export type TextBlockParam = TextBlock
export interface ToolUseBlock {
  type: 'tool_use'; id: string; name: string; input: unknown
  /** Opaque Responses continuation, replayed only to the provider. */
  openaiReasoning?: Record<string, unknown>[]
}
export interface ToolResultBlockParam {
  type: 'tool_result'; tool_use_id: string; content?: string | TextBlock[]; is_error?: boolean
}
export type ContentBlock = TextBlock | ToolUseBlock
export type ContentBlockParam = ContentBlock | ToolResultBlockParam
export interface MessageParam { role: 'user' | 'assistant'; content: string | ContentBlockParam[] }
export interface Tool {
  name: string; description?: string
  input_schema: { type: 'object'; properties?: Record<string, unknown>; required?: string[]; [key: string]: unknown }
}
export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number }
export interface Message {
  id: string; type: 'message'; role: 'assistant'; model: string; content: ContentBlock[]
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | null
  stop_sequence?: string | null; usage: Usage
}
export interface MessageCreateParamsNonStreaming {
  model: string; max_tokens: number; system?: string | TextBlock[]; messages: MessageParam[]; tools?: Tool[]
  tool_choice?: { type: 'auto' | 'any' | 'none'; disable_parallel_tool_use?: boolean } | { type: 'tool'; name: string; disable_parallel_tool_use?: boolean }
  temperature?: number; top_p?: number; stop_sequences?: string[]
}
