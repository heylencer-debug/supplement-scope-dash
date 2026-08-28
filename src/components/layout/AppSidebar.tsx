import { Search, LayoutDashboard, Table, Building2, Package, LucideIcon } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { LibraryRow } from "@/components/library/LibraryModalShell";

/**
 * Noodle Takeout page rail (see takeout-design-spec.md section 1 +
 * ~/getnoodle's LibraryModalShell.tsx, the canonical distillation of
 * TakeoutModal's anatomy — src/components/library/LibraryModalShell.tsx in
 * this repo is a verbatim port of that file, kept byte-faithful for a future
 * Noodle-subapp merge).
 *
 * This component reuses the SAME class recipe and the SAME `LibraryRow` row
 * primitive as the ported shell, but as plain page markup instead of inside
 * a Radix Dialog — Dovive is a routed multi-page SPA, not a dialog launched
 * from a host app, so wrapping every route in a focus-trapped modal isn't
 * viable. `.dark brand-iris-surface` rail: brand plate on a `bg-black/45`
 * scrim + a full-height `bg-black/60 backdrop-blur-xl` glass panel, exactly
 * as the shell's `railBody`.
 */

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  preserveCategory: boolean;
}

const menuItems: MenuItem[] = [
  { title: "New Analysis", url: "/", icon: Search, preserveCategory: false },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, preserveCategory: true },
  { title: "Product Explorer", url: "/products", icon: Table, preserveCategory: true },
  { title: "Packaging", url: "/packaging", icon: Package, preserveCategory: true },
  { title: "Manufacturer Portal", url: "/manufacturer-portal", icon: Building2, preserveCategory: false },
];

export function AppSidebar() {
  const { categoryName } = useCategoryContext();
  const location = useLocation();

  const getUrl = (item: MenuItem) => {
    if (item.preserveCategory && categoryName) {
      return `${item.url}?category=${encodeURIComponent(categoryName)}`;
    }
    return item.url;
  };

  const isActive = (item: MenuItem) => {
    const pathname = location.pathname;
    if (item.url === "/") return pathname === "/";
    return pathname.startsWith(item.url);
  };

  return (
    <aside className="dark brand-iris-surface w-[300px] shrink-0 text-foreground hidden md:flex flex-col p-3.5 gap-3">
      {/* BRAND PLATE — opaque ink tile on a bg-black/45 scrim, same
          construction as the shell's railBody brand row. */}
      <div className="shrink-0 flex items-center gap-3 rounded-xl bg-black/45 px-3 py-2.5">
        <span className="inline-flex items-center justify-center h-11 w-11 rounded-lg bg-brand-ink border border-brand-smoke/20 text-brand-smoke shrink-0">
          <Search className="w-5 h-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight leading-tight text-brand-smoke truncate">
            Dovive Scout
          </p>
          <p className="text-xs text-brand-smoke/75 leading-snug truncate">
            Supplement Intelligence
          </p>
        </div>
      </div>

      {/* THE GLASS PANEL — full height, nav rows live here. */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-white/10 bg-black/60 backdrop-blur-xl overflow-hidden p-2.5 gap-1">
        <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-smoke/50">
          Navigate
        </p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <LibraryRow key={item.title} selected={active} title={item.title}>
              <RouterNavLink to={getUrl(item)} end={item.url === "/"} className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 shrink-0 text-brand-smoke/85" aria-hidden />
                <span className="text-[13px] font-medium truncate text-brand-smoke/95">{item.title}</span>
              </RouterNavLink>
            </LibraryRow>
          );
        })}
      </div>
    </aside>
  );
}
