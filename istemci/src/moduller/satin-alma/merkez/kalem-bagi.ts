import type { RequestItem } from "./tipler.ts";

// 2429: hizmet kaleminin parçası ve fason adımı kalemin altında ve teklif isteme metninde aynı biçimle yazılır. Ad ya da kod
// boşsa (silinmiş kart) kart numarası yazılır.
export function parcaMetni(it: RequestItem): string | null {
  const p = it.parca;
  if (!p) return null;
  const ad = [p.kod, p.ad].filter(Boolean).join(" ");
  return `Parça: ${ad || `kart ${p.no}`}`;
}
export function fasonMetni(it: RequestItem): string | null {
  const f = it.fason;
  if (!f) return null;
  const adim = [f.opNo === null ? "" : `Op ${f.opNo}`, f.adim ?? ""].filter(Boolean).join(" ");
  return `Fason: ${[f.emirNo, adim, f.firmaAdi].filter(Boolean).join(", ") || "iş emri bağlı"}`;
}
export const kalemBagMetinleri = (it: RequestItem): string[] => [parcaMetni(it), fasonMetni(it)].filter((x): x is string => x !== null);
// Tedarikçiye giden teklif isteme metni (kullanıcı 08:31Z): yalnız yapılacak işlem; fason firması ve iç emir no gitmez. Silinmiş
// kartın numarası tedarikçi için anlamsızdır, yazılmaz.
export function teklifMetniSatirlari(it: RequestItem): string[] {
  const out: string[] = [];
  const p = it.parca;
  const ad = p ? [p.kod, p.ad].filter(Boolean).join(" ") : "";
  if (ad) out.push(`Parça: ${ad}`);
  const f = it.fason;
  const islem = f ? [f.opNo === null ? "" : `Op ${f.opNo}`, f.adim ?? ""].filter(Boolean).join(" ") : "";
  if (islem) out.push(`İşlem: ${islem}`);
  return out;
}
