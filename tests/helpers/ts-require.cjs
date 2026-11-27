'use strict'

// Hook require partagé : permet aux tests Node et aux scripts CJS de charger
// les modules TypeScript de lib/ (transpilation à la volée + alias "@/").
// Usage :
//   const { installTsRequireWithAliases } = require('./helpers/ts-require.cjs')
//   const restore = installTsRequireWithAliases()
//   ... require('<racine>/lib/xxx.ts') ...
//   restore() // dans test.after()

const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function installTsRequireWithAliases() {
  const previousTs = Module._extensions['.ts']
  const previousResolve = Module._resolveFilename

  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    let mapped = request
    if (request.startsWith('@/')) mapped = path.join(process.cwd(), request.slice(2))
    else if (request.startsWith('.') && parent?.filename) mapped = path.resolve(path.dirname(parent.filename), request)
    // Match the application's source resolution when foo.ts and foo.json coexist.
    // Explicit JSON imports and compiled engine JS keep their normal resolution.
    if (path.isAbsolute(mapped) && !path.extname(mapped) && fs.existsSync(`${mapped}.ts`)) mapped += '.ts'
    return previousResolve.call(this, mapped, parent, isMain, options)
  }

  Module._extensions['.ts'] = function loadTs(mod, filename) {
    const source = fs.readFileSync(filename, 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
    mod._compile(output, filename)
  }

  return () => {
    Module._resolveFilename = previousResolve
    if (previousTs) Module._extensions['.ts'] = previousTs
    else delete Module._extensions['.ts']
  }
}

module.exports = { installTsRequireWithAliases }
