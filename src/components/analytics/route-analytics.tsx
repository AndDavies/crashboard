"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { trackPageView } from "@/lib/analytics/events";

export function RouteAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const search = searchParams.toString();
    const path = search ? `${pathname}?${search}` : pathname;
    trackPageView(path);
  }, [pathname, searchParams]);

  return null;
}

