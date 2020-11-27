import ts from 'typescript';
import {
  Transformer,
  TransformerContext,
  TransformerPhase,
} from './transformer';

export class Transformers {
  private readonly transformers: Transformer[];

  public constructor(...transformers: Transformer[]) {
    this.transformers = Array.from(transformers);
  }

  public addTransformer(transformer: Transformer): this {
    this.transformers.push(transformer);
    return this;
  }

  public forInvalidatedProject<T extends ts.BuilderProgram>(
    project: ts.InvalidatedProject<T>,
  ): ts.CustomTransformers {
    return {
      before: this.transformers.map((tx) =>
        customTransformerFactory(tx, TransformerPhase.Before),
      ),
      after: this.transformers.map((tx) =>
        customTransformerFactory(tx, TransformerPhase.After),
      ),
      afterDeclarations: this.transformers.map((tx) =>
        customTransformerFactory(tx, TransformerPhase.AfterDeclarations),
      ),
    };

    function customTransformerFactory(
      tx: Transformer,
      phase: TransformerPhase,
    ): ts.CustomTransformerFactory {
      return (ctx) => new CustomTransformerFactory(tx, project, ctx, phase);
    }
  }
}

class CustomTransformerFactory<T extends ts.BuilderProgram>
  implements ts.CustomTransformer {
  private readonly transformerContext: TransformerContext;

  public constructor(
    private readonly delegate: Transformer,
    invalidatedProject: ts.InvalidatedProject<T>,
    context: ts.TransformationContext,
    phase: TransformerPhase,
  ) {
    this.transformerContext = new TransformerContext(
      phase,
      context,
      invalidatedProject,
    );
  }

  public transformBundle(node: ts.Bundle): ts.Bundle {
    return this.delegate.transform(node, this.transformerContext);
  }

  public transformSourceFile(node: ts.SourceFile): ts.SourceFile {
    return this.delegate.transform(node, this.transformerContext);
  }
}
