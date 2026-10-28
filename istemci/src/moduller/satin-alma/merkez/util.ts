import { formulKoru } from "../../../ortak/veri/csv.ts";
import { yeniIstekKimligi } from "../../../ortak/veri/istek-kimligi.ts";

/** Form öğelerinin ortak alanlarına (value, checked, files, options…) tek tipte erişmek için */
export type FormEl = HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;

export const $ = <T extends Element = FormEl>(s: string, r: ParentNode = document): T => r.querySelector(s) as T;
export const $$ = <T extends Element = FormEl>(s: string, r: ParentNode = document): T[] => Array.from(r.querySelectorAll<T>(s));

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// Düz http ile açılan kurum içi sunucuda crypto.randomUUID yoktur (S-03); ortak üretici getRandomValues'a düşer.
export const uid = (): string => yeniIstekKimligi();
export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const norm = (s: unknown): string => String(s ?? "").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
export const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);
export const isNum = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/** Türkçe (1.234,56) ve İngilizce (1,234.56) yazımı okur; "1.250" binlik ayraç sayılır. */
export function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|₺|TL|TRY|USD|EUR|GBP|\$|€|£|%/gi, "");
  if (!s) return null;
  const hasC = s.includes(","), hasD = s.includes(".");
  if (hasC && hasD) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasC) {
    s = s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasD) {
    const p = s.split(".");
    if (p.length > 2 || (p[1]!.length === 3 && p[0] !== "0" && p[0] !== "" && p[0] !== "-")) s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}

const nf2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nf0 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
export const nf1 = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
export const nfx = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 });
export { nf2 };
export const SYM: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€", GBP: "£" };

export const money = (n: unknown, cur = "TRY", dec = 2): string => (isNum(n) ? (dec ? nf2 : nf0).format(n) + " " + (SYM[cur] ?? cur) : "–");
export function short(n: unknown): string {
  if (!isNum(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e6) return nf1.format(n / 1e6) + " mn ₺";
  if (a >= 1e4) return nf0.format(n / 1e3) + " bin ₺";
  return nf0.format(n) + " ₺";
}
export const numIn = (n: unknown): string => (isNum(n) ? nfx.format(n) : "");
export const pct = (n: unknown, d = 0): string => (isNum(n) ? "%" + (d ? nf1 : nf0).format(n) : "–");
export function deltaHTML(p: number | null | undefined): string {
  if (!isNum(p)) return "";
  const c = p > 1 ? "up" : p < -1 ? "down" : "flat";
  return `<span class="delta ${c}">${p > 0 ? "+" : ""}${nf1.format(p)}%</span>`;
}

const pad = (n: number): string => String(n).padStart(2, "0");
export { pad };
export const dstr = (d: Date): string => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const todayStr = (): string => dstr(new Date());
export function addDays(s: string, n: number): string { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + Math.round(n)); return dstr(d); }
export const dayDiff = (a: string, b: string): number => Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 864e5);
export function fmtDate(s: string | null | undefined): string { if (!s) return "–"; const [y, m, d] = String(s).slice(0, 10).split("-"); return `${d}.${m}.${y}`; }
export const tsDate = (ts: number | undefined): string => (ts ? dstr(new Date(ts)) : "");
export function fmtTs(ts: number | undefined): string {
  if (!ts) return "–";
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function toCSV(rows: (string | number)[][]): string {
  // Formül gibi başlayan metin ' ile başlar; tedarikçi adı dışarıdan (portal) gelebilir.
  const cell = (v: unknown) => { const s = typeof v === "string" ? formulKoru(v, { sayiSerbest: true }) : String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "\ufeff" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

// TMI: dinleyiciler sayfanın tamamına bağlıdır; olay Satın Alma Merkezi'nin bağlandığı kökte ([data-sa-merkez]) değilse
// görmezden gelinir. Böylece TMI'nin öteki sayfalarında (depo ekranı dahil) tıklama, kısayol ve yazma onu tetiklemez.
export const kokIcinde = (e: Event): boolean => e.target instanceof Element && e.target.closest("[data-sa-merkez]") !== null;

