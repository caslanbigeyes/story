export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://gghh.xyz";
export const SITE_NAME = "My Blog";
export const SITE_DESCRIPTION = "基于 Next.js + Markdown 的个人博客";
export const SITE_AUTHOR = "My Blog";
export const SITE_LANG = "zh-CN";
export const SITE_TIME_ZONE = "Asia/Shanghai";

export function formatZhDate(
  date: string,
  variant: "long" | "short" = "long"
): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SITE_TIME_ZONE,
    year: "numeric",
    month: variant === "long" ? "long" : "short",
    day: "numeric",
  }).format(new Date(date));
}
