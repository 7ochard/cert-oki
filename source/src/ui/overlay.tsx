import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type Anchor = React.RefObject<HTMLElement | null>;

export interface SelectOption<T extends string> {
  label: string;
  value: T;
  description?: string;
  extra?: string;
  disabled?: boolean;
}

function useAnchoredStyle(open: boolean, anchorRef: Anchor, panelRef: React.RefObject<HTMLElement | null>, fixedWidth?: number) {
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    function update() {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor) {
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const panelHeight = panel?.offsetHeight ?? 240;
      const panelWidth = fixedWidth ?? panel?.offsetWidth ?? rect.width;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const placeAbove = spaceBelow < panelHeight + gap && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(320, (placeAbove ? spaceAbove : spaceBelow) - gap));
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - panelWidth - margin));
      setStyle({
        left,
        top: placeAbove ? Math.max(margin, rect.top - Math.min(panelHeight, maxHeight) - gap) : rect.bottom + gap,
        minWidth: Math.min(rect.width, window.innerWidth - margin * 2),
        maxHeight,
        ...(fixedWidth ? { width: Math.min(fixedWidth, window.innerWidth - margin * 2) } : {})
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, fixedWidth, open, panelRef]);

  return style;
}

function useDismiss(open: boolean, onOpenChange: (open: boolean) => void, anchorRef: Anchor, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function isInside(target: Node) {
      return Boolean(anchorRef.current?.contains(target) || panelRef.current?.contains(target));
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!isInside(event.target as Node)) {
        onOpenChange(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        anchorRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onOpenChange, open, panelRef]);
}

export function Popover({
  anchorRef,
  children,
  className = "",
  label,
  onOpenChange,
  open,
  width
}: {
  anchorRef: Anchor;
  children: React.ReactNode;
  className?: string;
  label: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const style = useAnchoredStyle(open, anchorRef, panelRef, width);
  useDismiss(open, onOpenChange, anchorRef, panelRef);
  if (!open) {
    return null;
  }
  return createPortal(
    <div ref={panelRef} className={"overlay-panel " + className} role="dialog" aria-label={label} style={style}>
      {children}
    </div>,
    document.body
  );
}

export function SelectField<T extends string>({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  prefix,
  value
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  prefix?: string;
  value: T;
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<T | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const style = useAnchoredStyle(open, triggerRef, panelRef);
  useDismiss(open, setOpen, triggerRef, panelRef);

  function choose(option: SelectOption<T>) {
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    setOpen(false);
    setHighlighted(null);
    triggerRef.current?.focus();
  }

  function moveHighlight(direction: 1 | -1) {
    const enabled = options.filter((option) => !option.disabled);
    if (!enabled.length) {
      return;
    }
    const current = enabled.findIndex((option) => option.value === (highlighted ?? value));
    const next = enabled[(current + direction + enabled.length) % enabled.length];
    setHighlighted(next.value);
  }

  return (
    <div className="dropdown-field">
      <button
        ref={triggerRef}
        className="dropdown-trigger"
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        data-state={open ? "open" : "closed"}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) {
              setOpen(true);
            }
            moveHighlight(event.key === "ArrowDown" ? 1 : -1);
          }
          if (event.key === "Enter" && open && highlighted) {
            event.preventDefault();
            const option = options.find((item) => item.value === highlighted);
            if (option) {
              choose(option);
            }
          }
        }}
      >
        <span className="dropdown-trigger-content">
          <span className="dropdown-value">{prefix ? prefix + " " : ""}{selected?.label ?? "-"}</span>
          {selected?.extra ? <span className="dropdown-extra">{selected.extra}</span> : null}
        </span>
        <ChevronDown className="dropdown-chevron" size={16} />
      </button>
      {open ? createPortal(
        <div ref={panelRef} className="overlay-panel dropdown-menu" id={listId} role="listbox" aria-label={ariaLabel} style={style}>
          {options.map((option) => {
            const checked = option.value === value;
            const active = option.value === highlighted;
            return (
              <button
                className="dropdown-option"
                key={option.value}
                type="button"
                role="option"
                aria-selected={checked}
                data-highlighted={active ? "true" : "false"}
                data-state={checked ? "checked" : "unchecked"}
                disabled={option.disabled}
                onMouseEnter={() => setHighlighted(option.value)}
                onMouseLeave={() => setHighlighted((current) => current === option.value ? null : current)}
                onClick={() => choose(option)}
              >
                <span className="dropdown-option-main">
                  <span>{option.label}</span>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {option.extra ? <span className="dropdown-extra">{option.extra}</span> : null}
                {checked ? <Check size={16} /> : <span className="dropdown-check-spacer" aria-hidden="true" />}
              </button>
            );
          })}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
