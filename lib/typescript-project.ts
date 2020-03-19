import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import * as ts from 'typescript';
import { Transformers } from './transformers';
import { IWatch, Watch } from './watch';

export class TypeScriptProject<T extends ts.BuilderProgram> {
  private readonly system: ts.System;
  private readonly createProgram?: ts.CreateProgram<T>;

  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  readonly #reportDiagnostic: ts.DiagnosticReporter = diag => this.emit(BuildEvent.Diagnostic, diag);
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  readonly #reportSolutionBuilderStatus: ts.DiagnosticReporter = diag => this.emit(BuildEvent.BuildStatus, diag);
  // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
  readonly #reportErrorSummary: ts.ReportEmitErrorSummary = errorCount => this.emit(BuildEvent.ErrorSummary, errorCount);

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
      this.#reportSolutionBuilderStatus,
      this.#reportErrorSummary,
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
      this.#reportSolutionBuilderStatus,
    );
    const createBuilder = () => ts.createSolutionBuilder(host, rootNames, defaultOptions);
    // Work off a new builder, as the tsc API doesn't expose any way to invalidate/revalidate projects
    const watch = new Watch(this.system, watch => this.consumeBuilder(createBuilder(), cancellationToken, watch));

    this.consumeBuilder(createBuilder(), cancellationToken, watch);

    return watch;
  }

  public on(event: BuildEvent.BeforeProject, listener: (project: ts.InvalidatedProject<T>) => void): this;
  public on(event: BuildEvent.AfterProject, listener: (project: ts.InvalidatedProject<T>) => void): this;
  public on(event: BuildEvent.Diagnostic, listener: (diagnostic: ts.Diagnostic) => void): this;
  public on(event: BuildEvent.BuildStatus, listener: (diagnostic: ts.Diagnostic) => void): this;
  public on(event: BuildEvent.ErrorSummary, listener: (errorCount: number) => void): this;
  public on(event: BuildEvent.OutputsGenerated, listener: (project: ts.InvalidatedProject<T>) => void): this;
  public on(event: BuildEvent.OutputsSkipped, listener: (project: ts.InvalidatedProject<T>, reason: OutputsSkippedReason) => void): this;
  // eslint-disable-next-line max-len
  public on(event: BuildEvent.WatchStatus, listener: (diagnostic: ts.Diagnostic, newLine: string, options: ts.CompilerOptions, errorCount: number) => void): this;
  public on(event: BuildEvent, listener: (...any: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }

  public once(event: BuildEvent.BeforeProject, listener: (project: ts.InvalidatedProject<T>) => void): this;
  public once(event: BuildEvent.AfterProject, listener: (project: ts.InvalidatedProject<T>) => void): this;
  public once(event: BuildEvent.Diagnostic, listener: (diagnostic: ts.Diagnostic) => void): this;
  public once(event: BuildEvent.BuildStatus, listener: (diagnostic: ts.Diagnostic) => void): this;
  public once(event: BuildEvent.ErrorSummary, listener: (errorCount: number) => void): this;
  public once(event: BuildEvent.OutputsGenerated, listener: (project: ts.InvalidatedProject<T>) => void): this;
  public once(event: BuildEvent.OutputsSkipped, listener: (project: ts.InvalidatedProject<T>, reason: OutputsSkippedReason) => void): this;
  // eslint-disable-next-line max-len
  public once(event: BuildEvent.WatchStatus, listener: (diagnostic: ts.Diagnostic, newLine: string, options: ts.CompilerOptions, errorCount: number) => void): this;
  public once(event: BuildEvent, listener: (...args: any[]) => void): this {
    this.eventEmitter.once(event, listener);
    return this;
  }

  private consumeBuilder(builder: ts.SolutionBuilder<T>, cancellationToken?: ts.CancellationToken, watch?: Watch): void {
    const next = () => builder.getNextInvalidatedProject(cancellationToken);
    for (let invalidatedProject = next(); invalidatedProject != null; invalidatedProject = next()) {
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
            this.emit(BuildEvent.OutputsSkipped, invalidatedProject, OutputsSkippedReason.DiagnosticsPresent);
            break;
          case ts.ExitStatus.InvalidProject_OutputsSkipped:
            this.emit(BuildEvent.OutputsSkipped, invalidatedProject, OutputsSkippedReason.InvalidProject);
            break;
          case ts.ExitStatus.ProjectReferenceCycle_OutputsSkipped:
          case ts.ExitStatus.ProjectReferenceCycle_OutputsSkupped:
            this.emit(BuildEvent.OutputsSkipped, invalidatedProject, OutputsSkippedReason.ProjectReferenceCycle);
            break;
          default:
            throw new Error(`Unsupported exitStatus: ${ts.ExitStatus[exitStatus]}`);
        }
      } finally {
        if (watch != null) {
          watch.watchConfigFile(invalidatedProject.project);
        }
        this.emit(BuildEvent.AfterProject, invalidatedProject);
      }
    }
  }

  private emit(event: BuildEvent.BeforeProject, project: ts.InvalidatedProject<T>): boolean;
  private emit(event: BuildEvent.AfterProject, project: ts.InvalidatedProject<T>): boolean;
  private emit(event: BuildEvent.Diagnostic, diagnostic: ts.Diagnostic): boolean;
  private emit(event: BuildEvent.BuildStatus, diagnostic: ts.Diagnostic): boolean;
  private emit(event: BuildEvent.ErrorSummary, errorCount: number): boolean;
  private emit(event: BuildEvent.OutputsGenerated, project: ts.InvalidatedProject<T>): boolean;
  private emit(event: BuildEvent.OutputsSkipped, project: ts.InvalidatedProject<T>, reason: OutputsSkippedReason): boolean;
  private emit(event: BuildEvent.WatchStatus, diagnostic: ts.Diagnostic, newLine: string, options: ts.CompilerOptions, errorCount: number): boolean;
  private emit(event: BuildEvent, ...args: any): boolean {
    return this.eventEmitter.emit(event, ...args);
  }
}

/**
 * Custom options to initialize a TypeScript compiler.
 */
export interface TypeScriptProjectOptions<T extends ts.BuilderProgram = ts.EmitAndSemanticDiagnosticsBuilderProgram> {
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
  /** Happens before a project is transformed. */
  BeforeProject = 'before',
  /** Happens after a project is transformed. */
  AfterProject = 'after',

  /** Happens whenever a diagnostic message is generated. */
  Diagnostic = 'diagnostic',
  /** Happens when the status of a build changes. */
  BuildStatus = 'buildStatus',
  /** Happens when an error summary is generated (after a build). */
  ErrorSummary = 'errorSummary',

  /** Emitted when a project was transformed and generated outputs. */
  OutputsGenerated = 'outputsGenerated',
  /** Happens when a project was transformed, but outputs were not generated. */
  OutputsSkipped = 'outputsSkipped',

  /** Happens whent he status of a watch changes. */
  WatchStatus = 'watchStatus',
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
