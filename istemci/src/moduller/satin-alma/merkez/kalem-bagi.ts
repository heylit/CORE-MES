import type { PurchaseRequest, RequestItem } from "./tipler.ts";
import { esc } from "./util.ts";

// 2429: hizmet kaleminin parçası ve fason adımı kalemin altında yazılır; etiket Taleplerim formundaki sözcüktür (2873). Ad ya da
// kod boşsa (silinmiş kart) kart numarası yazılır.
const parcaAdi = (p: NonNullable<RequestItem["parca"]>): string => [p.kod, p.ad].filter(Boolean).join(" ") || `kart ${p.no}`;
export function parcaMetni(it: RequestItem): string | null {
  return it.parca ? `Uygulanacak malzeme: ${parcaAdi(it.parca)}` : null;
}
// 2873: listede ve panoda talebe girmeden görünür; satır kısa kalsın diye ilk malzeme ve kalan farklı malzeme sayısı.
export function uygulananOzeti(r: PurchaseRequest): string | null {
  const nolar = [...new Map((r.items || []).flatMap((it) => (it.parca ? [[it.parca.no, it.parca] as const] : []))).values()];
  if (!nolar.length) return null;
  return `Uygulanacak: ${parcaAdi(nolar[0]!)}${nolar.length > 1 ? ` +${nolar.length - 1}` : ""}`;
}
export function uygulananSatiri(r: PurchaseRequest, cls: string): string {
  const t = uygulananOzeti(r);
  return t ? `<span class="${cls}" data-sa-uygulanan="">${esc(t)}</span>` : "";
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
