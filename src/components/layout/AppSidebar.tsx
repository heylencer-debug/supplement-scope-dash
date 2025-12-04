import { Search, LayoutDashboard, Table, FileText } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useCategoryContext } from "@/contexts/CategoryContext";
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

const menuItems = [
  { title: "New Analysis", url: "/", icon: Search, preserveCategory: false },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, preserveCategory: true },
  { title: "Product Explorer", url: "/products", icon: Table, preserveCategory: true },
  { title: "Strategy Brief", url: "/strategy", icon: FileText, preserveCategory: true },
];

export function AppSidebar() {
  const { categoryName } = useCategoryContext();

  const getUrl = (item: typeof menuItems[0]) => {
    if (item.preserveCategory && categoryName) {
      return `${item.url}?category=${encodeURIComponent(categoryName)}`;
    }
    return item.url;
  };

  return (
    <Sidebar className="rounded-r-[30px] overflow-hidden">
      <SidebarHeader className="p-6 border-b border-sidebar-border/30">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-sidebar-primary flex items-center justify-center shadow-[0_4px_14px_rgba(255,255,255,0.25)]">
            <Search className="w-6 h-6 text-sidebar-primary-foreground" />
          </div>
          <div>
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
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={getUrl(item)}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-4 py-3.5 rounded-[15px] text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all duration-200"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground shadow-[0_4px_14px_rgba(255,255,255,0.25)]"
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-semibold">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
