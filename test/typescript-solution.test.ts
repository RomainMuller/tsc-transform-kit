import { readdirSync, readFile, writeFile } from 'fs';
import { resolve } from 'path';
import * as ts from 'typescript';
import { promisify } from 'util';
import { BuildEvent, TypeScriptSolution, TransformerPhase, Transformer, TransformerContext } from '../lib';
import { withTemporaryCopy } from './utils';

describe('examples', () => {
  const examplesDir = resolve(__dirname, 'examples');
  for (const example of readdirSync(examplesDir)) {
    test(`"${example}" can be built wihout transforms`, () => {
      return withTemporaryCopy(resolve(examplesDir, example), async (copyRoot) => {
        const project = new TypeScriptSolution(resolve(copyRoot, 'tsconfig.json'));

        // Count how many projects get processed
        let projectCount = 0;
        project.on(BuildEvent.BeforeProject, () => projectCount += 1);
        // Count how many projects successfully generated
        let generated = 0;
        project.on(BuildEvent.OutputsGenerated, () => generated += 1);

        // Those projects cannot have errors
        project.on(BuildEvent.Diagnostic, diag => expect(diag).not.toHaveProperty('category', ts.DiagnosticCategory.Error));
        // Those projects cannot have warnings
        project.on(BuildEvent.Diagnostic, diag => expect(diag).not.toHaveProperty('category', ts.DiagnosticCategory.Warning));

        project.build();

        expect(projectCount).toBeGreaterThan(0);
        expect(generated).toBe(projectCount);

        return Promise.resolve();
      });
    });
  }

  test('"basic" can be built with the UpcasingTransformer', async () => {
    return withTemporaryCopy(resolve(examplesDir, 'basic'), async copyRoot => {
      const project = new TypeScriptSolution(resolve(copyRoot, 'tsconfig.json'));
      project.transformers.addTransformer(new UpcasingTransformer());

      // Count how many projects get processed
      let projectCount = 0;
      project.on(BuildEvent.BeforeProject, () => projectCount += 1);
      // Count how many projects successfully generated
      let generated = 0;
      project.on(BuildEvent.OutputsGenerated, () => generated += 1);

      // Those projects cannot have errors
      project.on(BuildEvent.Diagnostic, diag => expect(diag).not.toHaveProperty('category', ts.DiagnosticCategory.Error));
      // Those projects cannot have warnings
      project.on(BuildEvent.Diagnostic, diag => expect(diag).not.toHaveProperty('category', ts.DiagnosticCategory.Warning));

      project.build();

      expect(projectCount).toBeGreaterThan(0);
      expect(generated).toBe(projectCount);

      return expect(promisify(readFile)(resolve(copyRoot, 'dist', 'index.js'), { encoding: 'utf-8' }))
        .resolves.toContain('MAIN');
    });
  });

  test('"basic" can be watched the UpcasingTransformer', async () => {
    // This can be slow on CI/CD configurations
    jest.setTimeout(15_000);

    return withTemporaryCopy(resolve(examplesDir, 'basic'), async root => {
      const project = new TypeScriptSolution(resolve(root, 'tsconfig.json'));
      project.transformers.addTransformer(new UpcasingTransformer());

      // Count how many projects get processed
      let projectCount = 0;
      project.on(BuildEvent.BeforeProject, () => projectCount += 1);
      // Count how many projects successfully generated
      let generated = 0;
      project.on(BuildEvent.OutputsGenerated, () => generated += 1);

      // Those projects cannot have errors
      project.on(BuildEvent.Diagnostic, diag => expect(diag).not.toHaveProperty('category', ts.DiagnosticCategory.Error));
      // Those projects cannot have warnings
      project.on(BuildEvent.Diagnostic, diag => expect(diag).not.toHaveProperty('category', ts.DiagnosticCategory.Warning));

      const watch = project.watch();

      // Initial compilation has already hapened...
      expect(projectCount).toBeGreaterThan(0);
      expect(generated).toBe(projectCount);

      return expect(promisify(readFile)(resolve(root, 'dist', 'index.js'), { encoding: 'utf-8' }))
        .resolves.toContain('MAIN')
        .then(
          () => new Promise((ok, ko) => {
            setTimeout(() => ko(new Error('Test timed out after 14 seconds!')), 10_000);

            // Register hook to inspect incremental build result...
            project.once(BuildEvent.AfterProject, () => {
              expect(promisify(readFile)(resolve(root, 'dist', '_ignore.js'), { encoding: 'utf-8' }))
                .resolves.toContain('_IGNORE')
                .then(ok, ko);
            });

            Promise.all([
              promisify(writeFile)(resolve(root, 'dist', 'ignore.d.ts'), 'export const ignore = undefined;'),
              promisify(writeFile)(resolve(root, '_ignore.ts'), 'export const _ignore = undefined;'),
            ]).then(() => null, ko);
          }),
          err => Promise.reject(err),
        ).finally(() => watch.stop());
    });
  });
});

test('throws if tsconfig.json does not exist', () => {
  expect(() => new TypeScriptSolution('/one/can/expect/this/is/not/actually/a/file'))
    .toThrow(/does not exist!/);
});

class UpcasingTransformer extends Transformer {
  public visit<T extends ts.Node>(node: T, context: TransformerContext) {
    if (context.phase !== TransformerPhase.Before) {
      return node;
    }
    if (ts.isIdentifier(node)) {
      return ts.createIdentifier(node.text.toUpperCase()) as unknown as T;
    }
    return this.transformChildren(node, context);
  }
}
