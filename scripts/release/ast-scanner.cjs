'use strict';

const ts = require('typescript');

function extractSpecifiersFromAst(filePath, sourceText) {
  if (sourceText.includes('pi-code-graph')) {
    throw new Error(`Forbidden reference to "pi-code-graph" in ${filePath}`);
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );

  if (sourceFile.parseDiagnostics && sourceFile.parseDiagnostics.length > 0) {
    const msg = sourceFile.parseDiagnostics[0].messageText;
    throw new Error(`Parse diagnostic failure in ${filePath}: ${typeof msg === 'string' ? msg : msg.messageText}`);
  }

  const specifiers = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        if (node.arguments.length < 1) {
          throw new Error(`require() call without arguments in ${filePath}`);
        }
        const arg = node.arguments[0];
        if (!ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) {
          throw new Error(`Non-literal require() detected in ${filePath}`);
        }
        specifiers.push(arg.text);
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length < 1) {
          throw new Error(`import() call without arguments in ${filePath}`);
        }
        const arg = node.arguments[0];
        if (!ts.isStringLiteral(arg) && !ts.isNoSubstitutionTemplateLiteral(arg)) {
          throw new Error(`Non-literal dynamic import() detected in ${filePath}`);
        }
        specifiers.push(arg.text);
      }
    }

    if (ts.isPropertyAccessExpression(node) && node.name.text === 'dlopen') {
      throw new Error(`Native addon loader dlopen detected in ${filePath}`);
    }

    if (ts.isImportDeclaration(node)) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        throw new Error(`Non-literal static import in ${filePath}`);
      }
      specifiers.push(node.moduleSpecifier.text);
    }

    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (!ts.isStringLiteral(node.moduleSpecifier)) {
        throw new Error(`Non-literal static export in ${filePath}`);
      }
      specifiers.push(node.moduleSpecifier.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specifiers;
}

module.exports = {
  extractSpecifiersFromAst
};
