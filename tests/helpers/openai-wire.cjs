// Small wire fixtures shared by offline OpenAI transport/integration tests.
exports.text = text => ({ type: 'message', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text, annotations: [] }] })
exports.call = (name, input, id = 'call-1') => ({ type: 'function_call', status: 'completed',
  call_id: id, name, arguments: JSON.stringify(input) })
exports.response = (output, usage = {}) => Response.json({ id: 'resp-test', status: 'completed', output, usage })
