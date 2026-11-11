import { COMMITTED, stLabel } from "./constants.ts";
import type { PurchaseRequest } from "./tipler.ts";

// 2876 (2871-1 b): güncelleme grubunun öteki talepleri, Taleplerim'deki satırla aynı dille ("ilk talep", durum küçük harfle).
export function grupMetni(r: PurchaseRequest): string {
  const grup = r.guncellemeGrubu ?? [];
  const otekiler = grup.filter((x) => x.id !== r.id);
  if (!otekiler.length) return "";
  const kok = grup.find((x) => x.kok)?.id === r.id;
  return `${kok ? "Güncellemeleri" : "Güncelleme grubu"}: ${otekiler.map((x) => `${x.no}${x.kok ? " (ilk talep)" : ""} ${stLabel(x.status).toLocaleLowerCase("tr-TR")}`).join(", ")}`;
}

// 2876 (Maliyet N1): gruptaki öteki talep siparişte ya da teslim alınmışsa bu talebin iptali geri alınırsa ikinci alım olabilir (sunucu kuralı ikinciAlimRiski ile aynı).
export function ikinciAlimRiski(r: PurchaseRequest): string[] {
  return (r.guncellemeGrubu ?? []).filter((x) => x.id !== r.id && COMMITTED.includes(x.status)).map((x) => x.no);
}

export function ikinciAlimUyarisi(r: PurchaseRequest): string {
  const nolar = ikinciAlimRiski(r);
  return nolar.length ? `Güncelleme grubunda ${nolar.join(", ")} için sipariş verildi; iptal geri alınırsa aynı ihtiyaç için ikinci alım olabilir.` : "";
}
