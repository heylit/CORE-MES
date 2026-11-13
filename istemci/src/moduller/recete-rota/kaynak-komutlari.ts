import { ISTASYON_YAZMA_ISLEMLERI } from '#paylasilan/islemler.ts';
// Kaynaklar okuma tablosu ve köprü komutlarının istek kurucusu: zod taşımaz, bu yüzden istemci modülünde durur; köprü ve sunucu testi
// aynısını kullanır. Kaynaklar sekmesi yazmaz (1927 a): iş merkezi, istasyon, makine, kişi ve yetkinlik İstasyonlar'da, vardiya Vardiya'da
// yazılır. Komut tablosu (KomutTanimi) plan ve stok komutlarınındır: hangi uca, hangi gövde alanlarıyla gideceğini söyler.
export type KaynakKaydi = Readonly<Record<string, unknown>> & { readonly surum: number };
export type KaynakKoleksiyonu = ReadonlyMap<number, KaynakKaydi>;
// Koleksiyon okunamadıysa (sahibinin okuma yetkisi yok) null'dır.
export interface KaynakAnlik {
  readonly isMerkezleri: KaynakKoleksiyonu | null;
  readonly istasyonlar: KaynakKoleksiyonu | null;
  readonly makineler: KaynakKoleksiyonu | null;
  readonly kisiler: KaynakKoleksiyonu | null;
  readonly vardiyalar: KaynakKoleksiyonu | null;
  // Anahtar istasyon kimliği.
  readonly planAyarlari: KaynakKoleksiyonu | null;
  // Anahtar makine kimliği.
  readonly makineDurumlari: KaynakKoleksiyonu | null;
}
export const BOS_ANLIK: KaynakAnlik = {
  isMerkezleri: null, istasyonlar: null, makineler: null, kisiler: null, vardiyalar: null, planAyarlari: null, makineDurumlari: null,
};

export interface KomutTanimi {
  readonly yol: string;
  // Yol parametreleri; değerleri gövdeden alınır (tam sayı kimlik ya da `tarih`) ve gövdeye girmez.
  readonly parametre?: readonly string[];
  readonly alanlar: readonly string[];
  // Gövdeye her zaman konan değerler (ekran bunları seçemez).
  readonly sabit?: Readonly<Record<string, unknown>>;
  // Sahibinin ucu `tekrarKorumali` ise istek kimliğiyle gönderilir.
  readonly tekrarKorumali?: boolean;
}

const TAM_SAYI = /^[1-9]\d{0,9}$/;
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const AZAMI_KIMLIK = 2_147_483_647;

function yolDegeri(ad: string, ham: unknown): string {
  if (ad === 'tarih') {
    if (typeof ham === 'string' && TARIH.test(ham)) return ham;
    throw new Error('Geçersiz tarih.');
  }
  const metin = typeof ham === 'number' && Number.isSafeInteger(ham) ? String(ham) : typeof ham === 'string' ? ham : '';
  if (!TAM_SAYI.test(metin) || Number(metin) > AZAMI_KIMLIK) throw new Error(`Geçersiz ${ad}.`);
  return metin;
}

