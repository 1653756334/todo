"use client";

import { useId } from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, ChevronDown, Minus } from "lucide-react";

export function Switch({ checked, onCheckedChange, disabled, label, description }: {
  checked: boolean; onCheckedChange: (value: boolean) => void; disabled?: boolean; label: string; description?: string;
}) {
  const id = useId();
  return (
    <div className={`flex items-center justify-between gap-4 ${disabled ? "text-muted" : ""}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">{label}</label>
        {description && <p id={`${id}-hint`} className="hint mt-1">{description}</p>}
      </div>
      <SwitchPrimitive.Root id={id} type="button" checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-describedby={description ? `${id}-hint` : undefined} className="relative h-6 w-11 shrink-0 rounded-full border border-line bg-sunken transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50">
        <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </SwitchPrimitive.Root>
    </div>
  );
}

export function Select({ value, onValueChange, options, label, disabled, id, invalid, describedBy }: {
  value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; label: string; disabled?: boolean; id?: string; invalid?: boolean; describedBy?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger id={id} type="button" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="field flex items-center justify-between gap-3 text-left [&>span:first-child]:truncate">
        <SelectPrimitive.Value /><SelectPrimitive.Icon className="shrink-0 text-muted"><ChevronDown size={15} /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={5} collisionPadding={12} className="popover-panel z-[200] max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-xl">
          <SelectPrimitive.Viewport>
            {options.map(option => (
              <SelectPrimitive.Item key={option.value} value={option.value} className="flex min-h-10 cursor-default items-center justify-between gap-3 rounded px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent">
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="shrink-0"><Check size={15} /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function Checkbox({ checked, onCheckedChange, label, disabled }: {
  checked: boolean | "indeterminate"; onCheckedChange: (value: boolean | "indeterminate") => void; label: string; disabled?: boolean;
}) {
  return (
    <CheckboxPrimitive.Root type="button" aria-label={label} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-white data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-white disabled:opacity-50">
      <CheckboxPrimitive.Indicator>{checked === "indeterminate" ? <Minus size={13} /> : <Check size={13} />}</CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
