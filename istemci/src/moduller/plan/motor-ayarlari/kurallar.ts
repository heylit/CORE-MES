import type { MotorAyarlari, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';

// Seçimle verilen ayarlar; acil iş payı sayıdır, ayrı alandır (ACIL_PAY).
export type SecimAyari = Exclude<keyof MotorAyarlari, 'acilPay'>;
// Plan motoru ayarlarının ekrandaki adları (kart 811; 771 a, 772 a, 776 b). Sıra seçim kutusundaki sıradır, ilki varsayılandır.
export const AYAR_SECENEKLERI: { [K in SecimAyari]: { baslik: string; ipucu: string; secenekler: readonly { deger: MotorAyarlari[K]; baslik: string }[] } } = {
  amac: {
    baslik: 'Plan amacı',
    ipucu: 'Sıralı: önce zamanında teslim, sonra değişiklik, ayar ve boşta kalma, en son maliyet. TL seçeneği para verisi dolunca açılır.',
    secenekler: [{ deger: 'sirali', baslik: 'Sıralı' }, { deger: 'tl', baslik: 'TL (gecikme bedeli)' }],
  },
  eksikStok: {
    baslik: 'Stoku bilinmeyen malzeme',
    ipucu: 'Varsay: stok var sayılır. Dur: plan kurulur ama stoku bilinmeyen malzeme varken canlıya alınamaz.',
    secenekler: [{ deger: 'varsay', baslik: 'Varsay' }, { deger: 'dur', baslik: 'Dur' }],
  },
  kural: {
    baslik: 'Sıralama kuralı',
    ipucu: 'Atölyede senaryo başına ayrıca seçilebilir.',
    secenekler: [
      { deger: 'atcs', baslik: 'ATCS (öncelik, termin ve süre birlikte)' }, { deger: 'oncelik', baslik: 'Öncelik, sonra teslim' },
      { deger: 'edd', baslik: 'En erken teslim (EDD)' }, { deger: 'cr', baslik: 'Kritik oran (CR)' },
      { deger: 'spt', baslik: 'En kısa iş (SPT)' }, { deger: 'fifo', baslik: 'İlk gelen önce (FIFO)' },
    ],
  },
  // 1714 (1684 b): öğrenme yalnız tamponu değiştirir, rota süresine dokunmaz; kapalıyken de Plan sağlığında görünür.
  ogrenme: {
    baslik: 'Gerçek sürelerden öğrenme',
    ipucu: 'Açık: son 90 günde biten adımların süre sapması emniyet payına (tampon) eklenir; en az 3 örnek gerekir, rota süresi değişmez. Kapalıyken öğrenilen değerler yalnız Plan sağlığında görünür.',
    secenekler: [{ deger: 'kapali', baslik: 'Kapalı' }, { deger: 'acik', baslik: 'Açık (yalnız tampon)' }],
  },
  // 2523 a: ikinci tezgâh her zaman boş değilse atölye bölmeyi kapatır ya da pay sayısını düşürür.
  bolmeKip: {
    baslik: 'Paralel bölme',
    ipucu: 'Açık: rotada "paralel böl" işaretli adım boşta duran kardeş tezgâhlara bölünür. Kapalı: adım tek tezgâhta kalır.',
    secenekler: [{ deger: 'otomatik', baslik: 'Açık' }, { deger: 'kapali', baslik: 'Kapalı' }],
  },
  bolmeMaks: {
    baslik: 'Bölmede en çok pay',
    ipucu: 'Bir adımın en çok kaç tezgâha bölüneceği. Paralel bölme kapalıyken kullanılmaz.',
    secenekler: [2, 3, 4, 5].map((n) => ({ deger: n, baslik: `${String(n)} pay` })),
  },
};

// 771 a, 832 a: TL amacı ayarda kapalıdır; seçim listesinde yalnız şu an kayıtlıysa görünür (sunucu da yazmayı reddeder).
export const KAPALI_SECENEKLER: { [K in SecimAyari]?: readonly MotorAyarlari[K][] } = { amac: ['tl'] };
// Seçim kutusu metin taşır; sayı olan ayar (pay sayısı) da metne çevrilir, geri dönüşü secimDegeri yapar.
export function secilebilir<K extends SecimAyari>(anahtar: K, simdiki: MotorAyarlari[K]): { deger: string; baslik: string }[] {
  const kapali = (KAPALI_SECENEKLER[anahtar] ?? []) as readonly MotorAyarlari[K][];
  const liste = AYAR_SECENEKLERI[anahtar].secenekler as readonly { deger: MotorAyarlari[K]; baslik: string }[];
  return liste.filter((s) => !kapali.includes(s.deger) || s.deger === simdiki).map((s) => ({ deger: String(s.deger), baslik: s.baslik }));
}

export function secimDegeri<K extends SecimAyari>(anahtar: K, metin: string): MotorAyarlari[K] | null {
  const liste = AYAR_SECENEKLERI[anahtar].secenekler as readonly { deger: MotorAyarlari[K]; baslik: string }[];
  return liste.find((s) => String(s.deger) === metin)?.deger ?? null;
}

export function degerAdi<K extends SecimAyari>(anahtar: K, deger: MotorAyarlari[K]): string {
  const liste = AYAR_SECENEKLERI[anahtar].secenekler as readonly { deger: MotorAyarlari[K]; baslik: string }[];
  return liste.find((s) => s.deger === deger)?.baslik ?? String(deger);
}

// 2509-1 c: acil iş payı ekranda yüzde, kayıtta oran (0-0,3). Planlama çalışmasında ayrıca girilmez.
export const ACIL_PAY = {
  baslik: 'Acil iş payı (%)',
  ipucu: 'Tampon açıkken işleme süresine eklenen pay; canlı plan saatleri bununla uzar. Sapma ölçümü payı düşerek yapılır. 0 ile 30 arası.',
};
// Sunucu şemasındaki sınırla aynı (paylasilan/sozlesme/plan.ts ACIL_PAY_SINIRI); istemci şemayı değer olarak ithal etmez.
export const ACIL_PAY_SINIRI = 0.3;
export const yuzdeMetni = (oran: number): string => (Math.round(oran * 1000) / 10).toLocaleString('tr-TR');
// Girilen yüzde orana çevrilir; boş, sayı olmayan ya da sınır dışı değer null (kaydedilmez).
export function yuzdeOku(metin: string, sinir: number): number | null {
  const t = metin.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n / 100 > sinir) return null;
  return Math.round(n * 10) / 1000;
}

// Sürüm satırı: kim ne zaman yazdı; hiç sürüm yoksa varsayılan.
export function surumMetni(s: MotorAyarlariCevabi['guncel']): string {
  if (s.surumId === null) return 'Varsayılan ayarlar; henüz değiştirilmedi.';
  const zaman = s.zaman === null ? '' : new Date(s.zaman).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' });
  return `Sürüm ${String(s.surumId)}: ${s.yazan ?? 'bilinmeyen kişi'}${zaman ? `, ${zaman}` : ''}.`;
}
