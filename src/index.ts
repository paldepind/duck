import * as ts from 'typescript'
import {TypeChecker} from 'typescript'

// This will extract the information necessary to generate documentation.

type Sort = 'function' | 'class'

export interface DocEntry {
  sort?: Sort
  name?: string
  fileName?: string
  documentation?: string
  type?: string
  constructors?: DocEntry[]
  parameters?: DocEntry[]
  returnType?: string
}

export type SymbolDoc = {
  name: string
  type: string
  documentation: string
  tags: Record<string, string>
}

export type ClassDoc = SymbolDoc & {
  sort: 'class'
  properties: any
}

export type FunctionDoc = SymbolDoc & {
  sort: 'function'
  signatures: any[]
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
    documentation: ts.displayPartsToString(
      signature.getDocumentationComment(checker)
    ),
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
    ),
    tags: symbol
      .getJsDocTags()
      .reduce((o, t) => (t.text ? ((o[t.name] = t.text), o) : o), {} as Record<
        string,
        string
      >)
  }
}

function serializeFunction(
  checker: TypeChecker,
  node: ts.FunctionDeclaration
): FunctionDoc {
  let symbol = checker.getSymbolAtLocation(node.name!)!
  let details = serializeSymbol(checker, symbol)

  // Get the construct signatures
  let type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
  const signatures = type
    .getCallSignatures()
    .map(s => serializeSignature(checker, s))

  return {sort: 'function', signatures, ...details}
}

function serializeClass(
  checker: TypeChecker,
  node: ts.ClassDeclaration
): ClassDoc {
  const symbol = checker.getSymbolAtLocation(node.name!)

  let details = serializeSymbol(checker, symbol)

  // Get the construct signatures
  let constructorType = checker.getTypeOfSymbolAtLocation(
    symbol,
    symbol.valueDeclaration!
  )
  const constructors = constructorType
    .getConstructSignatures()
    .map(serializeSignature.bind(undefined, checker))

  // We get the type of an instance of the class by getting the return
  // type of the first constructor signature
  const instanceType = constructorType
    .getConstructSignatures()[0]
    .getReturnType()
  const properties = instanceType
    .getProperties()
    .map(s => serializeSymbol(checker, s))

  return {sort: 'class', properties, constructors, ...details}
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
