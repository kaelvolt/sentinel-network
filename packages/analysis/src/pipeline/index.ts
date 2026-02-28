import { logger } from '@kael/core';

export interface PipelineStage<TInput, TOutput> {
  name: string;
  process(data: TInput): Promise<TOutput> | TOutput;
}

export class Pipeline<TInput, TOutput> {
  private stages: PipelineStage<unknown, unknown>[] = [];

  addStage<TIntermediate>(
    stage: PipelineStage<unknown, TIntermediate>
  ): Pipeline<TInput, TIntermediate> {
    this.stages.push(stage);
    return this as unknown as Pipeline<TInput, TIntermediate>;
  }

  async execute(input: TInput): Promise<TOutput> {
    let result: unknown = input;

    for (const stage of this.stages) {
      const startTime = Date.now();
      try {
        result = await stage.process(result);
        logger.debug(`Stage ${stage.name} completed`, {
          duration: Date.now() - startTime,
        });
      } catch (error) {
        logger.error(`Stage ${stage.name} failed`, { error });
        throw error;
      }
    }

    return result as TOutput;
  }

  async executeBatch(inputs: TInput[]): Promise<TOutput[]> {
    return Promise.all(inputs.map((input) => this.execute(input)));
  }
}

export function createPipeline<TInput, TOutput>(): Pipeline<TInput, TOutput> {
  return new Pipeline<TInput, TOutput>();
}
