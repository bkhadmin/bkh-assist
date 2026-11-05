"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Icon } from "./icons";
import { adminSection, navItems, type NavItem, type NavLink, type NavSection } from "./nav-items";
import { ThemeSwitch } from "./theme-switch";
import { SIDEBAR_KEY } from "./ui-prefs";

const APP_NAME = "BKH Assist";

/* ---------- collapsed state: <html data-sidebar="collapsed"> + localStorage ---------- */

// The attribute drives the CSS (set before paint by the head script); React subscribes for aria and behaviour.
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";

function applyCollapsed(value: boolean) {
  const root = document.documentElement;
  if (value) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  listeners.forEach((l) => l());
}

function setCollapsed(value: boolean) {
  applyCollapsed(value);
  try {
    localStorage.setItem(SIDEBAR_KEY, value ? "1" : "0");
  } catch {}
}

const noopSubscribe = () => () => {};
const getModKey = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl");
const useModKey = () => useSyncExternalStore(noopSubscribe, getModKey, () => "Ctrl");

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select") !== null);

function isActive(href: string, pathname: string | null) {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/* ---------- shared styles ---------- */

const focusRing = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

// pl-[14px] + 1px border puts every 18px icon on the rail's centre line (x = 32px), expanded or collapsed,
// so icons never move while the width animates.
const itemBase = `group/tip flex h-8 w-full items-center gap-2.5 rounded-md border pl-[14px] pr-2.5 text-sm transition-colors ${focusRing}`;
const tones = {
  active: "border-accent-line bg-accent-soft font-medium text-accent-text",
  idle: "border-transparent text-foreground hover:bg-hover",
};
const iconClass = (active: boolean) =>
  `size-[18px] shrink-0 ${active ? "" : "text-muted group-hover/tip:text-foreground"}`;
const labelFade = "transition-opacity duration-150 collapsed:opacity-0 motion-reduce:transition-none";

/* ---------- tooltip (collapsed rail) ---------- */

// Tooltips are position: fixed so they escape the rail's overflow clipping; the anchor writes its position.
function trackTip(e: { currentTarget: HTMLElement }) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--tip-x", `${r.right + 8}px`);
  e.currentTarget.style.setProperty("--tip-y", `${r.top + r.height / 2}px`);
}

