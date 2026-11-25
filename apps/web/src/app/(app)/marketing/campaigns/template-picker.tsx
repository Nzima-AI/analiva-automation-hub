"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

/** Template choice that also refreshes the phone preview beside the form. */
export function TemplatePicker({ name, options, value, required }: { name: string; options: Array<{ value: string; label: string }>; value: string; required?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      name={name}
      defaultValue={value}
      required={required}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        next.set("tpl", e.target.value);
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
    >
      <option value="" disabled>Choose a template</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}
