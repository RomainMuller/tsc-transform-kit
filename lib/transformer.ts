import * as ts from 'typescript';

/**
 * A TypeScript transformer.
 */
export abstract class Transformer<RootNode extends ts.Node> {
  /**
   * The `TransformStage` at which this `Transformer` operates.
   */
  public abstract readonly stages: readonly TransformerStage[];

  /**
   * Performs the TypeScript transformation on the provided `RootNode`.
   *
   * @param program  the TypeScript `Program` that is being transformed.
   * @param context  the `TransformationContext` under which we are operating.
   * @param node     the `RootNode` to be transformed.
   * @param reporter the `Diagnostic` reporter.
   *
   * @returns the transformed `RootNode`.
   *
   * @internal
   */
  public transform(
    program: ts.BuilderProgram,
    context: ts.TransformationContext,
    node: RootNode,
    reporter: DiagnosticReporter,
  ): RootNode {
    return ts.visitNode(node, node => this.#visit(program, context, node, reporter));
  }

  /**
   * Implements the logic for transforming a given TypeScript `node`.
   *
   * @param node the `Node` to be transformed.
   * @param env  the `TransformEnvironment` under which we are operating.
   *
   * @returns a `VisitResult` denoting the outcome of the transformation.
   */
  protected abstract visitNode<T extends ts.Node>(node: T, env: TransformEnvironment): ts.VisitResult<T>;

  readonly #visit = <T extends ts.Node>(program: ts.BuilderProgram, context: ts.TransformationContext, node: T, reporter: DiagnosticReporter): ts.VisitResult<T> => {
    let result = this.visitNode(node, {
      context, program,
      reportDiagnostic: (node, category, code, messageText) => reporter({
        category,
        code,
        file: node?.getSourceFile(),
        messageText,
        start: node?.getStart(),
        length: node && node.getEnd() - node.getStart(),
      })
    });

    if (result === undefined) {
      return undefined;
    }

    if (!Array.isArray(result)) {
      result = [result];
    }

    result = result.map(newNode => ts.visitEachChild(newNode, toVisit => this.#visit(program, context, toVisit, reporter), context))
      .filter(result => result != null)
      .map(result => Array.isArray(result) ? result : [result])
      .reduce((acc, newNode) => [...acc, newNode], []);

    return result.length === 1 ? result[0] : result;
  };
}

/**
 * The stages at which transformation can occur.
 */
export const enum TransformerStage {
  /**
   * This transformation happens *before* the *TypeScript* transformations have
   * occurred. Code has not been compiled and it is possible to influence the
   * generated *JavaScript*.
   *
   * In the majority of cases, transformers operate in this phase.
   */
  BEFORE = 'before',

  /**
   * This transformation happens *after* the *TypeScript* transformations have
   * occurred. Code has been compiled already.
   */
  AFTER = 'after',

  /**
   * This transformation happens *after* the *declarations* have been prepared,
   * and type definitions can be altered at this point.
   */
  AFTER_DECLARATIONS = 'afterDeclarations',
}

/**
 * The environment under which a transformation operates.
 */
export interface TransformEnvironment {
  /**
   * The TypeScript `TransformationContext` provided by the compiler framework.
   */
  readonly context: ts.TransformationContext;

  /**
   * The TypeScript `Program`, from which a `TypeChecker` can be obtained.
   */
  readonly program: ts.BuilderProgram;

  /**
   * A facility to report `Diagnostic` messages to the compiler.
   *
   * @param node        the `Node` the error is related to.
   * @param category    the `DiagnosticCategory` for the message.
   * @param code        the code for the diagnostic message.
   * @param messageText the text for the message.
   */
  readonly reportDiagnostic: (
    node: ts.Node | null,
    category: ts.DiagnosticCategory,
    code: number,
    messageText: string
  ) => void;
}

/**
 * A function that reports `Diagnostic` entries to the `TypeScriptCompiler`.
 *
 * @param diag the `Diagnostic` to be reported.
 */
export type DiagnosticReporter = (diag: ts.Diagnostic) => void;
