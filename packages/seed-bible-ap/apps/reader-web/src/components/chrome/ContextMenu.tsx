// MENUS — the old reader's ContextMenuWithButton (packages/seed-bible components/ContextMenu): a ⋮ button whose menu
// opens beside it, placed in the window so a sidebar or a pane never clips it. One menu is open at a time; a tap
// outside, Esc or choosing an item closes it; the arrow keys move through the items.
import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { handleVerticalListKeyNav } from "../keyboardNav";

const openMenu = signal<number | null>(null);
let nextId = 0;

export const closeMenus = () => (openMenu.value = null);

export function MenuButton(props: {
  label: string;
  icon?: string;
  anchorClassName?: string;
  buttonClassName?: string;
  menuClassName?: string;
  iconClassName?: string;
  /** Words on the button in place of the icon (Your content's "+ Create"). */
  text?: string;
  children: ComponentChildren;
}) {
  const [id] = useState(() => ++nextId);
  const open = openMenu.value === id;
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return;
    const b = button.current.getBoundingClientRect();
    const m = menu.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(b.right - m.width, innerWidth - m.width - 8)
    );
    const below = b.bottom + 6;
    const top =
      below + m.height > innerHeight - 8
        ? Math.max(8, b.top - m.height - 6)
        : below;
    setAt({ top, left });
    menu.current.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t))
        closeMenus();
    };
    // Esc closes the menu and nothing else: caught before the reader's keys, which would close the pane under it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      closeMenus();
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div
      className={`sb-context-menu-anchor${props.anchorClassName ? ` ${props.anchorClassName}` : ""}`}
    >
      <button
        ref={button}
        type="button"
        className={`sb-context-menu-button${props.buttonClassName ? ` ${props.buttonClassName}` : ""}`}
        aria-label={props.label}
        title={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e: MouseEvent) => {
          e.stopPropagation();
          openMenu.value = open ? null : id;
        }}
      >
        {props.text ?? (
          <span
            className={`material-symbols-outlined ${props.iconClassName ?? "sb-context-more-icon"}`}
          >
            {props.icon ?? "more_vert"}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={menu}
          role="menu"
          className={`sb-context-menu${props.menuClassName ? ` ${props.menuClassName}` : ""}`}
          style={
            at
              ? { top: `${at.top}px`, left: `${at.left}px` }
              : { visibility: "hidden", top: 0, left: 0 }
          }
          onClick={(e: MouseEvent) => e.stopPropagation()}
          onKeyDown={(e) =>
            handleVerticalListKeyNav(
              e as KeyboardEvent,
              e.currentTarget as HTMLElement
            )
          }
        >
          {props.children}
        </div>
      )}
    </div>
  );
}

export function MenuItem(props: {
  icon?: string;
  onSelect: () => void;
  children: ComponentChildren;
  className?: string;
  checked?: boolean;
}) {
  return (
    <button
      type="button"
      role={props.checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={props.checked}
      className={`sb-context-menu-item${props.className ? ` ${props.className}` : ""}`}
      onClick={() => {
        closeMenus();
        props.onSelect();
      }}
    >
      {props.icon && (
        <span
          className="material-symbols-outlined sb-context-menu-item-icon"
          aria-hidden="true"
        >
          {props.icon}
        </span>
      )}
      <span>{props.children}</span>
      {props.checked && (
        <span
          className="material-symbols-outlined sb-context-menu-item-icon sb-context-menu-item-check"
          aria-hidden="true"
        >
          check
        </span>
      )}
    </button>
  );
}
