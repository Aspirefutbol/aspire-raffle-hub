import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export function WorkflowPanel({
  id,
  title,
  description,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div id={id} className={cn("scroll-mt-4", className)}>
      <Card className="overflow-hidden border-brand-200 ring-1 ring-brand-100">
        <CardHeader
          className="border-brand-100 bg-brand-50"
          title={
            <span className="flex items-center gap-2 text-[0.95rem]">
              {icon && <span className="text-brand-700">{icon}</span>}
              {title}
            </span>
          }
          description={description}
          action={action}
        />
        <CardBody className={bodyClassName}>{children}</CardBody>
      </Card>
    </div>
  );
}
