import { extname, join } from 'path';
import * as ts from 'typescript';

/**
 * A compilation watch.
 */
export interface IWatch {
  /**
   * Interrupts the watch and stops any watch worker.
   */
  stop(): void;
}

/**
 * @internal
 */
export class Watch implements IWatch {
  /* eslint-disable @typescript-eslint/explicit-member-accessibility */
  readonly #host: ts.WatchHost;
  readonly #performBuild: (fileName: string) => void;
  readonly #watchers = new Map<string, ts.FileWatcher>();
  #stopped = false;
  /* eslint-enable @typescript-eslint/explicit-member-accessibility */

  public constructor(
    private readonly system: ts.System,
    callback: (watch: Watch) => void,
    private readonly pollingInterval?: number,
  ) {
    if (system.watchDirectory == null || system.watchFile == null) {
      throw new Error('Unable to create Watch: system does not support watchDirectory and/or watchFile');
    }

    this.#host = {
      clearTimeout: system.clearTimeout,
      onWatchStatusChange: () => undefined,
      setTimeout: system.setTimeout,
      watchDirectory: system.watchDirectory,
      watchFile: system.watchFile,
    };
    this.#performBuild = () => {
      if (this.#stopped) { return; }
      callback(this);
    };
  }

  public watchConfigFile(path: string) {
    const config = parseConfiguration(path, this.system);
    if (!this.#watchers.has(path)) {
      this.#watchers.set(
        path,
        this.#host.watchFile(
          path,
          this.#performBuild,
          this.pollingInterval,
        ),
      );
    }
    if (config) {
      this.#watchWildCardDirectories(config, config.watchOptions);
      this.#watchInputFiles(config, config.watchOptions);
    }
  }

  public stop(): void {
    this.#stopped = true;
    for (const path of [...this.#watchers.keys()]) {
      this.#watchers.get(path)!.close();
      this.#watchers.delete(path);
    }
  }

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  #watchWildCardDirectories = (config: ts.ParsedCommandLine, watchOptions?: ts.WatchOptions) => {
    for (const [path, flags] of Object.entries(config.wildcardDirectories ?? {})) {
      if (this.#watchers.has(path)) { continue; }
      this.#watchers.set(
        path,
        this.#host.watchDirectory(
          path,
          fileName => {
            // If fileName is path, it's not a file, so below checks are pointless.
            if (fileName !== path) {
              // We don't care about stuff that's not a source file
              if (!isSupportedSourceFile(fileName, config)) { return; }
              // We don't care about stuff that's an output file
              if (isOutputFile(fileName, config)) { return; }
            }

            this.#performBuild(fileName);
          },
          (flags & ts.WatchDirectoryFlags.Recursive) !== 0,
          watchOptions,
        ),
      );
    }
  };

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  #watchInputFiles = (config: ts.ParsedCommandLine, watchOptions?: ts.WatchOptions) => {
    for (const path of config.fileNames) {
      if (this.#watchers.has(path)) { continue; }
      this.#watchers.set(
        path,
        this.#host.watchFile(
          path,
          this.#performBuild,
          this.pollingInterval,
          watchOptions,
        ),
      );
    }
  };
}

const TS_SOURCE_EXTENSIONS = ['.ts', '.tsx'];

/**
 * Checks whether a file is a supported source file.
 *
 * @param path   the path to the checked file.
 * @param config the compiler configuration.
 *
 * @returns `true` if the file is a supported input file.
 */
function isSupportedSourceFile(path: string, config: ts.ParsedCommandLine): boolean {
  const supportedExts = new Set(TS_SOURCE_EXTENSIONS);
  if (config.options.allowJs) {
    supportedExts.add('.js');
    supportedExts.add('.jsx');
  }
  if (config.options.resolveJsonModule) {
    supportedExts.add('.json');
  }
  return supportedExts.has(extname(path));
}

/**
 * Checks whether a given file is an output of the compiler.
 *
 * @param path   the path the the checked file.
 * @param config the compilation configuration.
 *
 * @returns `true` if the file is an output file.
 */
function isOutputFile(path: string, config: ts.ParsedCommandLine): boolean {
  // If we don't emit, it cannot be an output file!
  if (config.options.noEmit) { return false; }

  // .ts (that are not .d.ts) and .tsx files are never output files
  if (!path.endsWith('.d.ts') && (path.endsWith('.ts') || path.endsWith('.tsx'))) {
    return false;
  }

  // If there's an outFile, and this is it, then obviously...
  const outFile = config.options.outFile ?? config.options.out;
  if (outFile && (outFile === path || outFile.replace(/\.[^.]*$/i, '.d.ts') === path)) {
    return true;
  }

  // If there's a declarationDir, and the file is in there, then obviously...
  if (config.options.declarationDir && path.startsWith(join(config.options.declarationDir, ''))) {
    return true;
  }

  // If there's an outDir, and the file is in there, then obviously...
  if (config.options.outDir && path.startsWith(join(config.options.outDir, ''))) {
    return true;
  }

  // Otherwise we just assume it's not an output file...
  return false;
}

/**
 * Parses the command line from the configuration at the given path.
 *
 * @param path the path to the configuration file.
 * @param host the solution builder host.
 *
 * @returns the parsed command line.
 */
function parseConfiguration(path: string, system: ts.System): ts.ParsedCommandLine | undefined {
  return ts.getParsedCommandLineOfConfigFile(path, {}, {
    fileExists: system.fileExists,
    getCurrentDirectory: system.getCurrentDirectory,
    onUnRecoverableConfigFileDiagnostic: () => undefined,
    readDirectory: system.readDirectory,
    readFile: system.readFile,
    useCaseSensitiveFileNames: system.useCaseSensitiveFileNames,
    trace: undefined,
  });
}
