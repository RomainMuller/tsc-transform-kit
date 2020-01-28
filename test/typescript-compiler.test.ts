import * as fs from 'fs-extra';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import * as ts from 'typescript';
import { TypeScriptCompiler } from '../lib';

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
    withProjectSync(projectRoot => {
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
    withProject(async projectRoot => {
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

function withProjectSync<T>(cb: (projectRoot: string) => T): T {
  const dir = fs.mkdtempSync(join(tmpdir(), basename(__filename)));
  try {
    fs.writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(forWriting(tsconfig), null, 2), { encoding: 'utf-8' });
    fs.writeFileSync(join(dir, 'index.ts'), 'export class TestClass {}', { encoding: 'utf-8' });

    return cb(dir);
  } finally {
    fs.removeSync(dir);
  }
}

async function withProject<T>(cb: (projectRoot: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(join(tmpdir(), basename(__filename)));
  try {
    fs.writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(forWriting(tsconfig), null, 2), { encoding: 'utf-8' });
    fs.writeFileSync(join(dir, 'index.ts'), 'export class TestClass {}', { encoding: 'utf-8' });

    return await cb(dir);
  } finally {
    fs.removeSync(dir);
  }
}

function forWriting(config: TsConfigJson): any {
  const compilerOptions = { ...config.compilerOptions };

  valueToName(compilerOptions, 'module', ts.ModuleKind);
  valueToName(compilerOptions, 'moduleResolution', { ...ts.ModuleResolutionKind, [ts.ModuleResolutionKind.NodeJs]: 'node' });
  valueToName(compilerOptions, 'target', ts.ScriptTarget);

  return { ...config, compilerOptions };

  function valueToName(obj: any, key: string, dict: { [key: number]: string }) {
    if (!(key in obj)) { return; }
    obj[key] = dict[obj[key]];
  }
}

interface TsConfigJson {
  readonly compilerOptions: ts.CompilerOptions;
}
