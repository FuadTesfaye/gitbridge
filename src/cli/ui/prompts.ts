import * as p from "@clack/prompts";
import pc from "picocolors";

export function handleCancel(): never {
  p.cancel(pc.yellow("Operation cancelled."));
  process.exit(0);
}

export function isCancel(value: unknown): boolean {
  return p.isCancel(value);
}

export interface PromptOption<T> {
  value: T;
  label?: string;
  hint?: string;
}

export async function promptText(options: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | Error | undefined;
}): Promise<string> {
  const res = await p.text({
    message: options.message,
    placeholder: options.placeholder,
    defaultValue: options.defaultValue,
    validate: options.validate,
  });
  if (p.isCancel(res)) handleCancel();
  return String(res);
}

export async function promptSelect<T extends string>(options: {
  message: string;
  options: Array<PromptOption<T>>;
  initialValue?: T;
}): Promise<T> {
  const res = await p.select({
    message: options.message,
    options: options.options as any,
    initialValue: options.initialValue,
  });
  if (p.isCancel(res)) handleCancel();
  return res as T;
}

export async function promptMultiSelect<T extends string>(options: {
  message: string;
  options: Array<PromptOption<T>>;
  required?: boolean;
  initialValues?: T[];
}): Promise<T[]> {
  const res = await p.multiselect({
    message: options.message,
    options: options.options as any,
    required: options.required,
    initialValues: options.initialValues as any,
  });
  if (p.isCancel(res)) handleCancel();
  return res as T[];
}

export async function promptConfirm(options: {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
}): Promise<boolean> {
  const res = await p.confirm({
    message: options.message,
    active: options.active,
    inactive: options.inactive,
    initialValue: options.initialValue,
  });
  if (p.isCancel(res)) handleCancel();
  return Boolean(res);
}

export { p };
