import * as fs from 'fs-extra';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import * as ts from 'typescript';

export interface TsConfigJson {
  readonly compilerOptions: ts.CompilerOptions;
}

export function withProjectSync<T>(tsconfig: TsConfigJson, cb: (projectRoot: string) => T): T {
  const dir = fs.mkdtempSync(join(tmpdir(), basename(__filename)));
  try {
    fs.writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(forWriting(tsconfig), null, 2), { encoding: 'utf-8' });

    return cb(dir);
  } finally {
    fs.removeSync(dir);
  }
}

export async function withProject<T>(tsconfig: TsConfigJson, cb: (projectRoot: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(join(tmpdir(), basename(__filename)));
  try {
    fs.writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(forWriting(tsconfig), null, 2), { encoding: 'utf-8' });

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
