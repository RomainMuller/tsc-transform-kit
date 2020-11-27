import { program } from 'commander';
import { argv } from 'process';
import * as ts from 'typescript';
import { TypeScriptSolution, BuildEvent, version } from '../lib';

function compile(tsconfig: string, { watch }: { watch: boolean }): void {
  const project = new TypeScriptSolution(tsconfig);
  project.on(BuildEvent.Diagnostic, (diag) =>
    console.log(project.formatDiagnostics(diag)),
  );

  if (watch) {
    const clearScreen = ts.sys.clearScreen ?? (() => null);
    project
      .once(BuildEvent.BeforeSolution, () => {
        clearScreen();
        console.log(
          `[\x1B[90m${new Date().toLocaleTimeString()}\x1B[0m] Starting compilation in watch mode...\n`,
        );

        project.on(BuildEvent.BeforeSolution, () => {
          clearScreen();
          console.log(
            `[\x1B[90m${new Date().toLocaleTimeString()}\x1B[0m] File change detected. Starting incremental compilation...\n`,
          );
        });
      })
      .on(BuildEvent.AfterSolution, (_, errorCount) => {
        console.log(
          `[\x1B[90m${new Date().toLocaleTimeString()}\x1B[0m] Found ${errorCount} errors. Watching for file changes.\n`,
        );
      })
      .watch();
  } else {
    project.build();
  }
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
program
  .version(version, '-v, --version', "Print tsc-tk's version")
  .description('A supercharged TypeScript compiler')
  .helpOption('-h, --help', 'Print this message')
  .arguments('<tsconfig>')
  .option('-w, --watch', 'Watch for file-system changes and re-compile', false)
  .action(compile)
  .parse(argv);
