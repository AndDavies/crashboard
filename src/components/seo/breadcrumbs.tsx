import Link from "next/link";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { StructuredData } from "@/components/seo/structured-data";
import { absoluteSiteUrl } from "@/lib/seo/metadata";

export type SeoBreadcrumbItem = {
  label: string;
  href: string;
};

export function SeoBreadcrumbs({
  items,
  compactCurrent = false,
}: {
  items: SeoBreadcrumbItem[];
  compactCurrent?: boolean;
}) {
  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.label,
            item: absoluteSiteUrl(item.href),
          })),
        }}
      />
      <Breadcrumb className="mb-8">
        <BreadcrumbList>
          {items.map((item, index) => {
            const isCurrent = index === items.length - 1;
            return (
              <Fragment key={`${item.href}-${item.label}`}>
                <BreadcrumbItem>
                  {isCurrent ? (
                    <BreadcrumbPage
                      className={compactCurrent
                        ? "max-w-[48vw] truncate whitespace-nowrap sm:max-w-[32rem]"
                        : "max-w-[60vw] break-words whitespace-normal sm:max-w-none"}
                      title={compactCurrent ? item.label : undefined}
                    >
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={item.href} />}>
                      {item.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isCurrent ? <BreadcrumbSeparator /> : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}
