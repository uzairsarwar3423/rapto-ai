import { cn } from "@/lib/utils";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function SidebarNav({ children, className, ...props }: SidebarNavProps) {
  return (
    <nav
      className={cn("flex flex-col gap-4 w-full", className)}
      {...props}
    >
      {children}
    </nav>
  );
}
