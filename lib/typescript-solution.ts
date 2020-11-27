import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { resolve } from 'path';
import ts from 'typescript';
import { Transformers } from './transformers';
import { IWatch, Watch } from './watch';

export class TypeScriptSolution<T extends ts.BuilderProgram> {
  private readonly system: ts.System;
  private readonly createProgram?: ts.CreateProgram<T>;

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  readonly #reportDiagnostic: ts.DiagnosticReporter = (diag) =>
    this.emit(BuildEvent.Diagnostic, diag);

  private readonly eventEmitter = new EventEmitter();

  /**
   * Creates a new TypeScript project.
   *
   * @param tsconfigPath the path to the tsconfig.json for the project.
   * @param transformers custom transformers to apply.
   * @param options      options for the underlying TypeScript compiler.
   */
  public constructor(
    public readonly tsconfigPath: string,
    public readonly transformers: Transformers = new Transformers(),
    options?: TypeScriptProjectOptions<T>,
  ) {
    if (!existsSync(tsconfigPath)) {
      throw new Error(`${tsconfigPath} does not exist!`);
    }
    this.system = options?.system ?? ts.sys;
    this.createProgram = options?.createProgram;
  }

  /**
   * Builds this TypeScript project once, then returns.
   *
   * @param rootNames         the root names to be compiled.
   * @param defaultOptions    custom build options.
   * @param cancellationToken a cancellation token.
   */
  public build(
    rootNames: string[] = [this.tsconfigPath],
    defaultOptions: ts.BuildOptions = { incremental: true },
    cancellationToken?: ts.CancellationToken,
  ): void {
    const host = ts.createSolutionBuilderHost(
      this.system,
      this.createProgram,
      this.#reportDiagnostic,
      undefined, // reportSolutionBuilderStatus,
      undefined, // reportErrorSummary,
    );
    const builder = ts.createSolutionBuilder(host, rootNames, defaultOptions);
    this.consumeBuilder(builder, cancellationToken);
  }

  /**
   * Compiles this project once, then watches for input file changes and
   * re-compiles when needed.
   *
   * @param rootNames         the root names to be compiled.
   * @param defaultOptions    custom build options.
   * @param cancellationToken a cancellation token.
   *
   * @returns an `IWatch` that can be used to stop the process.
   */
  public watch(
    rootNames: string[] = [this.tsconfigPath],
    defaultOptions: ts.BuildOptions = { incremental: true },
    cancellationToken?: ts.CancellationToken,
  ): IWatch {
    const host = ts.createSolutionBuilderHost(
      this.system,
      this.createProgram,
      this.#reportDiagnostic,
      undefined, // reportSolutionBuilderStatus,
    );
    const createBuilder = () =>
      ts.createSolutionBuilder(host, rootNames, defaultOptions);
    // Work off a new builder, as the tsc API doesn't expose any way to invalidate/revalidate projects
    const watch = new Watch(this.system, (watch) =>
      this.consumeBuilder(createBuilder(), cancellationToken, watch),
    );
    watch.watchConfigFile(this.tsconfigPath);

    this.consumeBuilder(createBuilder(), cancellationToken, watch);

    return watch;
  }

