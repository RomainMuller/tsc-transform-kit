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
   * @param program the TypeScript `Program` that is being transformed.
   * @param context the `TransformationContext` under which we are operating.
   * @param node    the `RootNode` to be transformed.
   *
   * @returns the transformed `RootNode`.
   *
   * @internal
   */
  public transform(program: ts.BuilderProgram, context: ts.TransformationContext, node: RootNode): RootNode {
    return ts.visitNode(node, node => this.visit(program, context, node));
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

  private visit<T extends ts.Node>(program: ts.BuilderProgram, context: ts.TransformationContext, node: T): ts.VisitResult<T> {
    let result = this.visitNode(node, { context, program });

    if (result === undefined) {
      return undefined;
    }

    if (!Array.isArray(result)) {
      result = [result];
    }

    result = result.map(newNode => ts.visitEachChild(newNode, toVisit => this.visit(program, context, toVisit), context))
      .filter(result => result != null)
      .map(result => Array.isArray(result) ? result : [result])
      .reduce((acc, newNode) => [...acc, newNode], []);

    return result.length === 1 ? result[0] : result;
  }
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
}
