export interface TransformRule {
  field: string;
  operation: 'map' | 'filter' | 'reduce' | 'custom';
  config?: Record<string, unknown>;
}

export class DataTransformer {
  private rules: TransformRule[] = [];

  addRule(rule: TransformRule): this {
    this.rules.push(rule);
    return this;
  }

  transform<T extends Record<string, unknown>>(data: T[]): T[] {
    return data.map((item) => this.applyRules(item));
  }

  private applyRules<T extends Record<string, unknown>>(item: T): T {
    const result = { ...item };

    for (const rule of this.rules) {
      switch (rule.operation) {
        case 'map':
          this.applyMapRule(result, rule);
          break;
        case 'filter':
          // Filter is handled at array level
          break;
        case 'reduce':
          // Reduce operations
          break;
        case 'custom':
          this.applyCustomRule(result, rule);
          break;
      }
    }

    return result;
  }

  private applyMapRule(item: Record<string, unknown>, rule: TransformRule): void {
    const { from, to, transform } = rule.config as {
      from: string;
      to?: string;
      transform?: 'uppercase' | 'lowercase' | 'date' | 'number';
    };

    if (from in item) {
      let value = item[from];

      if (transform) {
        switch (transform) {
          case 'uppercase':
            value = String(value).toUpperCase();
            break;
          case 'lowercase':
            value = String(value).toLowerCase();
            break;
          case 'date':
            value = new Date(value as string);
            break;
          case 'number':
            value = Number(value);
            break;
        }
      }

      item[to ?? from] = value;
    }
  }

  private applyCustomRule(_item: Record<string, unknown>, _rule: TransformRule): void {
    // Custom transformation logic would go here
    // For now, it's a placeholder for extensibility
  }
}

export function createTransformer(): DataTransformer {
  return new DataTransformer();
}