function Tip({ children, always = false }: { children: ReactNode; always?: boolean }) {
  const show = always
    ? "group-hover/tip:visible group-hover/tip:opacity-100 group-focus-visible/tip:visible group-focus-visible/tip:opacity-100"
    : "collapsed:group-hover/tip:visible collapsed:group-hover/tip:opacity-100 collapsed:group-focus-visible/tip:visible collapsed:group-focus-visible/tip:opacity-100";
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none invisible fixed top-[var(--tip-y)] left-[var(--tip-x)] z-50 -translate-y-1/2 rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-md transition-opacity delay-100 duration-150 ${show}`}
    >
      {children}
    </span>
  );
}

/* ---------- shell ---------- */

// `account` is pinned to the bottom of the sidebar (rail and mobile drawer), below the nav.
export function AppShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, () => false);
  const railId = useId();
  const drawerRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeDrawer = () => drawerRef.current?.close();

  // Dev Strict Mode remount strips attributes the head script set on <html>; restore before paint.
  useLayoutEffect(() => {
    try {
      applyCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {}
  }, []);

  // Ctrl/⌘+B toggles the rail, Ctrl/⌘+K focuses menu search. Desktop only; typing in fields is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key !== "b" && key !== "k") return;
      if (!matchMedia("(min-width: 48rem)").matches || document.querySelector("dialog[open]")) return;
      // Ctrl+B never fires from a text field; Ctrl+K is allowed from the menu search itself.
      if (isEditable(e.target) && (key === "b" || e.target !== searchRef.current)) return;
      e.preventDefault();
      if (key === "b") setCollapsed(!getCollapsed());
      else focusSearch(searchRef);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <a
        href="#main"
        className={`sr-only z-50 rounded-md bg-accent text-sm font-medium text-accent-fg shadow-lg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-4 focus:py-2 ${focusRing}`}
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>

      <div className="flex h-dvh">
        <aside id={railId} className="rail flex shrink-0 flex-col overflow-hidden max-md:hidden">
          <Sidebar
            collapsed={collapsed}
            searchRef={searchRef}
            headerAction={<RailToggle collapsed={collapsed} controls={railId} />}
            footer={account}
          />
        </aside>

        {/* Content panel floats on the canvas: hairline border, rounded top-left corner. */}
        <div className="mt-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-xl border-t border-l border-line bg-surface max-md:mt-0 max-md:rounded-none max-md:border-0">
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-8 max-md:px-3">
            <button
              type="button"
              className={`hidden size-9 place-items-center rounded-md text-muted hover:bg-hover hover:text-foreground max-md:grid ${focusRing}`}
              aria-label="เปิดเมนู"
              aria-haspopup="dialog"
              onClick={() => drawerRef.current?.showModal()}
            >
              <Icon name="menu" />
            </button>
            <span className="hidden font-semibold max-md:block">{APP_NAME}</span>
            <Suspense fallback={null}>
              <Breadcrumb />
            </Suspense>
            <div className="ml-auto">
              <ThemeSwitch />
            </div>
          </header>

          <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto px-8 py-7 outline-none max-md:px-4 max-md:py-5">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile drawer: native modal dialog gives Esc, focus trap, inert page and focus return. */}
      <dialog
        ref={drawerRef}
        aria-label="เมนู"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeDrawer();
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-72 max-w-[85vw] border-0 bg-background p-0 text-foreground shadow-xl transition-transform duration-200 ease-out backdrop:bg-black/40 starting:-translate-x-full motion-reduce:transition-none"
      >
        <div className="flex h-full flex-col">
          <Sidebar
            collapsed={false}
            onNavigate={closeDrawer}
            headerAction={
              <button
                type="button"
                className={`ml-auto grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-hover hover:text-foreground ${focusRing}`}
                aria-label="ปิดเมนู"
                onClick={closeDrawer}
              >
                <Icon name="close" className="size-[18px]" />
              </button>
            }
            footer={account}
          />
        </div>
      </dialog>
    </>
  );
}

function focusSearch(ref: RefObject<HTMLInputElement | null>) {
  setCollapsed(false);
  requestAnimationFrame(() => ref.current?.focus());
}

function RailToggle({ collapsed, controls }: { collapsed: boolean; controls: string }) {
  const mod = useModKey();
  const label = collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู";
  return (
    <button
      type="button"
      onClick={() => setCollapsed(!collapsed)}
      onMouseEnter={trackTip}
      onFocus={trackTip}
      aria-label={label}
      aria-expanded={!collapsed}
      aria-controls={controls}
      aria-keyshortcuts="Control+B Meta+B"
      className={`group/tip ml-auto grid size-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-hover hover:text-foreground ${focusRing}`}
    >
      <Icon name="panelClose" className="size-[18px] collapsed:hidden" />
      <Icon name="panelOpen" className="hidden size-[18px] collapsed:block" />
      <Tip always>
        {label}
        <span className="ml-2 opacity-70">{mod}+B</span>
      </Tip>
    </button>
  );
}

/* ---------- sidebar (desktop rail and mobile drawer) ---------- */

type SidebarProps = {
  collapsed: boolean;
  headerAction: ReactNode;
  footer?: ReactNode;
  onNavigate?: () => void;
  searchRef?: RefObject<HTMLInputElement | null>;
};

function Sidebar({ collapsed, headerAction, footer, onNavigate, searchRef }: SidebarProps) {
  const [query, setQuery] = useState("");
  const mod = useModKey();

  return (
    <>
      <div className="mt-2 flex h-14 shrink-0 items-center px-4">
        <Link
          href="/"
          onClick={onNavigate}
          className={`flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-md collapsed:invisible ${focusRing}`}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
            <Icon name="pulse" className="size-[18px]" />
          </span>
          <span className="truncate text-base font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
        {headerAction}
      </div>

      <div className="shrink-0 px-2 pb-3">
        <label className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface pr-1.5 pl-[14px] text-sm shadow-xs focus-within:ring-2 focus-within:ring-ring collapsed:hidden">
          <Icon name="search" className="size-4 shrink-0 text-muted" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            aria-label="ค้นหาเมนู"
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {searchRef && (
            <kbd className="shrink-0 rounded border border-line bg-background px-1.5 font-sans text-xs text-muted">
              {mod} K
            </kbd>
          )}
        </label>
        {searchRef && (
          <button
            type="button"
            onClick={() => focusSearch(searchRef)}
            onMouseEnter={trackTip}
            onFocus={trackTip}
            aria-label="ค้นหาเมนู"
            className={`${itemBase} ${tones.idle} hidden collapsed:flex`}
          >
            <Icon name="search" className={iconClass(false)} />
            <Tip>
              ค้นหาเมนู
              <span className="ml-2 opacity-70">{mod}+K</span>
            </Tip>
          </button>
        )}
      </div>

      <Suspense fallback={<NavList collapsed={collapsed} query={query} onNavigate={onNavigate} pathname={null} />}>
        <ActiveNavList collapsed={collapsed} query={query} onNavigate={onNavigate} />
      </Suspense>

      {footer && <div className="shrink-0 border-t border-line p-2">{footer}</div>}
    </>
  );
}

type NavProps = { collapsed: boolean; query: string; onNavigate?: () => void };

// usePathname may suspend under cacheComponents on routes with unknown dynamic params,
// so the active-state read sits in its own Suspense boundary.
function ActiveNavList(props: NavProps) {
  return <NavList {...props} pathname={usePathname()} />;
}

function filterItems(query: string): NavItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return navItems;
  return navItems.flatMap((item) => {
    if (item.label.toLowerCase().includes(q)) return [item];
    if (!("children" in item)) return [];
    const children = item.children.filter((c) => c.label.toLowerCase().includes(q));
    return children.length ? [{ ...item, children }] : [];
  });
}

function NavList({ collapsed, query, onNavigate, pathname }: NavProps & { pathname: string | null }) {
  const items = filterItems(query);
  return (
    <nav aria-label="เมนูหลัก" className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-6">
      {items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted">ไม่พบเมนูที่ตรงกับ “{query.trim()}”</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) =>
            "children" in item ? (
              <li key={item.label} className="pt-3">
                <Section
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                  forceOpen={query.trim() !== ""}
                  onNavigate={onNavigate}
                />
              </li>
            ) : (
              <li key={item.label}>
                <NavItemLink item={item} pathname={pathname} onNavigate={onNavigate} />
              </li>
            ),
          )}
        </ul>
      )}
    </nav>
  );
}

function NavItemLink({ item, pathname, onNavigate }: { item: NavLink; pathname: string | null; onNavigate?: () => void }) {
  const active = isActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      onMouseEnter={trackTip}
      onFocus={trackTip}
      className={`${itemBase} ${active ? tones.active : tones.idle}`}
    >
      <Icon name={item.icon} className={iconClass(active)} />
      <span className={`min-w-0 flex-1 truncate ${labelFade}`}>{item.label}</span>
      <Tip>{item.label}</Tip>
    </Link>
  );
}

function SubLink({ href, label, pathname, onClick }: { href: string; label: string; pathname: string | null; onClick?: () => void }) {
  const active = isActive(href, pathname);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex h-8 items-center rounded-md border px-3 text-sm transition-colors ${focusRing} ${active ? tones.active : tones.idle}`}
    >
      <span className="truncate">{label}</span>
    </Link>
  );
}

