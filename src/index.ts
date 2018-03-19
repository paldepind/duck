import * as ts from "typescript";
import * as fs from "fs";

// This is a hacked together script that will extract the information
// necessary to generate documentation.

interface DocEntry {
  thing?: "function" | "class";
  name?: string;
  fileName?: string;
  documentation?: string;
  type?: string;
  constructors?: DocEntry[];
  parameters?: DocEntry[];
  returnType?: string;
}

/** Generate documentation for all classes in a set of .ts files */
function generateDocumentation(
  fileNames: string[],
  options: ts.CompilerOptions
): void {
  // Build a program using the set of root file names in fileNames
  let program = ts.createProgram(fileNames, options);

  // Get the checker, we will use it to find more about classes
  let checker = program.getTypeChecker();

  let output: DocEntry[] = [];

  // Visit every sourceFile in the program
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      // Walk the tree to search for classes
      ts.forEachChild(sourceFile, visit.bind(undefined, sourceFile));
    }
  }

  // print out the doc
  fs.writeFileSync("type-info.json", JSON.stringify(output, undefined, 2));

  return;

  /** visit nodes finding exported classes */
  function visit(sourceFile: ts.SourceFile, node: ts.Node) {
    // Only consider exported nodes
    if (!isNodeExported(node)) {
      return;
    }
    let lineAndCharacter = sourceFile.getLineAndCharacterOfPosition(
      node.getStart()
    );
    const result = serializeNode(checker, node);
    if (result !== undefined) {
      output.push(Object.assign(lineAndCharacter, result));
    } else if (ts.isModuleDeclaration(node)) {
      // This is a namespace, visit its children
      ts.forEachChild(node, visit.bind(undefined, sourceFile));
    }
  }
}

/** True if this is visible outside this file, false otherwise */
function isNodeExported(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;
}

generateDocumentation(process.argv.slice(2), {
  target: ts.ScriptTarget.ES5,
  module: ts.ModuleKind.CommonJS
});

/** Serialize a signature (call or construct) */
function serializeSignature(checker: ts.TypeChecker, signature: ts.Signature) {
  console.log(signature);
  return {
    parameters: signature.parameters.map(
      serializeSymbol.bind(undefined, checker)
    ),
    returnType: checker.typeToString(signature.getReturnType()),
    documentation: ts.displayPartsToString(signature.getDocumentationComment()),
    tags: signature.getJsDocTags()
  };
}

/** Serialize a symbol into a json object */
function serializeSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): DocEntry {
  return {
    name: symbol.getName(),
    documentation: ts.displayPartsToString(symbol.getDocumentationComment()),
    type: checker.typeToString(
      checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
    )
  };
}

function serializeFunction(checker: ts.TypeChecker, node: ts.Node) {
  let symbol = checker.getSymbolAtLocation(node.name);
  let details = serializeSymbol(checker, symbol);

  // Get the construct signatures
  let constructorType = checker.getTypeOfSymbolAtLocation(
    symbol,
    symbol.valueDeclaration!
  );
  details.signatures = constructorType
    .getCallSignatures()
    .map(serializeSignature.bind(undefined, checker));

  return Object.assign({ thing: "function" }, details);
}

function serializeClass(checker: ts.TypeChecker, node: ts.Node) {
  let symbol = checker.getSymbolAtLocation(node.name);

  let details = serializeSymbol(checker, symbol);

  // Get the construct signatures
  let constructorType = checker.getTypeOfSymbolAtLocation(
    symbol,
    symbol.valueDeclaration!
  );
  details.constructors = constructorType
    .getConstructSignatures()
    .map(serializeSignature.bind(undefined, checker));
  details.thing = "class";
  return details;
}

function serializeNode(checker: ts.TypeChecker, node: ts.Node) {
  if (!node.name) {
    return undefined;
  }
  if (ts.isFunctionDeclaration(node)) {
    return serializeFunction(checker, node);
  } else if (ts.isClassDeclaration(node)) {
    return serializeClass(checker, node);
  } else {
    return undefined;
  }
}
