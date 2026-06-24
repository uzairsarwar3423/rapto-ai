import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto max-w-[1400px] px-6 py-5 w-full", className)}
      {...props}
    >
      {children}
    </div>
  );
}
