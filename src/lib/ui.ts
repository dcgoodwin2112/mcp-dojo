import type { Actor, Primitive } from "./events";

/**
 * Actor → "who's driving?" badge styling. Consistent across the whole UI.
 * The diagram tints each arrow by its SOURCE actor — color reinforces lane
 * position (it never replaces it: the sky/fuchsia pair collapses under
 * red-green CVD, so solid/dashed and direction keep carrying meaning).
 */
export const ACTOR_STYLES: Record<
  Actor,
  {
    label: string;
    badge: string;
    dot: string;
    arrowLine: string;
    arrowHead: string;
    lifeline: string;
    noteBorder: string;
  }
> = {
  user: {
    label: "user",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    dot: "bg-emerald-500",
    arrowLine: "border-emerald-600 dark:border-emerald-500",
    arrowHead: "text-emerald-600 dark:text-emerald-400",
    lifeline: "border-emerald-500/30",
    noteBorder: "border-emerald-300 dark:border-emerald-900",
  },
  model: {
    label: "model",
    badge: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
    dot: "bg-fuchsia-500",
    arrowLine: "border-fuchsia-600 dark:border-fuchsia-500",
    arrowHead: "text-fuchsia-600 dark:text-fuchsia-400",
    lifeline: "border-fuchsia-500/30",
    noteBorder: "border-fuchsia-300 dark:border-fuchsia-900",
  },
  app: {
    label: "app",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    dot: "bg-sky-500",
    arrowLine: "border-sky-600 dark:border-sky-500",
    arrowHead: "text-sky-600 dark:text-sky-400",
    lifeline: "border-sky-500/30",
    noteBorder: "border-sky-300 dark:border-sky-900",
  },
  server: {
    label: "server",
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    dot: "bg-orange-500",
    arrowLine: "border-orange-600 dark:border-orange-500",
    arrowHead: "text-orange-600 dark:text-orange-400",
    lifeline: "border-orange-500/30",
    noteBorder: "border-orange-300 dark:border-orange-900",
  },
};

/** Primitive → accent styling. The color-coding taught by the capability panel. */
export const PRIMITIVE_STYLES: Record<Primitive, { label: string; border: string; text: string }> = {
  tool: {
    label: "tool",
    border: "border-l-cyan-500",
    text: "text-cyan-700 dark:text-cyan-400",
  },
  resource: {
    label: "resource",
    border: "border-l-indigo-500",
    text: "text-indigo-700 dark:text-indigo-400",
  },
  prompt: {
    label: "prompt",
    border: "border-l-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
};

/** 92500 → "1:32.5" */
export function formatClock(t: number): string {
  const totalSeconds = t / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
