import type { PurchaseRequest, RequestItem } from "./tipler.ts";
import { esc } from "./util.ts";
import "../islenen-malzeme.css";
import { revYaz } from "../rev-yaz.ts";
export { revYaz };

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
  return `Uygulanacak malzeme: ${parcaAdi(nolar[0]!)}${nolar.length > 1 ? ` +${nolar.length - 1}` : ""}`;
}
const islemMetni = (f: RequestItem["fason"]): string | null => (f ? [f.opNo === null ? "" : `Op ${f.opNo}`, f.adim ?? ""].filter(Boolean).join(" ") || null : null);
// 3712: tedarikçiye giden alt küme. İç alan (emir no, firma, iş emri) tipte yoktur; üretilemez.
export interface DisIslenenMalzeme { ad: string; kod: string | null; rev: string; adet: string | null; islem: string | null }
export function disIslenenMalzeme(it: RequestItem, revizyon: string | null | undefined = it.parca?.revizyon): DisIslenenMalzeme | null {
  const p = it.parca;
  if (!p) return null;
  return {
    ad: p.ad ?? "", kod: p.kod, rev: revYaz(revizyon), adet: it.qty === null ? null : `${numMetni(it.qty)} ${it.unit}`.trim(), islem: islemMetni(it.fason),
  };
}
const numMetni = (n: number): string => String(n).replace(".", ",");
// 3712: iç gösterim (karar, sipariş): dış alt küme ve rota adımı (emir no · Op n).
export function icIslenenMalzeme(it: RequestItem): (DisIslenenMalzeme & { adim: string | null }) | null {
  const d = disIslenenMalzeme(it);
  if (!d) return null;
  const f = it.fason;
  return { ...d, adim: f ? [f.emirNo, islemMetni(f)].filter(Boolean).join(" · ") || null : null };
}
// 3712 (karar: her yerde aynı çerçeveli blok). Aynı veriden iki hâl: ic karar ve sipariş ekranı, dış teklif formu ve metni.
export function islenenMalzemeBlogu(it: RequestItem, ic = true): string {
  const m = ic ? icIslenenMalzeme(it) : disIslenenMalzeme(it);
  if (!m) return "";
  // İç gösterimde silinmiş kart numarasıyla; dış gösterimde (tedarikçi) iç numara yazılmaz: kod, o da yoksa "Adsız parça".
  const ad = m.ad || (ic ? (it.parca ? `kart ${it.parca.no}` : "") : (m.kod ? "" : "Adsız parça"));
  const adim = ic ? (m as { adim?: string | null }).adim ?? null : null;
  const bil = [m.rev, m.adet, adim ?? m.islem].filter(Boolean).map((x) => `<span>${esc(x as string)}</span>`).join("");
  return `<div class="sa-islenen" data-sa-uygulanan=""><span class="sa-islenen-etk">İşlenen malzeme</span>${ad ? `<b>${esc(ad)}</b>${m.kod ? ` <span class="sub">${esc(m.kod)}</span>` : ""}` : `<b>${esc(m.kod ?? "")}</b>`}${bil ? `<span class="sa-islenen-bil">${bil}</span>` : ""}</div>`;
}
// 2875: karşılaştırmada kalemin alt satırı, sipariş bölümünde kalem adının yanında.
export function parcaAltSatiri(it: RequestItem): string {
  return islenenMalzemeBlogu(it);
}
export const kalemAdiParcayla = (it: RequestItem): string => (it.parca ? `${it.name} (${parcaAdi(it.parca)})` : it.name);
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
// 2881 (karar 2879 a): parçanın revizyonu varsa "Rev X"; teklifte o anki yürürlükteki (varsayılan), siparişte sipariş anında sabitlenen
// (çağıran verir; sabitlenmemişse boş geçer, o anki yazılmaz).
export function teklifMetniSatirlari(it: RequestItem, revizyon: string | null | undefined = it.parca?.revizyon): string[] {
  const out: string[] = [];
  const p = it.parca;
  const ad = p ? [p.kod, p.ad].filter(Boolean).join(" ") : "";
  const rev = revizyon?.trim();
  if (ad) out.push(`Parça: ${ad}${rev ? ` ${revYaz(rev)}` : ""}`);
  const f = it.fason;
  const islem = f ? [f.opNo === null ? "" : `Op ${f.opNo}`, f.adim ?? ""].filter(Boolean).join(" ") : "";
  if (islem) out.push(`İşlem: ${islem}`);
  return out;
}
