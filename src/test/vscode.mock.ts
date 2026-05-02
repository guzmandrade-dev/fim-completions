let mockConfig: Record<string, unknown> = {};

export function setMockConfig(config: Record<string, unknown>) {
  mockConfig = config;
}

export const workspace = {
  getConfiguration: () => ({
    get: (key: string) => mockConfig[key],
  }),
};

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  constructor(
    public readonly start: Position,
    public readonly end: Position,
  ) {}
}

export class InlineCompletionItem {
  constructor(public readonly insertText: string) {}
}
