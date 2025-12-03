import { Search, LayoutDashboard, Table, FileText, Users } from "lucide-react";
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
  { title: "Competitors", url: "/competitors", icon: Users, preserveCategory: true },
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
    <Sidebar>
      <SidebarHeader className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <Search className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-sidebar-foreground">Noodle Search</h1>
            <p className="text-xs text-sidebar-foreground/60">Market Intelligence</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="p-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={getUrl(item)}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.title}</span>
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
