import type { KmBalon, KmBalonlarGovdesi, KmNumune, KmNumuneKurali, KmOlcum, KmOlcumGovdesi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import type { Balon, Olcum } from '../../../ortak/cizim/kurallar.ts';
import type { YaziKutusu } from '../../../ortak/cizim/okuma.ts';

// Stüdyonun saf kuralları: ortak çizim parçasına çeviri, son ölçüm, emir kimliği ve numune planı metni.
type KmOlcumGirdisi = KmOlcumGovdesi['olcumler'][number];
type KmPlanGirdisi = KmBalonlarGovdesi['balonlar'][number];

// Ortak çizim parçası Arkon'un balon ve ölçüm biçimini konuşur (616 b); Kalite Merkezi kaydı ona çevrilir. Parçada balonun kimliği ekrandaki
// numarasıdır (`no`). Sınırı olmayan balon geçer/geçmez mastarıdır (sunucudaki olcumSonucu ile aynı ayrım).
export function cizimBalonu(b: KmBalon): Balon {
  const sinirli = b.alt !== null && b.ust !== null;
  return {
    id: b.no, x: b.x ?? 0, y: b.y ?? 0, nom: b.nominal, min: sinirli ? Number(b.alt) : 0, max: sinirli ? Number(b.ust) : 0, gauge: !sinirli, crit: b.kritik,
    ...(b.yaziKutusu?.length === 5 ? { ar: b.yaziKutusu as YaziKutusu } : {}),
    ...(b.tolerans !== null ? { tol: b.tolerans } : {}),
    ...(b.alet !== null ? { tool: b.alet } : {}),
    ...(b.yontem !== null ? { m: b.yontem === 'cmm' ? 'cmm' as const : 'man' as const } : {}),
    ...(b.siklik !== null ? { freq: b.siklik } : {}),
    ...(b.tur !== null ? { l: b.tur } : {}),
    ...(b.yer ? { yer: [b.yer[0], b.yer[1]] as [number, number] } : {}),
    ...(b.yerKipi ? { yerKipi: b.yerKipi } : {}),
  };
}

// Sınır sunucuya en çok altı ondalıklı metin gider; sonlu olmayan sınır yoktur (balon mastar sayılır).
const sinirMetni = (n: number): string => String(Number(n.toFixed(6)));

// Parçanın düzenlediği plan sunucuya bütün gider (603 a): numarası eski balonla aynı olan satır o balonun kimliğini taşır, öteki yeni balondur.
// Parçanın tutmadığı alanlar (ölçü aleti zorunluluğu, sayfa) eski balondan korunur.
export function planGirdileri(eski: readonly KmBalon[], balonlar: readonly Balon[]): KmPlanGirdisi[] {
  const noIle = new Map(eski.map((b) => [b.no, b]));
  return balonlar.map((b) => {
    const k = noIle.get(b.id);
    const sinirli = !b.gauge && Number.isFinite(b.min) && Number.isFinite(b.max);
    return {
      ...(k ? { id: k.id } : {}),
      no: b.id, nominal: b.nom, tolerans: b.tol ?? null,
      alt: sinirli ? sinirMetni(b.min) : null, ust: sinirli ? sinirMetni(b.max) : null,
      alet: b.tool ?? null, siklik: b.freq ?? null, kritik: b.crit === true,
      yontem: b.m === 'cmm' ? 'cmm' : b.m === 'man' ? 'elle' : null,
      olcuAletiGerekir: k?.olcuAletiGerekir ?? false, tur: b.l ?? null, sayfa: k?.sayfa ?? null,
      x: b.x, y: b.y, yaziKutusu: b.ar ?? null, yer: b.yer ?? null, yerKipi: b.yerKipi ?? null,
    };
  });
}

// Son ölçümler balon numarasına göre; değer sayı, mastar sonucu Arkon'daki gibi "Geçer" ya da "Geçmez".
export function cizimOlcumleri(balonlar: readonly KmBalon[], sonlar: ReadonlyMap<number, KmOlcum>): Record<number, Olcum> {
  const sonuc: Record<number, Olcum> = {};
  for (const b of balonlar) {
    const o = sonlar.get(b.id);
    if (!o) continue;
    sonuc[b.no] = { v: o.deger !== null ? Number(o.deger) : o.nitel === 'gecer' ? 'Geçer' : 'Geçmez', ok: o.uygun, at: Date.parse(o.zaman) };
  }
  return sonuc;
}

// Parçanın yazdığı ölçüm kaydından sunucuya gidecek satırlar: yalnız değişen balonlar; mastar nitel, öteki sayı (uygunluğu sunucu hesaplar).
export function yeniOlcumler(balonlar: readonly KmBalon[], onceki: Readonly<Record<number, Olcum>>, yeni: Readonly<Record<number, Olcum>>): KmOlcumGirdisi[] {
  const satirlar: KmOlcumGirdisi[] = [];
  for (const b of balonlar) {
    const o = yeni[b.no];
    if (!o || o === onceki[b.no]) continue;
    if (b.alt === null || b.ust === null) satirlar.push({ balonId: b.id, nitel: o.ok ? 'gecer' : 'gecmez' });
    else satirlar.push({ balonId: b.id, deger: String(o.v) });
  }
  return satirlar;
}

// Balon başına son ölçüm: düzeltme yeni ölçümdür, eskisi silinmez (600 a); aynı anda gelenlerde büyük kimlik sonradır.
export function sonOlcumler(olcumler: readonly KmOlcum[]): ReadonlyMap<number, KmOlcum> {
  const son = new Map<number, KmOlcum>();
  for (const o of olcumler) {
    const v = son.get(o.balonId);
    if (!v || o.zaman > v.zaman || (o.zaman === v.zaman && o.id > v.id)) son.set(o.balonId, o);
  }
  return son;
}

// Kalite Merkezi'nin iş emri satırı 'ue-<kimlik>' biçimindedir (596); ölçüm ve numune üretim emri kimliğiyle tutulur.
export function uretimEmriKimligi(satirKimligi: string): number | null {
  const m = /^ue-([1-9][0-9]{0,9})$/.exec(satirKimligi);
  return m ? Number(m[1]) : null;
}

const ZAMAN_ADI: Record<KmNumuneKurali['ne'], (n: number | undefined) => string> = {
  ilk: () => 'İlk parça',
  her: (n) => `Her ${String(n ?? '')} parça`,
  sure: (n) => `${String(n ?? '')} dakikada bir`,
  vardiya: () => 'Vardiya başı',
  son: () => 'Son parça',
};
export function numuneKuraliMetni(k: KmNumuneKurali): string {
  const kim = k.kim.map((x) => (x === 'kalite' ? 'Kalite' : 'Operatör')).join(' + ');
  const balon = k.balonlar === 'hepsi' ? 'tüm balonlar' : k.balonlar === 'kritik' ? 'kritik balonlar' : `balon ${k.balonlar.join(', ')}`;
  return [ZAMAN_ADI[k.ne](k.n), kim, balon, k.kapi ? 'kalite kararı bekler' : null].filter(Boolean).join(' · ');
}

export const NUMUNE_DURUMU: Record<KmNumune['durum'], { ad: string; ton: 'bilgi' | 'tamam' | 'uyari' | 'hata' }> = {
  bekliyor: { ad: 'Bekliyor', ton: 'uyari' },
  olculuyor: { ad: 'Ölçülüyor', ton: 'bilgi' },
  onay: { ad: 'Onaylandı', ton: 'tamam' },
  ret: { ad: 'Reddedildi', ton: 'hata' },
  sapma: { ad: 'Sapma onayı', ton: 'uyari' },
};

// CMM sonuç dosyası (1439 a): kodlama istemcide çözülür. Geçerli UTF-8 değilse Türkçe Windows kodlaması (1254) sayılır; sunucu metni alır.
export function cmmMetniCoz(bayt: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bayt); } catch { return new TextDecoder('windows-1254').decode(bayt); }
}

