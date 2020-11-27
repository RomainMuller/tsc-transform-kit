#!/usr/bin/env node

const { writeFileSync } = require('fs');
const { resolve } = require('path');
const ts = require('typescript');
const { version } = require('../package.json');

const FILE_NAME = 'version.generated.ts';

const statements = [
  ts.addSyntheticLeadingComment(
    ts.factory.createVariableStatement(
      [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
      [
        ts.factory.createVariableDeclaration(
          'version',
          undefined,
          undefined,
          ts.factory.createStringLiteral(version, true),
        ),
      ],
      ts.NodeFlags.Const,
    ),
    ts.SyntaxKind.MultiLineCommentTrivia,
    '*\n * The currently installed version of `tsc-transform-kit`.\n ',
    true,
  ),
];

const sourceFile = ts.factory.updateSourceFile(
  ts.createSourceFile(
    FILE_NAME,
    '',
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  ),
  statements,
  false,
  [],
  [],
  false,
  [],
);

writeFileSync(
  resolve(__dirname, '..', 'lib', FILE_NAME),
  ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(sourceFile),
  { encoding: 'utf-8' },
);
