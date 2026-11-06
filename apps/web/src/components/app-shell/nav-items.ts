import type { IconName } from "./icons";

/*
 * Sidebar menu. Add your module here:
 *   - a single page:  { label: "ชื่อเมนู", href: "/{module}", icon: "chart" }
 *   - a section with sub-pages (collapsible; a flyout when the sidebar is collapsed):
 *       { label: "ชื่อหมวด", icon: "folder", children: [{ label: "...", href: "/{module}" }] }
 * Icon names come from icons.tsx (add a new SVG there if none fits).
 * Admin pages (/admin/*) are not listed here: they live in the profile menu (profile-menu.tsx), shown to admins only.
 */

export type NavSubLink = { label: string; href: string };
export type NavLink = NavSubLink & { icon: IconName };
export type NavSection = { label: string; icon: IconName; children: NavSubLink[] };
export type NavItem = NavLink | NavSection;

export const navItems: NavItem[] = [{ label: "ภาพรวม", href: "/", icon: "home" }];

// Admin pages: shown in the profile menu to role "admin" only (not in the sidebar or its search), and used by the
// topbar breadcrumb. Access itself is enforced by proxy.ts and the admin layout, not by hiding the link.
export const adminSection: NavSection = {
  label: "ผู้ดูแลระบบ",
  icon: "shield",
  children: [
    { label: "Module และกฎ", href: "/admin/modules" },
    { label: "เครื่องที่ติดตั้ง agent", href: "/admin/machines" },
    { label: "โอกาสเพิ่มรายได้", href: "/admin/opportunities" },
    { label: "RLU (แล็บ)", href: "/admin/rlu" },
  ],
};