// Sunucunun sınırı (KM_CMM_METIN_SINIRI); büyük dosya gönderilmeden söylenir. Sözleşme değer olarak ithal edilmez (zod istemciye girmez).
export const CMM_METIN_SINIRI = 900000;

// Son seçilen sütun eşlemesi aynı başlıklı dosya için tarayıcıda hatırlanır (sunucuda biçim profili tutulmaz).
export const CMM_ESLEME_ANAHTARI = 'km-cmm-esleme';
export const cmmBaslikImzasi = (basliklar: readonly string[]): string => basliklar.map((b) => b.trim().toLowerCase()).join('␟');

export const CMM_DURUMU = {
  eslesti: { ad: 'Yazılacak', ton: 'tamam' },
  nominalFarki: { ad: 'Nominal farklı', ton: 'uyari' },
  eslesmedi: { ad: 'Balon yok', ton: 'pasif' },
  belirsiz: { ad: 'Belirsiz', ton: 'uyari' },
  yinelenen: { ad: 'Yinelenen', ton: 'uyari' },
  degerYok: { ad: 'Değer yok', ton: 'pasif' },
  nitelBalon: { ad: 'Geçer/geçmez', ton: 'pasif' },
} as const satisfies Record<string, { ad: string; ton: 'tamam' | 'uyari' | 'pasif' }>;
