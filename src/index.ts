import * as ts from 'typescript'
import {TypeChecker} from 'typescript'

// This will extract the information necessary to generate documentation.

export type Sort = 'function' | 'class' | 'variable'

export type DocEntry = ClassDoc | FunctionDoc | VariableDoc

export type SymbolDoc = {
  name: string
  type: string
  documentation: string
  tags: Record<string, string>
  tagsArray: ts.JSDocTagInfo[]
} & ts.LineAndCharacter

export type ClassDoc = SymbolDoc & {
  sort: 'class'
  properties: any[]
  constructors: any[]
}

export type FunctionDoc = SymbolDoc & {
  sort: 'function'
  signatures: any[]
}

export type VariableDoc = SymbolDoc & {
  sort: 'variable'
}

function isPrivate(s: {tags: any}): boolean {
  return 'private' in s.tags
}

function privateSymbolToUndefined<A extends SymbolDoc>(s: A): A | undefined {
  return isPrivate(s) ? undefined : s
}

const defaultOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2016,
  module: ts.ModuleKind.CommonJS,
  compilerOptions: {
    strict: true
  }
}

export type Documentation = {
  exports: DocEntry[]
  categories: {name: string; entries: DocEntry[]}[]
}

/** Generate documentation for all exports in a TS file */
export function generateJSON(
  fileName: string,
  options: ts.CompilerOptions = defaultOptions
): Documentation {
  // Build a program using the set of root file names in fileNames
  const program = ts.createProgram([fileName], options)
  const checker = program.getTypeChecker()

  let output: DocEntry[] = []

  // Visit every sourceFile in the program
  for (const sourceFile of program.getSourceFiles()) {
    // Skip declaration files
    if (!sourceFile.isDeclarationFile) {
      const exports = checker.getExportsOfModule(
        checker.getSymbolAtLocation(sourceFile)!
      )
      const out: any = exports
        .map(symbol => serializeNode(checker, sourceFile, symbol))
        .filter(d => d !== undefined)
        .sort((a, b) => a!.line - b!.line)
      output = output.concat(out)
    }
  }
  const categoriesMap = new Map()
  for (const entry of output) {
    const category = entry.tags.category
    if (category !== undefined) {
      if (!categoriesMap.has(category)) {
        categoriesMap.set(category, [])
      }
      categoriesMap.get(category).push(entry)
    }
  }
  const categories = Array.from(categoriesMap).map(([name, entries]) => ({
    name,
    entries
  }))
  return {
    exports: output.filter(entry => entry.tags.category === undefined),
    categories
  }
}

/** Serialize a signature (call or construct) */
function serializeSignature(checker: TypeChecker, signature: ts.Signature) {
  return {
    type: checker.signatureToString(signature),
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
      checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!),
      undefined,
      ts.TypeFormatFlags.NoTruncation
    ),
    tags: symbol
      .getJsDocTags()
      .reduce(
        (o, t) => ((o[t.name] = t.text === undefined ? '' : t.text), o),
        {} as Record<string, string>
      ),
    tagsArray: symbol.getJsDocTags()
  }
}

function serializeFunction(
  checker: TypeChecker,
  lineInfo: ts.LineAndCharacter,
  symbol: ts.Symbol
): FunctionDoc {
  let details = serializeSymbol(checker, symbol)

  // Get the construct signatures
  let type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
  const signatures = type
    .getCallSignatures()
    .map(s => serializeSignature(checker, s))

  return {sort: 'function', signatures, ...details, ...lineInfo}
}

function serializeVariable(
  checker: TypeChecker,
  lineInfo: ts.LineAndCharacter,
  symbol: ts.Symbol
): VariableDoc {
  let details = serializeSymbol(checker, symbol)

  // Get the construct signatures
  // let type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)

  return {sort: 'variable', ...details, ...lineInfo}
}

function serializeClass(
  checker: TypeChecker,
  lineInfo: ts.LineAndCharacter,
  symbol: ts.Symbol
): ClassDoc {
  const details = serializeSymbol(checker, symbol)

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
    .filter(s => !isPrivate(s))

  return {sort: 'class', properties, constructors, ...details, ...lineInfo}
}

function serializeNode(
  checker: TypeChecker,
  file: ts.SourceFile,
  symbol: ts.Symbol
): DocEntry | undefined {
  const node =
    symbol.valueDeclaration !== undefined
      ? symbol.valueDeclaration
      : symbol.declarations![0]
  const lineInfo = file.getLineAndCharacterOfPosition(node.getStart())
  if (!symbol.name) {
    return undefined
  }
  if (ts.isFunctionDeclaration(node)) {
    return serializeFunction(checker, lineInfo, symbol)
  } else if (ts.isClassDeclaration(node)) {
    return privateSymbolToUndefined(serializeClass(checker, lineInfo, symbol))
  } else if (ts.isVariableDeclaration(node)) {
    return serializeVariable(checker, lineInfo, symbol)
  } else {
    return undefined
  }
}
