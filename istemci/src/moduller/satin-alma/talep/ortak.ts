import type { SatinAlmaUclari, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { MALZEMELER_IKINCI_MENU } from '#paylasilan/sayfalar/malzemeler.ts';
import type { RozetTonu } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { ucCagrisi } from '../../../ortak/veri/uc-cagrisi.ts';

export const cagri = ucCagrisi<SatinAlmaUclari>();
export const SURE = { zamanAsimiMs: 15_000 };
export const anahtarlar = {
  taleplerim: (sinir: number) => ['satin-alma', 'taleplerim', sinir] as const,
  taleplerimHepsi: ['satin-alma', 'taleplerim'] as const,
  onTalepler: ['satin-alma', 'on-talepler'] as const,
  ozet: ['satin-alma', 'ozet'] as const,
  acikEmirler: ['satin-alma', 'acik-emirler'] as const,
  disOperasyonlar: ['satin-alma', 'dis-operasyonlar'] as const,
  fasonSureleri: (sonGun: number) => ['satin-alma', 'fason-sureleri', sonGun] as const,
  kartlar: (tur: string, ara: string) => ['satin-alma', 'malzeme-secenekleri', tur, ara] as const,
};

// Malzeme kartı yalnız Malzemeler ve Hizmetler'de oluşturulur; bağlantı oranın yeni kart formuna gider. Ad ve yol tanımdan okunur (yeniden adlanınca izler).
const kartSayfasi = SAYFALAR.find((s) => s.islem === 'sayfa.malzemeler');
type Madde = (typeof MALZEMELER_IKINCI_MENU)['gruplar'][number]['maddeler'][number];
const YENI_KART_YOLU: Extract<Madde, { anahtar: 'new' }>['yol'] = '/malzemeler/yeni';
export const KART_SAYFASI = { yol: YENI_KART_YOLU, baslik: kartSayfasi?.baslik ?? 'Malzemeler ve Hizmetler' };

// Talep edenin gördüğü sade durum: satın almanın iç aşamaları (teklif, değerlendirme) ayrılmaz.
export const DURUM: Record<Talebim['durum'], { metin: string; ton: RozetTonu }> = {
  taslak: { metin: 'Satın almada', ton: 'bilgi' },
  teklif_isteniyor: { metin: 'Teklif toplanıyor', ton: 'bilgi' },
  degerlendirme: { metin: 'Teklif toplanıyor', ton: 'bilgi' },
  onayda: { metin: 'Onayda', ton: 'uyari' },
  siparis_verildi: { metin: 'Sipariş verildi', ton: 'tamam' },
  teslim_alindi: { metin: 'Teslim alındı', ton: 'tamam' },
  iptal: { metin: 'İptal', ton: 'pasif' },
};

// 898 a: talebin nereden geldiği. Ön talepten açılan fason adım talebi "Fason adım"; sistemin bilmediği ihtiyaç "Elle".
export const KAYNAK: Record<Talebim['kaynak'], { metin: string; simge: SimgeAdi }> = {
  elle: { metin: 'Elle', simge: 'edit' },
  fason: { metin: 'Fason adım', simge: 'wrench' },
};
// Talep edenin gördüğü beş adım; iptal adımsızdır. Teslim alındı bütün adımları bitirir.
export const ADIMLAR = ['Satın almada', 'Teklif', 'Onay', 'Sipariş', 'Teslim'] as const;
export const ADIM_SIRASI: Record<Talebim['durum'], number | null> = {
  taslak: 0, teklif_isteniyor: 1, degerlendirme: 1, onayda: 2, siparis_verildi: 3, teslim_alindi: 5, iptal: null,
};
export const gunYaz = (t: string | null) => (t === null ? null : new Date(`${t.slice(0, 10)}T00:00:00`).toLocaleDateString('tr-TR'));

// SAT-78 (2871): kg ile stok birimi karşılığı ekranda yaklaşık gösterilir; hesap sunucunun (Taleplerim) ya da kartın birim ağırlığıyladır.
// SAT-78: birim ağırlık parça ya da ambalaj başına kg'dır; uzunluk ve alan stok biriminde metre ağırlığı gerekir, yoktur (sunucu kurallar.ts ile aynı liste).
const OLCULU_STOK_BIRIMLERI: readonly string[] = ['mm', 'cm', 'm', 'mt', 'metre', 'mm2', 'mm²', 'cm2', 'cm²', 'm2', 'm²', 'metrekare'];
// 0,01'in altı "≈ 0" yazılmaz; küçük sarfta yanıltır.
const sayiYaz = (n: number) => (n > 0 && n < 0.01 ? '< 0,01' : n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));
const yaklasik = (n: number) => { const y = sayiYaz(n); return y.startsWith('<') ? y : `≈ ${y}`; };
// 3100: parça sayısı bir ondalıkla yazılır, ",0" atılır ("≈ 4", "≈ 4,3").
const adetYaz = (n: number) => `≈ ${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
export const karsilikYaz = (c: { miktar: string; birim: string } | null | undefined): string | null =>
  (c == null ? null : c.birim === 'adet' ? `${adetYaz(Number(c.miktar))} adet` : `${yaklasik(Number(c.miktar))} ${c.birim}`);
// 3100: kg stoklu hammaddede bir parçanın (boy, levha) kg'ı; kalemin birimi kg değilse ya da ağırlık yoksa null. Sunucu kurallar.ts parcaKarsiligi ile aynı.
export function parcaKg(kart: { birim: string | null; stokBirimi?: string | null; birimKg?: number | null }): number | null {
  const kg = (b: string | null | undefined) => (b ?? '').trim().toLocaleLowerCase('tr-TR') === 'kg';
  return kg(kart.stokBirimi) && kg(kart.birim) && kart.birimKg != null && kart.birimKg > 0 ? kart.birimKg : null;
}
// Adetten kg: form alanına virgüllü, en çok üç ondalık, binliksiz yazılır.
export const adettenKg = (adet: number, kg: number): string =>
  (Math.round(adet * kg * 1000) / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 3, useGrouping: false });
// Yeni talep formu: kartın stok biriminde girilen miktarın kg karşılığı ve birim ağırlık. Ağırlık bilinmiyorsa ya da birim kg ise yok.
export function kartKarsiligi(kart: { birim: string | null; stokBirimi?: string | null; birimKg?: number | null }, miktar: string | null): string | null {
  const stok = (kart.stokBirimi ?? '').trim();
  const kucuk = stok.toLocaleLowerCase('tr-TR');
  if (kart.birimKg == null || !(kart.birimKg > 0) || kucuk === '' || kucuk === 'kg' || OLCULU_STOK_BIRIMLERI.includes(kucuk)) return null;
  const birim = `1 ${stok} ${yaklasik(kart.birimKg)} kg`;
  const ayni = (kart.birim ?? '').trim().toLocaleLowerCase('tr-TR') === kucuk;
  return miktar === null || !ayni ? birim : `${yaklasik(Number(miktar) * kart.birimKg)} kg (${birim})`;
}
