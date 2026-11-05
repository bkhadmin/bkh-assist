"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { clearPersistedFilters } from "@/lib/persisted-filter";
import { Icon } from "./icons";
import { adminSection } from "./nav-items";

// Thai leading vowels (เ แ โ ใ ไ) are written before the consonant; skip them so "เอก" gives "อ", not "เ".
const initial = (name: string) => ([...name.trim()].find((c) => !/[เแโใไ]/.test(c)) ?? "?").toUpperCase();

const items = (menu: HTMLElement | null) => [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

const itemClass =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-3 text-sm outline-none hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-ring";

// Sidebar footer: avatar + name; opens a menu upward (expanded) or as a flyout to the right (collapsed rail).
// Native popover gives top layer (escapes the rail's overflow clipping), click-outside and Esc to close.
// `admin` adds the admin pages (adminSection) above sign-out; access is still enforced by proxy.ts and the admin layout.
export function ProfileMenu({ name, admin = false, signOut }: { name: string; admin?: boolean; signOut: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const adminId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!menu || !button) return;
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open") return;
      const r = button.getBoundingClientRect();
      const rail = document.documentElement.dataset.sidebar === "collapsed" && button.closest(".rail") !== null;
      // Same anchoring idea as the collapsed nav flyout: fixed position read from the trigger.
      menu.style.left = `${rail ? r.right + 8 : r.left}px`;
      menu.style.bottom = `${innerHeight - (rail ? r.bottom : r.top - 4)}px`;
      menu.style.width = rail ? "" : `${r.width}px`;
    };
    const sync = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) items(menu)[0]?.focus();
    };
    menu.addEventListener("beforetoggle", place);
    menu.addEventListener("toggle", sync);
    return () => {
      menu.removeEventListener("beforetoggle", place);
      menu.removeEventListener("toggle", sync);
    };
  }, []);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items(menuRef.current);
    const i = list.indexOf(document.activeElement as HTMLElement);
    const move = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      list.at(move % list.length)?.focus();
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      menuRef.current?.hidePopover();
      if (e.key === "Escape") buttonRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        popoverTarget={menuId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`flex h-11 w-full items-center gap-2.5 rounded-md border pr-2.5 pl-[9px] text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          open ? "border-line bg-surface" : "border-transparent hover:bg-hover"
        }`}
      >
        <span
          aria-hidden="true"
          className="grid size-7 shrink-0 place-items-center rounded-full border border-accent-line bg-accent-soft text-xs font-semibold text-accent-text"
        >
          {initial(name)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium transition-opacity duration-150 collapsed:opacity-0 motion-reduce:transition-none">
          {name}
        </span>
        <Icon
          name="chevron"
          className={`size-3.5 shrink-0 text-muted transition-transform duration-200 collapsed:opacity-0 motion-reduce:transition-none ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </button>

      <div
        ref={menuRef}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label={name}
        onKeyDown={onMenuKey}
        className="fixed inset-auto m-0 min-w-52 rounded-lg border border-line bg-surface p-1 text-foreground shadow-lg"
      >
        {/* The name is hidden on the collapsed rail, so the flyout repeats it as a heading. */}
        <p className="hidden truncate px-3 pt-1.5 pb-1 text-xs font-semibold text-muted collapsed:block">{name}</p>
        {admin && (
          <>
            <div role="group" aria-labelledby={adminId}>
              <p id={adminId} className="px-3 pt-1.5 pb-1 text-xs font-semibold text-muted">
                {adminSection.label}
              </p>
              {adminSection.children.map((link) => (
                // Client navigation keeps the shell mounted, so close the popover by hand.
                <Link key={link.href} href={link.href} role="menuitem" tabIndex={-1} onClick={() => menuRef.current?.hidePopover()} className={itemClass}>
                  <Icon name={adminSection.icon} className="size-4 shrink-0 text-muted" />
                  {link.label}
                </Link>
              ))}
            </div>
            <div role="separator" className="my-1 h-px bg-line" />
          </>
        )}
        <form action={signOut} onSubmit={clearPersistedFilters}>
          <button type="submit" role="menuitem" tabIndex={-1} className={itemClass}>
            <Icon name="logout" className="size-4 shrink-0 text-muted" />
            ออกจากระบบ
          </button>
        </form>
      </div>
    </>
  );
}
