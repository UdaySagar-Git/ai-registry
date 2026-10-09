import { Box, Text } from "ink";
import { type Attributes, createElement, type ReactElement, type ReactNode } from "react";
import type { HintKey } from "#core/host/panel.ts";
import { COLOR } from "#core/term/theme.ts";

// `createElement` rather than JSX: the CLI runs from TypeScript source under Node's type
// stripping, which does not transform JSX.

type BoxProps = (Parameters<typeof Box>[0] & Attributes) | null;
type TextProps = (Parameters<typeof Text>[0] & Attributes) | null;

export function box(props: BoxProps, ...children: ReactNode[]): ReactElement {
  return createElement(Box, props, ...children);
}

export function text(props: TextProps, ...children: ReactNode[]): ReactElement {
  return createElement(Text, props, ...children);
}

export function plain(value: ReactNode): ReactElement {
  return createElement(Text, null, value);
}

export function dim(value: ReactNode): ReactElement {
  return createElement(Text, { color: COLOR.dim }, value);
}

export function faint(value: ReactNode): ReactElement {
  return createElement(Text, { color: COLOR.faint }, value);
}

/** A full-width rule. Ink has no border-only-top, so it is drawn as text. */
export function rule(width: number): ReactElement {
  return createElement(Text, { color: COLOR.faint }, "─".repeat(Math.max(0, width)));
}

/** A section heading: small, dim, and the same everywhere. */
export function heading(label: string): ReactElement {
  return createElement(Text, { color: COLOR.dim }, label.toUpperCase());
}

/** `[k] label`, the shape every action in the console is announced in. */
export function action(key: string, label: string, active = true): ReactElement {
  const color = active ? COLOR.green : COLOR.faint;
  return createElement(
    Text,
    { color, bold: active },
    `[${key}] `,
    createElement(Text, { color, bold: false }, label),
  );
}

export function hints(keys: readonly HintKey[]): ReactElement {
  const parts: ReactNode[] = [];
  for (const [index, hint] of keys.entries()) {
    if (index > 0) parts.push(createElement(Text, { key: `s${index}` }, "   "));
    parts.push(
      createElement(Text, { key: `k${index}`, color: COLOR.ink }, hint.key),
      createElement(Text, { key: `l${index}`, color: COLOR.faint }, ` ${hint.label}`),
    );
  }
  return createElement(Box, null, ...parts);
}
