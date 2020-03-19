import * as ts from 'typescript';

/**
 * Transformers encapsulate the logic to transform TypeScript AST nodes during
 * the compilation phases.
 */
export abstract class Transformer {
  /**
   * Transforms a node, possibly returning another node of the same type.
   *
   * @param node    the node to be transformed.
   * @param context the context of the transformation.
   *
   * @return the result of the transformation.
   */
  public transform<T extends ts.Node>(node: T, context: TransformerContext): T {
    return ts.visitNode(
      node,
      node => this.visit(node, context),
      this.isValidNode && (node => this.isValidNode!(node, context)),
      this.liftNodeArray && (node => this.liftNodeArray!<T>(node, context)),
    );
  }

  /**
   * This method can be invoked to perform transformation of children node of
   * this. It may return a new node of the same type.
   *
   * @param node    the node which children are to be transformed.
   * @param context the context of the transformation.
   *
   * @returns the result of the children transformation.
   */
  public transformChildren<T extends ts.Node>(node: T, context: TransformerContext): T {
    return ts.visitEachChild(
      node,
      node => this.visit(node, context),
      context.context
    );
  }

  /**
   * This is the main entry point for a Transformer. It accepts a TypeScript AST
   * node and returns the appropriate transform result. If no transformation is
   * needed, the node should be returned unchanged.
   *
   * @param node    the AST node to be transformed.
   * @param context the context of the transformation.
   *
   * @returns the result of the transformation.
   */
  public abstract visit<T extends ts.Node>(node: T, context: TransformerContext): ts.VisitResult<T>;

  /**
   * An optional test to determine whether a node is valid or not.
   *
   * @param node    the node being checked.
   * @param context the context of the transformation.
   *
   * @returns `true` if the node is valid.
   */
  public readonly isValidNode?: (node: ts.Node, context: TransformerContext) => boolean;

  /**
   * An optional function to lift a NodeArray into a valid Node.
   *
   * @param nodes   the NodeArray to be lifted.
   * @param context the context of the transformation.
   *
   * @returns the lifted node.
   */
  public readonly liftNodeArray?: <T extends ts.Node>(nodes: ts.NodeArray<ts.Node>, context: TransformerContext) => T;
}

/**
 * The context of a transformation.
 */
export class TransformerContext {
  /**
   * The TypeScript transformation context.
   */
  public readonly context: ts.TransformationContext;

  /**
   * The phase in which the transformation is running.
   */
  public readonly phase: TransformerPhase;

  /** @internal */
  public constructor(
    phase: TransformerPhase,
    context: ts.TransformationContext,
    private readonly invalidatedProject: ts.InvalidatedProject<ts.BuilderProgram>,
  ) {
    this.context = context;
    this.phase = phase;
  }

  /**
   * Compiler options used for the current transformation.
   */
  public get compilerOptions(): ts.CompilerOptions {
    return this.invalidatedProject.getCompilerOptions();
  }

  /**
   * The directory in which the compiler is currently operating.
   */
  public get currentDirectory(): string {
    return this.invalidatedProject.getCurrentDirectory();
  }

  /**
   * The path to the configuration file of the current project.
   */
  public get projectConfiguration(): string {
    return this.invalidatedProject.project;
  }

  /**
   * The TypeScript program being transformed. This is only available if the
   * invalidated project that triggered the transformation is of "Build" kind.
   */
  public get program(): ts.Program | undefined {
    if (this.invalidatedProject.kind === ts.InvalidatedProjectKind.Build) {
      this.invalidatedProject.getProgram();
    }
    return undefined;
  }
}

/**
 * The various possible transformation phaseS.
 */
export const enum TransformerPhase {
  /**
   * TypeScript's own transformations are yet to run. This phase is almost never
   * the one you should be transforming in.
   */
  Before = 'before',

  /**
   * TypeScript's own transformations have run already. This phase is almost
   * always the one you should be transforming in.
   */
  After = 'after',

  /**
   * TypeScript's own transformations have run already, and declarations are
   * ready. This phase is where you can influence emitted types.
   */
  AfterDeclarations = 'afterDeclarations',
}
