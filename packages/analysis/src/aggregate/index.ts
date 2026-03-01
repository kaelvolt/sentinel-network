type AggregationFunction = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last';

export interface AggregationConfig {
  groupBy?: string[];
  aggregations: {
    field: string;
    function: AggregationFunction;
    alias?: string;
  }[];
}

export class Aggregator {
  aggregate<T extends Record<string, unknown>>(
    data: T[],
    config: AggregationConfig
  ): Record<string, unknown>[] {
    if (!config.groupBy || config.groupBy.length === 0) {
      // Global aggregation
      return [this.computeAggregations(data, config.aggregations)];
    }

    // Grouped aggregation
    const groups = this.groupBy(data, config.groupBy!);
    return Array.from(groups.entries()).map(([key, groupData]) => ({
      ...this.parseGroupKey(key, config.groupBy),
      ...this.computeAggregations(groupData, config.aggregations),
    }));
  }

  private groupBy<T extends Record<string, unknown>>(
    data: T[],
    fields: string[]
  ): Map<string, T[]> {
    const groups = new Map<string, T[]>();

    for (const item of data) {
      const key = fields.map((f) => String(item[f])).join('|');
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    return groups;
  }

  private parseGroupKey(key: string, fields: string[]): Record<string, unknown> {
    const values = key.split('|');
    return fields.reduce((acc, field, index) => {
      acc[field] = values[index];
      return acc;
    }, {} as Record<string, unknown>);
  }

  private computeAggregations<T extends Record<string, unknown>>(
    data: T[],
    aggregations: AggregationConfig['aggregations']
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const agg of aggregations) {
      const values = data.map((item) => item[agg.field]).filter((v): v is number => typeof v === 'number');
      const alias = agg.alias ?? `${agg.field}_${agg.function}`;

      switch (agg.function) {
        case 'sum':
          result[alias] = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          result[alias] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case 'min':
          result[alias] = values.length > 0 ? Math.min(...values) : null;
          break;
        case 'max':
          result[alias] = values.length > 0 ? Math.max(...values) : null;
          break;
        case 'count':
          result[alias] = data.length;
          break;
        case 'first':
          result[alias] = data[0]?.[agg.field] ?? null;
          break;
        case 'last':
          result[alias] = data[data.length - 1]?.[agg.field] ?? null;
          break;
      }
    }

    return result;
  }
}

export function createAggregator(): Aggregator {
  return new Aggregator();
}
