import { Search, LayoutDashboard, Table, FileText, LucideIcon } from "lucide-react";
import { NavLink as RouterNavLink, useLocation } from "react-router-dom";
import { useCategoryContext } from "@/contexts/CategoryContext";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

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
  { title: "Strategy Brief", url: "/strategy", icon: FileText, preserveCategory: true },
];

interface NavItemProps {
  item: MenuItem;
  isActive: boolean;
  href: string;
}

function NavItem({ item, isActive, href }: NavItemProps) {
  const Icon = item.icon;
  
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild>
        <RouterNavLink
          to={href}
          end={item.url === "/"}
          className={cn(
            "group relative flex items-center gap-3 px-4 py-3.5 rounded-[15px] text-sidebar-foreground/80 transition-all duration-300 overflow-hidden",
            "hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            isActive && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground shadow-[0_4px_14px_rgba(255,255,255,0.25)]"
          )}
        >
          {/* Hover background effect */}
          <span className={cn(
            "absolute inset-0 bg-sidebar-accent/30 rounded-[15px] scale-x-0 origin-left transition-transform duration-300",
            "group-hover:scale-x-100",
            isActive && "hidden"
          )} />
          
          {/* Active indicator bar */}
          {isActive && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-sidebar-primary-foreground rounded-r-full animate-slide-indicator" />
          )}
          
          {/* Icon with bounce animation */}
          <span className={cn(
            "relative z-10 transition-transform duration-300",
            "group-hover:animate-icon-bounce",
            isActive && "group-hover:animate-none"
          )}>
            <Icon className="w-5 h-5" />
          </span>
          
          {/* Text */}
          <span className={cn(
            "relative z-10 font-semibold transition-transform duration-200",
            "group-hover:translate-x-0.5",
            isActive && "group-hover:translate-x-0"
          )}>
            {item.title}
          </span>
          
          {/* Hover glow effect for active items */}
          {isActive && (
            <span className="absolute inset-0 bg-white/5 rounded-[15px] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          )}
        </RouterNavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

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
    if (item.url === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(item.url);
  };

  return (
    <Sidebar className="rounded-r-[30px] overflow-hidden">
      <SidebarHeader className="p-6 border-b border-sidebar-border/30">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className={cn(
            "w-12 h-12 rounded-2xl bg-sidebar-primary flex items-center justify-center shadow-[0_4px_14px_rgba(255,255,255,0.25)]",
            "transition-all duration-300 group-hover:scale-105 group-hover:shadow-[0_6px_20px_rgba(255,255,255,0.35)]"
          )}>
            <Search className="w-6 h-6 text-sidebar-primary-foreground transition-transform duration-300 group-hover:rotate-12" />
          </div>
          <div className="transition-transform duration-200 group-hover:translate-x-0.5">
            <h1 className="text-lg font-bold text-sidebar-foreground">Noodle Search</h1>
            <p className="text-xs text-sidebar-foreground/70">Market Intelligence</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-5">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {menuItems.map((item) => (
                <NavItem
                  key={item.title}
                  item={item}
                  isActive={isActive(item)}
                  href={getUrl(item)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