  /**
   * Formats a given set of TypeScript Diagnostic entries to a pretty-printed
   * string with colors and context.
   *
   * @param diagnostics the list of daignostics to be rendered.
   *
   * @returns the string resulting from the rendering.
   */
  public formatDiagnostics(...diagnostics: readonly ts.Diagnostic[]): string {
    return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: resolve,
      getCurrentDirectory: this.system.getCurrentDirectory,
      getNewLine: () => this.system.newLine,
    });
  }

  public on(
    event: BuildEvent.BeforeSolution,
    listener: (solution: TypeScriptSolution<T>) => void,
  ): this;
  public on(
    event: BuildEvent.AfterSolution,
    listener: (solution: TypeScriptSolution<T>, errorCount: number) => void,
  ): this;
  public on(
    event: BuildEvent.BeforeProject,
    listener: (project: ts.InvalidatedProject<T>) => void,
  ): this;
  public on(
    event: BuildEvent.AfterProject,
    listener: (project: ts.InvalidatedProject<T>) => void,
  ): this;
  public on(
    event: BuildEvent.Diagnostic,
    listener: (diagnostic: ts.Diagnostic) => void,
  ): this;
  public on(
    event: BuildEvent.OutputsGenerated,
    listener: (project: ts.InvalidatedProject<T>) => void,
  ): this;
  public on(
    event: BuildEvent.OutputsSkipped,
    listener: (
      project: ts.InvalidatedProject<T>,
      reason: OutputsSkippedReason,
    ) => void,
  ): this;
  public on(event: BuildEvent, listener: (...any: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  public once(
    event: BuildEvent.BeforeSolution,
    listener: (solution: TypeScriptSolution<T>) => void,
  ): this;
  public once(
    event: BuildEvent.AfterSolution,
    listener: (solution: TypeScriptSolution<T>, errorCount: number) => void,
  ): this;
  public once(
    event: BuildEvent.BeforeProject,
    listener: (project: ts.InvalidatedProject<T>) => void,
  ): this;
  public once(
    event: BuildEvent.AfterProject,
    listener: (project: ts.InvalidatedProject<T>) => void,
  ): this;
  public once(
    event: BuildEvent.Diagnostic,
    listener: (diagnostic: ts.Diagnostic) => void,
  ): this;
  public once(
    event: BuildEvent.OutputsGenerated,
    listener: (project: ts.InvalidatedProject<T>) => void,
  ): this;
  public once(
    event: BuildEvent.OutputsSkipped,
    listener: (
      project: ts.InvalidatedProject<T>,
      reason: OutputsSkippedReason,
    ) => void,
  ): this;
  public once(event: BuildEvent, listener: (...args: any[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  private consumeBuilder(
    builder: ts.SolutionBuilder<T>,
    cancellationToken?: ts.CancellationToken,
    watch?: Watch,
  ): void {
    if (watch != null) {
      this.emit(BuildEvent.BeforeSolution, this);
    }

    const next = () => builder.getNextInvalidatedProject(cancellationToken);

    let errorCount = 0;
    const incrementErrorCounter = (diag: ts.Diagnostic) => {
      if (diag.category === ts.DiagnosticCategory.Error) {
        errorCount++;
      }
    };
    if (watch != null) {
      this.on(BuildEvent.Diagnostic, incrementErrorCounter);
    }

    for (
      let invalidatedProject = next();
      invalidatedProject != null;
      invalidatedProject = next()
    ) {
      this.emit(BuildEvent.BeforeProject, invalidatedProject);
      try {
        const exitStatus = invalidatedProject.done(
          cancellationToken,
          this.system.writeFile,
          this.transformers.forInvalidatedProject(invalidatedProject),
        );
        switch (exitStatus) {
          case ts.ExitStatus.Success:
            this.emit(BuildEvent.OutputsGenerated, invalidatedProject);
            break;
          case ts.ExitStatus.DiagnosticsPresent_OutputsGenerated:
            this.emit(BuildEvent.OutputsGenerated, invalidatedProject);
            break;
          case ts.ExitStatus.DiagnosticsPresent_OutputsSkipped:
            this.emit(
              BuildEvent.OutputsSkipped,
              invalidatedProject,
              OutputsSkippedReason.DiagnosticsPresent,
            );
            break;
          case ts.ExitStatus.InvalidProject_OutputsSkipped:
            this.emit(
              BuildEvent.OutputsSkipped,
              invalidatedProject,
              OutputsSkippedReason.InvalidProject,
            );
            break;
          case ts.ExitStatus.ProjectReferenceCycle_OutputsSkipped:
          case ts.ExitStatus.ProjectReferenceCycle_OutputsSkupped:
            this.emit(
              BuildEvent.OutputsSkipped,
              invalidatedProject,
              OutputsSkippedReason.ProjectReferenceCycle,
            );
            break;
          default:
            throw new Error(
              `Unsupported exitStatus: ${ts.ExitStatus[exitStatus]}`,
            );
        }
      } finally {
        if (watch != null) {
          watch.watchConfigFile(invalidatedProject.project);
        }
        this.emit(BuildEvent.AfterProject, invalidatedProject);
      }
    }
    if (watch) {
      this.emit(BuildEvent.AfterSolution, this, errorCount);
      this.removeListener(BuildEvent.Diagnostic, incrementErrorCounter);
    }
  }

  public removeListener(
    event: BuildEvent,
    listener: (...args: any[]) => void,
  ): this {
    this.eventEmitter.removeListener(event, listener);
    return this;
  }

  public removeAllListeners(): this {
    this.eventEmitter.removeAllListeners();
    return this;
  }

  private emit(
    event: BuildEvent.BeforeSolution,
    solution: TypeScriptSolution<T>,
  ): boolean;
  private emit(
    event: BuildEvent.AfterSolution,
    solution: TypeScriptSolution<T>,
    errorCount: number,
  ): boolean;
  private emit(
    event: BuildEvent.BeforeProject,
    project: ts.InvalidatedProject<T>,
  ): boolean;
  private emit(
    event: BuildEvent.AfterProject,
    project: ts.InvalidatedProject<T>,
  ): boolean;
  private emit(
    event: BuildEvent.Diagnostic,
    diagnostic: ts.Diagnostic,
  ): boolean;
  private emit(
    event: BuildEvent.OutputsGenerated,
    project: ts.InvalidatedProject<T>,
  ): boolean;
  private emit(
    event: BuildEvent.OutputsSkipped,
    project: ts.InvalidatedProject<T>,
    reason: OutputsSkippedReason,
  ): boolean;
  private emit(event: BuildEvent, ...args: any): boolean {
    return this.eventEmitter.emit(event, ...args);
  }
}

/**
 * Custom options to initialize a TypeScript compiler.
 */
export interface TypeScriptProjectOptions<
  T extends ts.BuilderProgram = ts.EmitAndSemanticDiagnosticsBuilderProgram
> {
  /**
   * A TypeScrypt system.
   */
  readonly system?: ts.System;

  /**
   * A TypeScript createProgram function.
   */
  readonly createProgram?: ts.CreateProgram<T>;
}

/**
 * Events that a TypeScript project emits during build.
 */
export const enum BuildEvent {
  /** Happens before the solution starts building. */
  BeforeSolution = 'beforeSolution',
  /** Happens after the solution completed building. */
  AfterSolution = 'afterSolution',

  /** Happens before a project is transformed. */
  BeforeProject = 'beforeProject',
  /** Happens after a project is transformed. */
  AfterProject = 'afterProject',

  /** Happens whenever a diagnostic message is generated. */
  Diagnostic = 'diagnostic',

  /** Happens when a project was transformed and generated outputs. */
  OutputsGenerated = 'outputsGenerated',
  /** Happens when a project was transformed, but outputs were not generated. */
  OutputsSkipped = 'outputsSkipped',
}

/**
 * Reasons for why outputs were not emitted.
 */
export const enum OutputsSkippedReason {
  /** A diagnositic message (usually an error) prevented generation. */
  DiagnosticsPresent = 'diagnosticsPresent',
  /** The project's configuration is invalid. */
  InvalidProject = 'invalidProject',
  /** A reference cycle involves the project. */
  ProjectReferenceCycle = 'projectReferenceCycle',
}