// Expanded: a collapsible section (whole row toggles, chevron rotates, height animates).
// Collapsed rail: the icon opens a flyout on hover or focus; Esc closes it, ArrowRight enters it.
function Section({
  item,
  collapsed,
  pathname,
  forceOpen,
  onNavigate,
}: {
  item: NavSection;
  collapsed: boolean;
  pathname: string | null;
  forceOpen: boolean;
  onNavigate?: () => void;
}) {
  const hasActive = item.children.some((c) => isActive(c.href, pathname));
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = forceOpen || (userOpen ?? hasActive);
  const [flyTop, setFlyTop] = useState<number | null>(null);
  const flyOpen = collapsed && flyTop !== null;
  const panelId = useId();
  const flyId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const skipFocusOpen = useRef(false);

  const showFly = () => {
    if (collapsed && triggerRef.current) setFlyTop(triggerRef.current.getBoundingClientRect().top);
  };
  const hideFly = () => setFlyTop(null);

  return (
    <div
      onMouseEnter={showFly}
      onMouseLeave={hideFly}
      onFocus={() => {
        if (skipFocusOpen.current) skipFocusOpen.current = false;
        else showFly();
      }}
      onBlur={(e: FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget)) hideFly();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && flyOpen) {
          e.stopPropagation();
          hideFly();
          skipFocusOpen.current = true;
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={collapsed ? flyOpen : open}
        aria-controls={collapsed ? (flyOpen ? flyId : undefined) : panelId}
        onClick={() => {
          if (!collapsed) setUserOpen(!open);
          else if (flyOpen) hideFly();
          else showFly();
        }}
        onKeyDown={(e) => {
          if (collapsed && e.key === "ArrowRight") {
            e.preventDefault();
            showFly();
            requestAnimationFrame(() => flyRef.current?.querySelector("a")?.focus());
          }
        }}
        className={`${itemBase} ${collapsed && hasActive ? tones.active : "border-transparent text-muted hover:bg-hover hover:text-foreground"}`}
      >
        <Icon name={item.icon} className="size-[18px] shrink-0" />
        <span className={`truncate text-xs font-semibold ${labelFade}`}>{item.label}</span>
        <Icon
          name="chevron"
          className={`size-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-90" : ""} ${labelFade}`}
        />
      </button>

      <div
        id={panelId}
        inert={!open || collapsed}
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        } collapsed:grid-rows-[0fr]`}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Guide line sits under the section icon's centre. */}
          <ul className="mt-0.5 ml-[23px] space-y-0.5 border-l border-line py-0.5 pl-2">
            {item.children.map((child) => (
              <li key={child.href}>
                <SubLink href={child.href} label={child.label} pathname={pathname} onClick={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {flyOpen && (
        // pl-3 is a transparent bridge from the rail icon to the card, so the pointer can cross without closing it.
        <div ref={flyRef} id={flyId} style={{ top: flyTop }} className="fixed left-14 z-40 pl-3">
          <div role="group" aria-label={item.label} className="min-w-52 rounded-lg border border-line bg-surface p-1 shadow-lg">
            <p className="px-3 pt-1.5 pb-1 text-xs font-semibold text-muted">{item.label}</p>
            <ul className="space-y-0.5">
              {item.children.map((child) => (
                <li key={child.href}>
                  <SubLink href={child.href} label={child.label} pathname={pathname} onClick={hideFly} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- topbar breadcrumb ---------- */

function trailFor(pathname: string): string[] {
  for (const item of [...navItems, adminSection]) {
    if (!("children" in item)) {
      if (isActive(item.href, pathname)) return [item.label];
      continue;
    }
    const child = item.children.find((c) => isActive(c.href, pathname));
    if (child) return [item.label, child.label];
  }
  return [];
}

function Breadcrumb() {
  const trail = trailFor(usePathname());
  if (trail.length === 0) return null;
  return (
    <nav aria-label="ตำแหน่งปัจจุบัน" className="min-w-0 max-md:hidden">
      <ol className="flex items-center gap-1.5 text-sm text-muted">
        {trail.map((label, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <Icon name="chevron" className="size-3.5 shrink-0" />}
              <span aria-current={last ? "page" : undefined} className={last ? "truncate font-medium text-foreground" : "truncate"}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
