/**
 * Lightweight mocks for @base primitives used by the Stash UI.
 * Each mock renders the minimal HTML needed to make assertions work.
 */
import React from 'react';

// --- Button ---
export function Button(props: Record<string, unknown>) {
  const { children, icon: _icon, iconOnly: _iconOnly, intent: _intent, skeleton: _skeleton, loading: _loading, shape: _shape, appearance: _appearance, variant: _variant, size: _size, ...rest } = props;
  return React.createElement('button', rest, children as React.ReactNode);
}

// --- Input ---
export function Input(props: Record<string, unknown>) {
  const { variant: _variant, size: _size, iconLeft: _iconLeft, iconRight: _iconRight, ...rest } = props;
  return React.createElement('input', rest);
}

// --- Badge ---
export function Badge(props: Record<string, unknown>) {
  const { children, variant: _variant, size: _size, color: _color, ...rest } = props;
  return React.createElement('span', rest, children as React.ReactNode);
}

// --- Select ---
export function Select(props: Record<string, unknown>) {
  const { children, variant: _variant, size: _size, ...rest } = props;
  return React.createElement('select', rest, children as React.ReactNode);
}

// --- Dialog ---
export function Dialog(props: Record<string, unknown>) {
  const { children, open, title, description, onClose: _onClose, size: _size, ...rest } = props;
  if (!open) return null;
  return React.createElement('div', { role: 'dialog', ...rest },
    title ? React.createElement('h2', null, title as string) : null,
    description ? React.createElement('p', null, description as string) : null,
    children as React.ReactNode
  );
}

// --- Toggle ---
export function Toggle(props: Record<string, unknown>) {
  const { checked, onChange, ...rest } = props;
  return React.createElement('input', { type: 'checkbox', checked, onChange, role: 'switch', ...rest });
}

// --- Separator ---
export function Separator() {
  return React.createElement('hr');
}

// --- Progress ---
export function Progress(props: Record<string, unknown>) {
  const { indeterminate: _indeterminate, size: _size, color: _color, ...rest } = props;
  return React.createElement('div', { role: 'progressbar', ...rest });
}

// --- Toast ---
export function Toast(props: Record<string, unknown>) {
  const { message, variant: _variant, onDismiss, ...rest } = props;
  return React.createElement('div', { role: 'alert', ...rest },
    React.createElement('span', null, message as string),
    onDismiss ? React.createElement('button', { onClick: onDismiss, 'aria-label': 'Dismiss' }, 'X') : null
  );
}

// --- Icon strings (SVG innerHTML) ---
export const eye = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>';
export const eyeOff = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>';
export const trash2 = '<path d="M3 6h18"/>';
export const search = '<circle cx="11" cy="11" r="8"/>';
export const plus = '<line x1="12" y1="5" x2="12" y2="19"/>';
export const scan = '<path d="M1 1h6"/>';
export const lock = '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>';
export const terminal = '<polyline points="4 17 10 11 4 5"/>';
