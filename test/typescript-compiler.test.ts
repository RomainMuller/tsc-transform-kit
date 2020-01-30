import * as fs from 'fs-extra';
import { join } from 'path';
import * as ts from 'typescript';
import { TypeScriptCompiler } from '../lib';
import { TsConfigJson, withProject, withProjectSync } from './with-project';

const tsconfig: TsConfigJson = {
  compilerOptions: {
    alwaysStrict: true,
    charset: 'utf-8',
    composite: true,
    declaration: true,
    incremental: true,
    inlineSourceMap: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    noImplicitAny: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    strict: true,
    target: ts.ScriptTarget.ES2018,
  }
};

describe('compileOnce', () => {
  test('successfully compiles project', () => {
    withProjectSync(tsconfig, projectRoot => {
      fs.writeFileSync(join(projectRoot, 'index.ts'), INDEX_TS, { encoding: 'utf-8' });

      const compiler = new TypeScriptCompiler(join(projectRoot, 'tsconfig.json'));

      const result = compiler.compileOnce();
      expect(result.emitSkipped).toBeFalsy();
      expect(result.diagnostics).toEqual([]);

      expect(fs.readFileSync(join(projectRoot, 'index.js'), { encoding: 'utf-8' }))
        .toMatchSnapshot('compiler JS output');
      expect(fs.readFileSync(join(projectRoot, 'index.d.ts'), { encoding: 'utf-8' }))
        .toMatchSnapshot('compiler DTS output');
    });
  });
});

describe('compileAndWatch', () => {
  test('successfully compiles project', () =>
    withProject(tsconfig, async projectRoot => {
      fs.writeFileSync(join(projectRoot, 'index.ts'), INDEX_TS, { encoding: 'utf-8' });

      const compiler = new TypeScriptCompiler(join(projectRoot, 'tsconfig.json'));

      let ok!: () => void;
      let ko!: (reason: any) => void;
      const checksPassed = new Promise<void>((resolve, reject) => { ok = resolve; ko = reject; });

      let cycle = 0;
      const watch = compiler.compileAndWatch({
        reportWatchStatus: () => /* ignore */ null,
        reportDiagnostic: () => /* ignore */ null,
        onCompilationComplete: result => {
          try {
            expect(result.emitSkipped).toBeFalsy();
            expect(result.diagnostics).toEqual([]);

            const js = fs.readFileSync(join(projectRoot, 'index.js'), { encoding: 'utf-8' });
            const dts = fs.readFileSync(join(projectRoot, 'index.d.ts'), { encoding: 'utf-8' });

            if (cycle === 0) {
              expect(js).toContain('TestClass');
              expect(dts).toContain('TestClass');

              fs.writeFileSync(join(projectRoot, 'index.ts'), 'export enum TestEnum { ONE, TWO }', { encoding: 'utf-8' });

              cycle++;
            } else {
              expect(js).toContain('TestEnum');
              expect(dts).toContain('TestEnum');

              ok();
            }
          } catch (err) {
            ko(err);
          }
        },
      });

      try {
        await checksPassed;
      } finally {
        watch.close();
      }
    })
  );
});

const INDEX_TS = `
export class TestClass {
  public readonly property = 1337;
}
`;
