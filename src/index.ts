import * as ts from 'typescript'
import {TypeChecker} from 'typescript'

// This will extract the information necessary to generate documentation.

export interface DocEntry {
  sort?: 'function' | 'class'
  name?: string
  fileName?: string
  documentation?: string
  type?: string
  constructors?: DocEntry[]
  parameters?: DocEntry[]
  returnType?: string
}

const defaultOptions = {
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS
}

function foldlChildren<A>(
  f: (acc: A, n: ts.Node) => A,
  init: A,
  node: ts.Node
): A {
  let acc = init
  ts.forEachChild(node, n => {
    acc = f(acc, n)
  })
  return acc
}

/** Generate documentation for all exports in a TS file */
export function generateJSON(
  fileName: string,
  options: ts.CompilerOptions = defaultOptions
): DocEntry[] {
  // Build a program using the set of root file names in fileNames
  const program = ts.createProgram([fileName], options)
  const checker = program.getTypeChecker()

  let output: DocEntry[] = []

  // Visit every sourceFile in the program
  for (const sourceFile of program.getSourceFiles()) {
    // Skip declaration files
    if (!sourceFile.isDeclarationFile) {
      // Walk the tree to
      const out = foldlChildren(
        (out, node) => out.concat(visit(checker, sourceFile, node)),
        [] as DocEntry[],
        sourceFile
      )
      output = output.concat(out)
    }
  }
  return output
}

function visit(
  checker: TypeChecker,
  sourceFile: ts.SourceFile,
  node: ts.Node
): DocEntry[] {
  // Only consider exported nodes
  if (!isNodeExported(node)) {
    return []
  }
  const result = serializeNode(checker, node)
  if (result !== undefined) {
    const lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(
      node.getStart()
    )
    return [Object.assign(lineAndCharacter, result)]
  } else if (ts.isModuleDeclaration(node)) {
    // This is a namespace, visit its children
    return foldlChildren(
      (out, node) => out.concat(visit(checker, sourceFile, node)),
      [] as DocEntry[],
      node
    )
  } else {
    return []
  }
}

/** True if this is visible outside this file, false otherwise */
function isNodeExported(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0
}

/** Serialize a signature (call or construct) */
function serializeSignature(checker: TypeChecker, signature: ts.Signature) {
  return {
    parameters: signature.parameters.map(
      serializeSymbol.bind(undefined, checker)
    ),
    returnType: checker.typeToString(signature.getReturnType()),
    documentation: ts.displayPartsToString(signature.getDocumentationComment()),
    tags: signature.getJsDocTags()
  }
}

/** Serialize a symbol into a json object */
function serializeSymbol(checker: TypeChecker, symbol: ts.Symbol) {
  return {
    name: symbol.getName(),
    documentation: ts.displayPartsToString(
      symbol.getDocumentationComment(checker)
    ),
    type: checker.typeToString(
      checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
    )
  }
}

function serializeFunction(checker: TypeChecker, node: ts.FunctionDeclaration) {
  let symbol = checker.getSymbolAtLocation(node.name!)!
  let details = serializeSymbol(checker, symbol)
  if (details.name === 'insert') {
    console.log(node)
    console.log(checker.getSymbolAtLocation(node))
  }

  // Get the construct signatures
  let type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
  const signatures = type
    .getCallSignatures()
    .map(s => serializeSignature(checker, s))

  return Object.assign({sort: 'function', signatures}, details)
}

function serializeClass(checker: TypeChecker, node: ts.ClassDeclaration) {
  let symbol = checker.getSymbolAtLocation(node.name)

  let details = serializeSymbol(checker, symbol)

  // Get the construct signatures
  let constructorType = checker.getTypeOfSymbolAtLocation(
    symbol,
    symbol.valueDeclaration!
  )
  details.constructors = constructorType
    .getConstructSignatures()
    .map(serializeSignature.bind(undefined, checker))
  details.sort = 'class'
  return details
}

function serializeNode(checker: TypeChecker, node: ts.Node) {
  if (!node.name) {
    return undefined
  }
  if (ts.isFunctionDeclaration(node)) {
    return serializeFunction(checker, node)
  } else if (ts.isClassDeclaration(node)) {
    return serializeClass(checker, node)
  } else {
    return undefined
  }
}
