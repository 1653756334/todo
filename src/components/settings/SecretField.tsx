"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Undo2 } from "lucide-react";
import { AnimatedCollapse } from "@/components/Motion";

export type SecretPatch = { action: "keep" | "set" | "clear"; value?: string };

type Props = {
  id: string;
  label: string;
  configured: boolean;
  patch: SecretPatch;
  onChange: (patch: SecretPatch) => void;
  hint?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
};

export function SecretField({
  id, label, configured, patch, onChange, hint, placeholder, error, disabled,
}: Props) {
  const [visible, setVisible] = useState(false);
  const inputVisible = patch.action === "set" || (!configured && patch.action === "keep");
  return (
    <div className="mt-4 min-w-0">
      {inputVisible ? <label className="label" htmlFor={id}>{label}</label> : <span className="label">{label}</span>}
      <div className="rounded-lg border border-line bg-sunken/50 p-3">
        <AnimatedCollapse open={inputVisible}>
          <div className="space-y-2">
            <div className="relative">
            <input
              id={id}
              className="field !pr-12"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              autoFocus={configured && patch.action === "set"}
              spellCheck={false}
              disabled={disabled}
              value={patch.action === "set" ? patch.value ?? "" : ""}
              maxLength={2000}
              required={configured && patch.action === "set"}
              placeholder={placeholder ?? "输入新凭据"}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
              onChange={event => onChange(event.target.value || configured
                ? { action: "set", value: event.target.value }
                : { action: "keep" })}
            />
            <button type="button" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-sunken" aria-label={`${visible ? "隐藏" : "显示"}${label}`} aria-pressed={visible} disabled={disabled} onClick={() => setVisible(value => !value)}>
              {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="hint">{patch.value ? "新内容尚未保存，保存后生效。" : configured ? "填写新内容会替换原凭据。" : "保存后加密存储。"}</span>
              {patch.action === "set" && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => onChange({ action: "keep" })}>
                  <Undo2 size={14} aria-hidden="true" />{configured ? "取消替换" : "清空输入"}
                </button>
              )}
            </div>
          </div>
        </AnimatedCollapse>
        <AnimatedCollapse open={!inputVisible}>
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound size={16} className="text-muted" aria-hidden="true" />
            <span className="mr-auto text-sm text-muted" role="status">
              {patch.action === "clear" ? "待清除，保存后生效" : "已保存，内容不回显"}
            </span>
            {patch.action === "clear" ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => onChange({ action: "keep" })}>
                <Undo2 size={14} aria-hidden="true" />撤销清除
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-secondary btn-sm" disabled={disabled} onClick={() => onChange({ action: "set", value: "" })}>替换</button>
                <button type="button" className="btn btn-ghost btn-sm text-danger" disabled={disabled} onClick={() => onChange({ action: "clear" })}>清除</button>
              </>
            )}
          </div>
        </AnimatedCollapse>
      </div>
      {error ? <p id={`${id}-error`} className="error-text mt-2" role="alert">{error}</p> : hint ? <p id={`${id}-hint`} className="hint mt-2">{hint}</p> : null}
    </div>
  );
}
