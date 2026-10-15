"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

type ThemedSelectProps<T extends string> = {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** Shared theme-aware select. The browser's top layer keeps menus clear of panel clipping. */
export function ThemedSelect<T extends string>({
  label, value, options, onChange, disabled, title, open: controlledOpen, onOpenChange
}: ThemedSelectProps<T>) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const [highlighted, setHighlighted] = useState(0);
  const search = useRef({ text: "", time: 0 });
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const setOpen = (next: boolean) => {
    setLocalOpen(next);
    onOpenChange?.(next);
  };

  useLayoutEffect(() => {
    const popup = menu.current;
    const button = trigger.current;
    if (!popup || !button) return;
    if (!open || disabled) {
      if (popup.matches(":popover-open")) popup.hidePopover();
      return;
    }
    const position = () => {
      const rect = button.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < 180 && above > below;
      const width = Math.min(Math.max(rect.width, 168), window.innerWidth - 16);
      Object.assign(popup.style, {
        width: `${width}px`,
        left: `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`,
        top: upwards ? "auto" : `${rect.bottom + 5}px`,
        bottom: upwards ? `${window.innerHeight - rect.top + 5}px` : "auto",
        maxHeight: `${Math.max(60, Math.min(320, upwards ? above : below))}px`
      });
    };
    position();
    popup.showPopover();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, disabled]);

  useEffect(() => {
    if (open) menu.current?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const choose = (index: number) => {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : open ? (highlighted + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : selected;
      setHighlighted(next);
      setOpen(true);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(highlighted);
      else { setHighlighted(selected); setOpen(true); }
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (open && event.key === "Escape") event.preventDefault();
      setOpen(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      search.current = { text: (now - search.current.time < 700 ? search.current.text : "") + event.key.toLowerCase(), time: now };
      const match = options.findIndex((option) => option.label.toLowerCase().startsWith(search.current.text));
      if (match >= 0) { setHighlighted(match); setOpen(true); }
    }
  };

  return (
    <div className="themedSelect">
      <button
        ref={trigger} type="button" role="combobox" className="themedSelectTrigger"
        aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={id} aria-activedescendant={open ? `${id}-${highlighted}` : undefined}
        disabled={disabled} title={title} onKeyDown={onKeyDown}
        onClick={() => { setHighlighted(selected); setOpen(!open); }}
      >
        <span>{options[selected]?.label}</span><ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        ref={menu} id={id} popover="auto" role="listbox" aria-label={label}
        className="themedSelectMenu"
        onToggle={(event) => { if (event.newState === "closed" && open) setOpen(false); }}
        onPointerDown={(event) => event.preventDefault()}
      >
        {options.map((option, index) => (
          <button
            key={option.value} id={`${id}-${index}`} type="button" role="option" tabIndex={-1}
            aria-selected={option.value === value} data-index={index}
            data-highlighted={highlighted === index} className="themedSelectOption"
            onPointerMove={() => setHighlighted(index)} onClick={() => choose(index)}
          >
            <span>{option.label}</span>{option.value === value && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}
