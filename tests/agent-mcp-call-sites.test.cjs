const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function sources(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name)
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(file) ? [file] : []
  })
}

test('production gameplay MCP calls can only originate from model tool_use blocks', () => {
  let gameCallSites = 0
  for (const file of [...sources('lib'), ...sources('app'), ...sources('components')]) {
    const relative = file.replaceAll('\\', '/')
    const source = fs.readFileSync(file, 'utf8')
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    const mcpNames = new Set()
    function visit(node) {
      if (ts.isImportDeclaration(node) && /mcp-client/.test(node.moduleSpecifier.text)) {
        for (const item of node.importClause?.namedBindings?.elements ?? []) {
          if ((item.propertyName?.text ?? item.name.text) === 'callMCPTool') mcpNames.add(item.name.text)
        }
        if (mcpNames.size) assert.equal(relative, 'app/api/dm/route.ts', `${relative}: gameplay transport must remain inside the model loop`)
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && mcpNames.has(node.expression.text)) {
        const [name, args] = node.arguments
        if (ts.isStringLiteral(name)) assert.ok(['get_game_state', 'replace_game_state'].includes(name.text), `${relative}: server-invented ${name.text}`)
        else {
          gameCallSites++
          assert.equal(name.getText(tree), 'toolUse.name')
          assert.equal(args.getText(tree), 'input')
          let ancestor = node.parent
          while (ancestor && !ts.isForOfStatement(ancestor)) ancestor = ancestor.parent
          assert.ok(ancestor, 'gameplay must execute a model block')
          assert.equal(ancestor.expression.getText(tree), 'toolUseBlocks')
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(tree)
    if (relative !== 'lib/mcp-client.ts') assert.doesNotMatch(source, /\.callTool\s*\(/, `${relative}: bypass of the gameplay transport`)
  }
  assert.equal(gameCallSites, 1, 'one auditable gameplay call path')
})

test('the heuristic fake provider is loaded only inside the mock branch', () => {
  const source = fs.readFileSync('lib/dm/llm.ts', 'utf8')
  const tree = ts.createSourceFile('llm.ts', source, ts.ScriptTarget.Latest, true)
  let imports = 0
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]?.text === './mock-llm') {
      imports++
      let ancestor = node.parent
      while (ancestor && !ts.isIfStatement(ancestor)) ancestor = ancestor.parent
      assert.ok(ancestor)
      assert.equal(ancestor.expression.getText(tree), "LLM_MODE === 'mock'")
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.equal(imports, 1)
  assert.doesNotMatch(source, /createMockLlmMessage\(params, context\)[\s\S]*fallback/i)
})