// Sürüm ve tam kayıt sahibinin kendi okuma uçlarından gelir (durum ucu sürüm taşımaz). Okuma yetkisi yoksa o koleksiyon null kalır.
// `islemler`: sahibinin uç yetkisi (biri yeter). Bilinen işlemleri taşımayan kişiye uç hiç sorulmaz (195 a, 403 bırakılmaz); alan
// yoksa uç sayfayı gören herkese açıktır.
export const KAYNAK_OKUMALARI: ReadonlyArray<{
  readonly koleksiyon: keyof KaynakAnlik; readonly yol: string; readonly alan: string; readonly anahtar: string; readonly islemler?: readonly string[];
}> = [
  { koleksiyon: 'isMerkezleri', yol: '/is-merkezleri', alan: 'isMerkezleri', anahtar: 'id' },
  { koleksiyon: 'istasyonlar', yol: '/istasyonlar', alan: 'istasyonlar', anahtar: 'id' },
  { koleksiyon: 'makineler', yol: '/makineler', alan: 'makineler', anahtar: 'id' },
  { koleksiyon: 'kisiler', yol: '/kisiler', alan: 'kisiler', anahtar: 'id', islemler: ['kisiler.oku'] },
  { koleksiyon: 'vardiyalar', yol: '/vardiya-takvimi', alan: 'vardiyalar', anahtar: 'id' },
  { koleksiyon: 'planAyarlari', yol: '/istasyon-plan-ayarlari', alan: 'ayarlar', anahtar: 'istasyonId', islemler: ['sayfa.istasyonlar', ...ISTASYON_YAZMA_ISLEMLERI] },
  { koleksiyon: 'makineDurumlari', yol: '/makine-durumlari', alan: 'durumlar', anahtar: 'makineId' },
];

// Sahibinin liste cevabından sürümlü kayıt haritası; biçim beklenenden farklıysa null.
export function koleksiyonKur(cevap: unknown, alan: string, anahtar: string): KaynakKoleksiyonu | null {
  const satirlar = (cevap as Record<string, unknown> | null)?.[alan];
  if (!Array.isArray(satirlar)) return null;
  const harita = new Map<number, KaynakKaydi>();
  for (const satir of satirlar as Array<Record<string, unknown>>) {
    const id = satir[anahtar];
    if (typeof id === 'number' && typeof satir['surum'] === 'number') harita.set(id, satir as KaynakKaydi);
  }
  return harita;
}

export interface KomutIstegi { readonly yol: string; readonly govde: Record<string, unknown>; readonly tekrarKorumali: boolean }

// Tabloda tanımlı komutun isteğini kurar: yol parametreleri doğrulanır, gövde yalnız izinli alanlardan oluşur. Geçersiz girdide
// "Geçersiz ..." iletili hata fırlar (köprü bunu çerçeveye 400 ile taşır).
export function komutIstegi(tanim: KomutTanimi, girdi: Readonly<Record<string, unknown>>): KomutIstegi {
  let yol = tanim.yol;
  for (const ad of tanim.parametre ?? []) yol = yol.replace(`:${ad}`, yolDegeri(ad, girdi[ad]));
  const govde: Record<string, unknown> = {};
  for (const alan of tanim.alanlar) {
    const deger = Object.hasOwn(girdi, alan) ? girdi[alan] : undefined;
    if (deger !== undefined) govde[alan] = deger;
  }
  Object.assign(govde, tanim.sabit);
  return { yol, govde, tekrarKorumali: tanim.tekrarKorumali === true };
}

// Vardiya modülünün takviminden iş merkezi haftası ve kişi vardiyası: çerçevenin biçimine (gün 0 pazar ... 6 cumartesi, kimlikler dize) çevrilir.
export interface TakvimEki {
  hafta: Record<string, Record<number, string[]>>;
  kisiVardiyasi: Record<string, string>;
}
export function takvimEki(cevap: unknown): TakvimEki | null {
  const c = cevap as { matris?: unknown; kisiVardiyalari?: unknown } | null;
  if (c === null || typeof c !== 'object' || !Array.isArray(c.matris) || !Array.isArray(c.kisiVardiyalari)) return null;
  const hafta: Record<string, Record<number, string[]>> = {};
  for (const m of c.matris as Array<{ isMerkeziId: number; gun: number; vardiyaId: number }>) {
    const gun = m.gun === 7 ? 0 : m.gun;
    const merkez = (hafta[String(m.isMerkeziId)] ??= {});
    (merkez[gun] ??= []).push(String(m.vardiyaId));
  }
  const kisiVardiyasi: Record<string, string> = {};
  for (const k of c.kisiVardiyalari as Array<{ kisiId: number; vardiyaId: number }>) kisiVardiyasi[String(k.kisiId)] = String(k.vardiyaId);
  return { hafta, kisiVardiyasi };
}
