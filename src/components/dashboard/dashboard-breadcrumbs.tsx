"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDashboardBreadcrumbs } from "@/lib/dashboard/nav-config";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export function DashboardBreadcrumbs() {
  const pathname = usePathname() ?? "/dashboard";
  const items = getDashboardBreadcrumbs(pathname);

  if (items.length <= 1) {
    return null;
  }

  return (
    <Breadcrumb className="hidden sm:block">
      <BreadcrumbList>
        {items.map((crumb, i) => (
          <span key={crumb.href} className="contents">
            {i > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem>
              {i === items.length - 1 ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink
                  render={<Link href={crumb.href} />}
                  className="cursor-pointer"
                >
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
