import fs from "fs";
import path from "path";

const NEWS_ITEMS_FILE = path.join(
  process.cwd(),
  "data",
  "news-items.json"
);

export interface NewsItem {
  id: string;
  sourceId: string;
  sourceLabel: string;
  title: string;
  url: string;
  info?: string;
  hover?: string;
  reflection: string;
  createdAt: string;
}

interface NewsItemsFile {
  items?: NewsItem[];
  updatedAt?: string;
}

function readAll(): NewsItem[] {
  try {
    if (!fs.existsSync(NEWS_ITEMS_FILE)) return [];
    const raw = fs.readFileSync(NEWS_ITEMS_FILE, "utf8");
    const data: NewsItemsFile = JSON.parse(raw);
    if (!Array.isArray(data.items)) return [];
    return data.items;
  } catch {
    return [];
  }
}

export function getAllNewsItems(): NewsItem[] {
  return readAll()
    .filter((it) => it && it.id && it.url && it.title)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getNewsItemById(id: string): NewsItem | null {
  return readAll().find((it) => it.id === id) || null;
}
