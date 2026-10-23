// Kaynaklar komut tablosu ve istek kurucusu: zod taşımaz, bu yüzden istemci modülünde durur; köprü ve sunucu testi aynısını kullanır.
// ----- Kaynak komutları (kart #1106) -----
// Kaynaklar sekmesinin yazma eylemleri sahibi modüllerin VAR OLAN uçlarına gider. Tablo hangi uca, hangi gövde alanlarıyla gideceğini
// söyler; kural ve yetki sahibindedir. Güncelleme uçları tam kayıt ve okunan sürümü ister: ekranın gönderdiği alanlar, sahibinden
// OKUNMUŞ kaydın üstüne konur (gönderilmeyen alan silinmez) ve sürüm o okunmuş kayıttan gelir. Başkası arada yazdıysa sahibi 409 döner.
export type KaynakTuru = 'isMerkezi' | 'istasyon' | 'makine' | 'kisi' | 'vardiya' | 'planAyari' | 'makineDurumu';
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
  // Güncelleme: gövdede gelmeyen alanlar ve sürüm bu türün okunmuş kaydından tamamlanır (kimlik `id` parametresidir).
  readonly tamamla?: KaynakTuru;
}

const ISTASYON_ALANLARI = ['kod', 'ad', 'isMerkeziId', 'tip', 'sorumluKisiId', 'kapasiteKaynagi', 'uretimAlani', 'aktif'] as const;
const MAKINE_ALANLARI = ['kod', 'ad', 'tur', 'markaModel', 'seriNo', 'istasyonId', 'baglantiTuru', 'baglantiAdresi', 'aktif'] as const;
const IS_MERKEZI_ALANLARI = ['kod', 'ad', 'aciklama', 'aktif'] as const;

// Tek düzenleme yeri: istasyonun plan ayarı ve makine durumu İstasyonlar'da, vardiya, hafta düzeni, tatil ve kişi vardiyası Vardiya'da
// yazılır; köprü bunları yalnız okur (prototip düzenleme isteğini o sayfaya götürür).
export const KAYNAK_KOMUTLARI: Readonly<Record<string, KomutTanimi>> = {
  'is-merkezi-ekle': { yol: '/is-merkezleri', alanlar: IS_MERKEZI_ALANLARI },
  'is-merkezi-guncelle': { yol: '/is-merkezleri/:id/guncelle', parametre: ['id'], alanlar: IS_MERKEZI_ALANLARI, tamamla: 'isMerkezi' },
  'is-merkezi-sil': { yol: '/is-merkezleri/:id/sil', parametre: ['id'], alanlar: [] },
  'istasyon-ekle': { yol: '/istasyonlar', alanlar: ISTASYON_ALANLARI },
  'istasyon-guncelle': { yol: '/istasyonlar/:id/guncelle', parametre: ['id'], alanlar: ISTASYON_ALANLARI, tamamla: 'istasyon' },
  'istasyon-sil': { yol: '/istasyonlar/:id/sil', parametre: ['id'], alanlar: [] },
  'makine-ekle': { yol: '/makineler', alanlar: MAKINE_ALANLARI },
  'makine-guncelle': { yol: '/makineler/:id/guncelle', parametre: ['id'], alanlar: MAKINE_ALANLARI, tamamla: 'makine' },
  'makine-sil': { yol: '/makineler/:id/sil', parametre: ['id'], alanlar: [] },
  'kisi-ekle': { yol: '/kisiler', alanlar: ['ad', 'sicilNo', 'gorev'], tekrarKorumali: true },
  'kisi-duzenle': { yol: '/kisiler/:id/duzenle', parametre: ['id'], alanlar: ['ad', 'sicilNo', 'gorev'], tamamla: 'kisi' },
  'yetkinlik-belirle': { yol: '/kisi-yetkinlikleri/:kisiId/belirle', parametre: ['kisiId'], alanlar: ['istasyonIdleri'] },
};

const KOLEKSIYON: Readonly<Record<KaynakTuru, keyof KaynakAnlik>> = {
  isMerkezi: 'isMerkezleri', istasyon: 'istasyonlar', makine: 'makineler', kisi: 'kisiler', vardiya: 'vardiyalar',
  planAyari: 'planAyarlari', makineDurumu: 'makineDurumlari',
};
// Okunmuş kaydı olmadan güncellenemeyen türler. Plan ayarı ve makine durumunda satır yoksa sürüm 0'dır (sahibinin kuralı).
const SATIR_ZORUNLU: ReadonlySet<KaynakTuru> = new Set<KaynakTuru>(['isMerkezi', 'istasyon', 'makine', 'kisi', 'vardiya']);
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
  { koleksiyon: 'planAyarlari', yol: '/istasyon-plan-ayarlari', alan: 'ayarlar', anahtar: 'istasyonId', islemler: ['sayfa.istasyonlar', 'istasyonlar.yaz'] },
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
export function komutIstegi(tanim: KomutTanimi, girdi: Readonly<Record<string, unknown>>, anlik: KaynakAnlik = BOS_ANLIK): KomutIstegi {
  let yol = tanim.yol;
  for (const ad of tanim.parametre ?? []) yol = yol.replace(`:${ad}`, yolDegeri(ad, girdi[ad]));
  const govde: Record<string, unknown> = {};
  let kayit: KaynakKaydi | undefined;
  let koleksiyonVar = false;
  if (tanim.tamamla !== undefined) {
    const koleksiyon = anlik[KOLEKSIYON[tanim.tamamla]];
    koleksiyonVar = koleksiyon !== null;
    kayit = koleksiyon?.get(Number(yolDegeri('id', girdi['id'])));
    if (kayit === undefined && SATIR_ZORUNLU.has(tanim.tamamla)) {
      throw new Error('Geçersiz kayıt: bu kayıt okunmadı; ekranı yenileyip yeniden deneyin.');
    }
  }
  for (const alan of tanim.alanlar) {
    const deger = Object.hasOwn(girdi, alan) ? girdi[alan] : kayit?.[alan];
    if (deger !== undefined) govde[alan] = deger;
  }
  Object.assign(govde, tanim.sabit);
  if (tanim.tamamla !== undefined) {
    if (kayit !== undefined) govde['surum'] = kayit.surum;
    else if (koleksiyonVar) govde['surum'] = 0;
  }
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
