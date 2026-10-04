// Screen-level UI state that is never saved: toasts, the pop-up, the drawer.
// Plain functions wrap each store so non-React code (lib helpers, actions)
// can show a toast or open a pop-up without hooks.

import type { ReactElement } from "react";
import { create } from "zustand";

/* ---------- Toasts ---------- */

export interface ToastAction { label: string; run: () => void }
export interface Toast { id: number; message: string; duration: number; action?: ToastAction }

export const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let nextToastId = 1;

/**
 * Shows a short message at the bottom of the screen, optionally with one
 * button. Safe to call from anywhere in the browser.
 */
export function showToast(message: string, duration = 4000, action?: ToastAction): number {
  const id = nextToastId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, message, duration, action }] }));
  return id;
}

export function dismissToast(id: number): void {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((toast) => toast.id !== id) }));
}

/* ---------- Pop-up (modal) ---------- */

export interface ModalEntry {
  id: number;
  element: ReactElement;
  onClose?: () => void;
}

/**
 * One pop-up at a time, like the old app. Opening a new one replaces the one
 * showing without firing its onClose, so chained flows (walk brief, theme
 * picker, theme editor, back to the brief) are just "open the next one".
 * Closing fires the current pop-up's onClose.
 */
export const useModal = create<{ current: ModalEntry | null }>(() => ({ current: null }));
let nextModalId = 1;

export function openModal(element: ReactElement, opts: { onClose?: () => void } = {}): void {
  useModal.setState({ current: { id: nextModalId++, element, onClose: opts.onClose } });
}

export function closeModal(): void {
  const current = useModal.getState().current;
  if (!current) return;
  useModal.setState({ current: null });
  current.onClose?.();
}

/* ---------- Drawer ---------- */

export const useDrawer = create<{ open: boolean }>(() => ({ open: false }));
export const openDrawer = () => useDrawer.setState({ open: true });
export const closeDrawer = () => useDrawer.setState({ open: false });
