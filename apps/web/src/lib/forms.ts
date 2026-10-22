import { redirect } from "next/navigation";
import type { z } from "zod";

/** Redirect back to a form with a message the page shows in a Notice. */
export function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message)}`);
}

/** Parse FormData with a zod schema; on failure, redirect back with the first issue. */
export function parseForm<T extends z.ZodType>(schema: T, formData: FormData, backTo: string): z.infer<T> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    raw[key] = typeof value === "string" ? value : value;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join(".");
    fail(backTo, field ? `${field}: ${issue?.message}` : (issue?.message ?? "Please check the form."));
  }
  return parsed.data;
}

/** Empty strings from forms become null. */
export function blankToNull(v: unknown): unknown {
  return typeof v === "string" && v.trim() === "" ? null : typeof v === "string" ? v.trim() : v;
}
