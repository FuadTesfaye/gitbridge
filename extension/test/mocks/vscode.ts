export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  public label?: string;
  public collapsibleState?: TreeItemCollapsibleState;
  public description?: string;
  public tooltip?: string | MarkdownString;
  public iconPath?: unknown;
  public contextValue?: string;
  public command?: { command: string; title: string; arguments?: unknown[] };

  constructor(label: string, collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export class ThemeIcon {
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class MarkdownString {
  public value = "";
  public isTrusted = false;
  appendMarkdown(value: string) {
    this.value += value;
  }
}
