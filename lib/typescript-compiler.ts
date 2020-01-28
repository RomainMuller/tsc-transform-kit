import * as ts from 'typescript';
import { Transformer, TransformerStage } from './transformer';
import { reportDiagnostic } from './report-diagnostic';

export class TypeScriptCompiler {
  private readonly transformers: Transformer<ts.Bundle | ts.SourceFile>[] = [];

  public constructor(private readonly configFilePath: string) {}

  public appendTransformer(transformer: Transformer<ts.Bundle | ts.SourceFile>) {
    this.transformers.push(transformer);
  }

  public prependTransformer(transformer: Transformer<ts.Bundle | ts.SourceFile>) {
    this.transformers.unshift(transformer);
  }

  public compileOnce(): ts.EmitResult {
    const parsedCommandLine = this.parseCompilerConfiguration();
    const host = ts.createIncrementalCompilerHost(parsedCommandLine.options);

    const configFileParsingDiagnostics = ts.getConfigFileParsingDiagnostics(parsedCommandLine);
    const program = ts.createIncrementalProgram({
      configFileParsingDiagnostics,
      options: parsedCommandLine.options,
      rootNames: parsedCommandLine.fileNames,
      host,
      projectReferences: parsedCommandLine.projectReferences,
    });

    const transformResult = this.transformProgram(program);
    return {
      ...transformResult,
      diagnostics: [...configFileParsingDiagnostics, ...transformResult.diagnostics],
    };
  }

  public compileAndWatch(watchOptions?: TypeScriptWatchOptions): ts.Watch<ts.BuilderProgram> {
    const host = ts.createWatchCompilerHost(
      this.configFilePath,
      DEFAULT_COMPILER_OPTIONS,
      ts.sys,
      undefined,
      watchOptions?.reportDiagnostic,
      watchOptions?.reportWatchStatus
    );

    const afterProgramCreate = host.afterProgramCreate;
    host.afterProgramCreate = program => {
      const emitResult = this.transformProgram(program);

      for (const diagnostic of emitResult.diagnostics) {
        watchOptions.reportDiagnostic(diagnostic);
      }

      if (watchOptions?.onCompilationComplete != null) {
        watchOptions.onCompilationComplete(emitResult);
      }
      afterProgramCreate?.call(host, program);
    };
    return ts.createWatchProgram(host);
  }

  private parseCompilerConfiguration() {
    const host: ts.ParseConfigFileHost = {
      fileExists: ts.sys.fileExists,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        reportDiagnostic(diagnostic);
        throw new Error(`Invalid configuration: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine)}`);
      },
      readDirectory: ts.sys.readDirectory,
      readFile: ts.sys.readFile,
      useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    };
    const result = ts.getParsedCommandLineOfConfigFile(this.configFilePath, DEFAULT_COMPILER_OPTIONS, host);
    if (result == null) {
      throw new Error(`Unable to parse command line equivalent from the config file at: ${this.configFilePath}`);
    }
    return result;
  }

  private transformProgram(program: ts.BuilderProgram) {
    return program.emit(
      undefined,  // targetSourceFile
      undefined,  // writeFile
      undefined,  // cancellationToken
      false,      // emitOnlyDtsFiles
      {           // customTransformers
        before: this.transformers
          .filter(tx => tx.stage === TransformerStage.BEFORE)
          .map(tx => toTransformerFactory(tx as Transformer<ts.SourceFile>)),
        after: this.transformers
          .filter(tx => tx.stage === TransformerStage.AFTER)
          .map(tx => toTransformerFactory(tx as Transformer<ts.SourceFile>)),
        afterDeclarations: this.transformers
          .filter(tx => tx.stage === TransformerStage.AFTER_DECLARATIONS)
          .map(toTransformerFactory),
      },
    );

    function toTransformerFactory<T extends ts.Bundle | ts.SourceFile>(transformer: Transformer<T>): ts.TransformerFactory<T> {
      return context => node => transformer.transform(program, context, node);
    }
  }
}

export interface TypeScriptCompilerOptions {
  readonly configFilePath: string;
  readonly rootFiles: readonly string[];
}

export interface TypeScriptWatchOptions {
  reportDiagnostic: ts.DiagnosticReporter;
  reportWatchStatus?: ts.WatchStatusReporter;
  onCompilationComplete?: (emitResult: ts.EmitResult) => void;
}

const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  alwaysStrict: true,
  charset: 'utf-8',
  composite: true,
  incremental: true,
  inlineSourceMap: true,
  inlineSources: false,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  noImplicitAny: true,
  noImplicitReturns: true,
  noImplicitThis: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  target: ts.ScriptTarget.ES2017,
};
