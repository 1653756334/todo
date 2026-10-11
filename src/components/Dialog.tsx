"use client";

import {
  useEffect,
  useId,
  useRef,
  type RefObject,
} from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  labelledBy?: string;
  maxWidth?: number;
  closeDisabled?: boolean;
  description?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const modalStack: HTMLElement[] = [];
const inertElements = new Map<
  HTMLElement,
  { count: number; previous: boolean }
>();
let previousOverflow = "";

/** Shared by dialogs and the fullscreen task detail. Callbacks may change without resetting focus. */
export function useModalInteraction(
  panelRef: RefObject<HTMLElement | null>,
  active: boolean,
  onClose: () => void,
) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (modalStack.length === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    modalStack.push(panel);

    const inertSiblings: HTMLElement[] = [];
    let branch: HTMLElement = panel;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (
          !(sibling instanceof HTMLElement) ||
          sibling === branch ||
          sibling.contains(modalStack.at(-1)!)
        )
          continue;
        const record = inertElements.get(sibling) ?? {
          count: 0,
          previous: sibling.inert,
        };
        record.count += 1;
        inertElements.set(sibling, record);
        sibling.inert = true;
        inertSiblings.push(sibling);
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }

    const isTop = () => modalStack.at(-1) === panel && !document.querySelector('[role="alertdialog"]');
    const nodes = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) =>
          node.getClientRects().length > 0 &&
          !node.matches(":disabled") &&
          !node.closest('[inert], [aria-hidden="true"]'),
      );
    const initial =
      nodes().find((node) => node.hasAttribute("data-autofocus")) ??
      nodes().find((node) =>
        ["INPUT", "TEXTAREA", "SELECT"].includes(node.tagName),
      ) ??
      nodes()[0] ??
      panel;
    initial.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (!isTop()) return;
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
        return;
      }
      if (!panel!.contains(event.target as Node)) {
        event.stopImmediatePropagation();
        (nodes()[0] ?? panel!).focus({ preventScroll: true });
      }
      if (event.key !== "Tab") return;
      const focusable = nodes();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        panel!.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel)
      ) {
        event.preventDefault();
        first.focus();
      }
    }
    function onFocusIn(event: FocusEvent) {
      if (isTop() && !panel!.contains(event.target as Node)) {
        (nodes()[0] ?? panel!).focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      const wasTop = isTop();
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      modalStack.splice(modalStack.indexOf(panel), 1);
      for (const sibling of inertSiblings) {
        const record = inertElements.get(sibling);
        if (!record) continue;
        record.count -= 1;
        if (record.count === 0) {
          sibling.inert = record.previous;
          inertElements.delete(sibling);
        }
      }
      if (modalStack.length === 0)
        document.body.style.overflow = previousOverflow;
      if (
        wasTop &&
        previouslyFocused?.isConnected &&
        !previouslyFocused.closest("[inert]")
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active, panelRef]);
}

export function Modal({ open, onClose, title, children, footer, maxWidth = 560, closeDisabled = false, description }: Props) {
  const descriptionId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) return;
    const remember = () => {
      if (document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    };
    remember();
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, [open]);
  return (
    <RadixDialog.Root open={open} onOpenChange={value => { if (!value && !closeDisabled) onClose(); }}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay fixed inset-0 z-[100] bg-black/25 backdrop-blur-sm" />
        <RadixDialog.Content style={{ maxWidth }} className="dialog-panel fixed left-1/2 top-1/2 z-[101] flex max-h-[90dvh] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-line bg-surface shadow-2xl outline-none" aria-describedby={description ? descriptionId : undefined} onCloseAutoFocus={event => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus({ preventScroll: true }); } }} onEscapeKeyDown={event => { if (closeDisabled) event.preventDefault(); }} onPointerDownOutside={event => { if (closeDisabled) event.preventDefault(); }}>
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <RadixDialog.Title className="break-words text-lg font-semibold">{title}</RadixDialog.Title>
              {description && <RadixDialog.Description id={descriptionId} className="hint mt-1">{description}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="icon-button -mr-1 -mt-1" aria-label="关闭" disabled={closeDisabled}><X size={18} /></RadixDialog.Close>
          </header>
          <div className="min-h-0 overflow-auto overscroll-contain p-5">{children}</div>
          {footer && <footer className="shrink-0 border-t border-line px-5 py-4">{footer}</footer>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 min-w-0 first:mt-0">
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-error` : undefined}
          className="error-text mt-2"
          role="alert"
        >
          {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="hint mt-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
