import * as fs from 'fs-extra';
import { join } from 'path';
import ts = require('typescript');
import { utils, Transformer, TransformerStage, TypeScriptCompiler } from '../lib';
import { withProjectSync, TsConfigJson } from './with-project';

// Use the defaults...
const tsconfig: TsConfigJson = { compilerOptions: {} };

test('TypeScriptCompiler applies configured transformers', () =>
  withProjectSync(tsconfig, projectRoot => {
    fs.writeFileSync(join(projectRoot, 'index.ts'), INDEX_TS, { encoding: 'utf-8' });

    const compiler = new TypeScriptCompiler(join(projectRoot, 'tsconfig.json'));
    compiler.appendTransformer(new MakePropertyNamesMagicTransformer());
    compiler.prependTransformer(new UpcasePropertyNamesTransformer());

    const emitResult = compiler.compileOnce();
    expect(emitResult.emitSkipped).toBeFalsy();
    expect(emitResult.diagnostics).toEqual([]);

    expect(fs.readFileSync(join(projectRoot, 'index.js'), { encoding: 'utf-8' }))
      .toContain('magicPROPERTY');
    expect(fs.readFileSync(join(projectRoot, 'index.d.ts'), { encoding: 'utf-8' }))
      .toContain('magicPROPERTY');
  })
);

class UpcasePropertyNamesTransformer extends Transformer<ts.Bundle | ts.SourceFile> {
  public readonly stages: readonly TransformerStage[] = [TransformerStage.BEFORE, TransformerStage.AFTER_DECLARATIONS];

  protected visitNode<T extends ts.Node>(node: T): ts.VisitResult<T> {
    if (ts.isPropertyDeclaration(node)) {
      return ts.updateProperty(node,
        node.decorators,
        node.modifiers,
        ts.createIdentifier(utils.getText(node.name).toUpperCase()),
        node.questionToken || node.exclamationToken,
        node.type,
        node.initializer) as unknown as T;
    }
    return node;
  }
}

class MakePropertyNamesMagicTransformer extends Transformer<ts.Bundle | ts.SourceFile> {
  public readonly stages: readonly TransformerStage[] = [TransformerStage.BEFORE, TransformerStage.AFTER_DECLARATIONS];

  protected visitNode<T extends ts.Node>(node: T): ts.VisitResult<T> {
    if (ts.isPropertyDeclaration(node)) {
      return ts.updateProperty(node,
        node.decorators,
        node.modifiers,
        ts.createIdentifier(`magic${utils.getText(node.name)}`),
        node.questionToken || node.exclamationToken,
        node.type,
        node.initializer) as unknown as T;
    }
    return node;
  }
}

const INDEX_TS = `
export class TestClass {
  public readonly property = 1_337;
}
`;
