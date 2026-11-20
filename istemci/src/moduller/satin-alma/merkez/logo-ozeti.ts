import type { SiparisLogoOzeti, SiparisLogoOzetiCevabi } from "#paylasilan/sozlesme/logo.ts";
import { api } from "../../../ortak/veri/api.ts";

// 3384 a: siparişin Logo'daki irsaliye ve fatura özeti (yalnız okuma). Liste ve sipariş takibi aynı metni kullanır.
// Özet "Logo irsaliyelerini gör" yetkisiyle gelir; yetkisiz kişide hiç sorulmaz, okunamazsa ekran Logo özetini göstermez.

// Sunucunun tek istekte aldığı en çok sipariş (SIPARIS_LOGO_OZETI_SINIRI); sözleşme dosyası zod taşıdığı için değer olarak ithal edilmez.
const PARCA = 200;

export type LogoOzetiOkumasi = SiparisLogoOzetiCevabi["okuma"];
export interface LogoOzetleri { okuma: LogoOzetiOkumasi; siparisler: Map<string, SiparisLogoOzeti> }

export async function logoOzetleriniOku(nolar: readonly string[]): Promise<LogoOzetleri> {
  const tekil = [...new Set(nolar.filter((n) => n.trim() !== ""))];
  const parcalar: string[][] = [];
  for (let i = 0; i < tekil.length; i += PARCA) parcalar.push(tekil.slice(i, i + PARCA));
  if (parcalar.length === 0) parcalar.push([]);
  const cevaplar = await Promise.all(parcalar.map((p) => (p.length === 0
    ? Promise.resolve<SiparisLogoOzetiCevabi | null>(null)
    : api.get<SiparisLogoOzetiCevabi>(`/logo/satin-alma-siparisleri/ozet?nolar=${encodeURIComponent(p.join(","))}`))));
  const ilk = cevaplar.find((c) => c !== null);
  return {
    okuma: ilk?.okuma ?? { irsaliye: false, fatura: false, sonOkuma: null },
    siparisler: new Map(cevaplar.flatMap((c) => c?.siparisler ?? []).map((o) => [o.siparisNo, o])),
  };
}

// Logo'ya bağlı kalemler (gitmemiş kalem sayılmaz). İrsaliye okuması kapalıysa ya da hiçbir kalem okunamadıysa irsaliye satırı yok.
export function irsaliyeOzeti(o: SiparisLogoOzeti, okuma: LogoOzetiOkumasi): { metin: string; fark: boolean } | null {
  if (!okuma.irsaliye || !o.logoda) return null;
  const bagli = o.kalemler.filter((k) => k.durum !== "logo-bagi-yok");
  if (bagli.length === 0 || bagli.every((k) => k.durum === "okunmadi")) return null;
  const birim = bagli.filter((k) => k.durum === "birim").length;
  const ekler = [o.farkliKalem > 0 ? `${o.farkliKalem} kalemde fark` : null, birim > 0 ? `${birim} kalemde birim tutmuyor` : null].filter((x): x is string => x !== null);
  // Hiç irsaliye yoksa ve fark da yoksa "0/n kalem" yerine bekleniyor yazılır (3384 Arayüz bakışı).
  const bas = o.irsaliyeliKalem === 0 && ekler.length === 0 ? "İrsaliye bekleniyor" : `İrsaliye ${o.irsaliyeliKalem}/${bagli.length} kalem`;
  return { metin: [bas, ...ekler].join(" · "), fark: o.farkliKalem > 0 };
}

// Fatura numarası okunmadıysa (okuma kapalı ya da sipariş henüz okunmadı) "Fatura yok" yazılmaz.
export function faturaOzeti(o: SiparisLogoOzeti): string | null {
  if (!o.logoda || o.faturalar === null) return null;
  if (o.faturalar.length === 0) return "Fatura yok";
  return `Fatura ${o.faturalar[0]}${o.faturalar.length > 1 ? ` +${o.faturalar.length - 1}` : ""}`;
}

// 3472 b: Logo'da iptal edilmiş fatura ayrı rozetle yazılır; sipariş onunla faturalandı sayılmaz.
export function iptalFaturaOzeti(o: SiparisLogoOzeti): string | null {
  if (!o.logoda || o.iptalFaturalar.length === 0) return null;
  return `Fatura ${o.iptalFaturalar[0]}${o.iptalFaturalar.length > 1 ? ` +${o.iptalFaturalar.length - 1}` : ""} iptal`;
}

const sade = (d: string): string => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 4 }).format(Number(d));
// Fark Logo eksi CORE'dur; kullanıcıya yönüyle yazılır.
export function farkMetni(fark: string, birim: string): string {
  const n = Number(fark);
  return `Logo'da ${sade(String(Math.abs(n)))} ${birim} ${n < 0 ? "az" : "fazla"}`;
}
export const miktarMetni = (m: string | null, birim: string | null): string => (m === null ? "–" : `${sade(m)}${birim ? ` ${birim}` : ""}`);
