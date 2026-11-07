import type { z } from 'zod';
import type { OranAraligi, oranTopluSatiri } from '#paylasilan/sozlesme/finans.ts';
import { csvSatirlari, csvSayisi, csvTarihi } from './yeni/ayarlar/csv.ts';

// Kur ve faiz matrisi şablonunun okunması (kart 2238; kurallar 1083-1087), saf. Satır oran türüdür (kur alış, kur satış, kredi,
// mevduat, politika), sütun para birimidir; Tarih sütunu yoksa ekranda seçilen gün kullanılır. Kullanıcının kendi matris dosyasındaki
// kullanım sütunları okunur ama yok sayılır: hangi oranın nerede kullanılacağı sistemde sabittir. Ekran yalnız önizler; sunucu her
// satırı yeniden denetler ve sayıları o verir.
export type TopluSatir = z.input<typeof oranTopluSatiri>;
// Sözleşmedeki KUR_FAIZ_TOPLU_SINIRI ve KUR_FAIZ_ARALIGI_GUN ile aynıdır (istemci paylaşılandan değer almaz); sunucu yeniden denetler.
const KUR_FAIZ_TOPLU_SINIRI = 400;
const KUR_FAIZ_ARALIGI_GUN = 1830;

export type OranTuru = 'kur' | 'kredi' | 'mevduat' | 'politika';
export const ORAN_ADI: Record<OranTuru, string> = { kur: 'Kur (alış / satış)', kredi: 'Kredi faizi', mevduat: 'Mevduat faizi', politika: 'Politika faizi' };
type SatirTuru = 'alis' | 'satis' | 'kredi' | 'mevduat' | 'politika';
// Satır adı küçük harfe ve sade boşluğa çevrilip başından tanınır: "Kur alış (TL)", "Kredi faizi yıllık %" gibi.
function satirTuru(ham: string): SatirTuru | null {
  const t = ham.trim().toLocaleLowerCase('tr').replace(/\s+/g, ' ');
  if (/^kur al[ıi][sş]/.test(t)) return 'alis';
  if (/^kur sat[ıi][sş]/.test(t)) return 'satis';
  if (t.startsWith('kredi')) return 'kredi';
  if (t.startsWith('mevduat')) return 'mevduat';
  if (t.startsWith('politika')) return 'politika';
  return null;
}
const bosMu = (h: string) => /^[\s\-–—]*$/.test(h);

export type SatirDurumu = 'yeni' | 'ayni' | 'farkli' | 'hata';
export interface OnizlemeSatiri {
  // Önizleme satırı oran türü ve para birimi başınadır; no dosyadaki satırdır (kurda alış satırı), başlık 1.
  no: number;
  // Önizleme tablosunun anahtarı: bir dosya satırı birden çok para birimi taşır.
  sira: number;
  tur: OranTuru;
  paraBirimi: string;
  tarih: string | null;
  alis: number | null;
  satis: number | null;
  yuzde: number | null;
  not: string | null;
  durum: SatirDurumu;
  neden: string | null;
}
export interface OkunanDosya { satirlar: OnizlemeSatiri[]; dosyaHatasi: string | null; tarihSutunuVar: boolean }

export const SABLON_BASLIKLARI = ['Oran', 'Tarih', 'TRY', 'USD', 'EUR', 'GBP', 'Not'] as const;
// İndirilen şablonun örnek satırları; değerler uydurmadır.
export const SABLON_SATIRLARI: readonly (readonly string[])[] = [
  ['Kur alış (TL)', '06.11.2026', '—', '41,1000', '47,2000', '54,3000', ''],
  ['Kur satış (TL)', '06.11.2026', '—', '41,2000', '47,3000', '54,5000', ''],
  ['Kredi faizi yıllık %', '01.11.2026', '30,00', '6,00', '5,00', '—', ''],
  ['Mevduat faizi yıllık %', '01.11.2026', '25,00', '1,50', '1,00', '—', 'stopaj sonrası'],
  ['Politika faizi yıllık %', '23.10.2026', '30,00', '4,00', '2,00', '—', ''],
];

const ondalikSayisi = (n: number): number => { const m = String(n).split('.')[1]; return m ? m.length : 0; };
const anahtar = (tur: string, pb: string, tarih: string) => `${tur}|${pb}|${tarih}`;
const gecerliTarih = (t: string | null): t is string =>
  t !== null && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t;

interface Hucre { no: number; tarih: string | null; tarihHatasi: boolean; ham: string; not: string | null }

// varsayilanTarih: dosyada Tarih sütunu yoksa bütün satırların günü (ekranda seçilir).
export function sablonuOku(metin: string, bugun: string, varsayilanTarih: string = bugun): OkunanDosya {
  const ham = csvSatirlari(metin);
  if (ham.length < 2) return { satirlar: [], dosyaHatasi: 'Dosyada başlık dışında satır yok.', tarihSutunuVar: false };
  const baslik = ham[0]!.map((h) => h.trim());
  const tarihSutunu = baslik.findIndex((h) => h.toLocaleLowerCase('tr') === 'tarih');
  const notSutunu = baslik.findIndex((h) => h.toLocaleLowerCase('tr') === 'not');
  // "Not" da üç harflidir: Tarih ve Not sütunu para birimi sayılmaz.
  const pbSutunlari = baslik.map((h, i) => ({ pb: h.toUpperCase(), i }))
    .filter(({ pb, i }) => i > 0 && i !== tarihSutunu && i !== notSutunu && /^[A-Z]{3}$/.test(pb));
  const tarihSutunuVar = tarihSutunu >= 0;
  if (pbSutunlari.length === 0) return { satirlar: [], dosyaHatasi: 'Başlıkta para birimi sütunu yok (TRY, USD gibi üç harfli kod).', tarihSutunuVar };
  // Oran satırı başına bir hücre: alış ve satış ayrı toplanıp para birimi ve günde birleştirilir.
  const hucreler = new Map<SatirTuru, Map<string, Hucre[]>>();
  const satirHatalari: OnizlemeSatiri[] = [];
  ham.slice(1).forEach((h, i) => {
    const no = i + 2;
    const tur = satirTuru(h[0] ?? '');
    if (tur === null) {
      satirHatalari.push({ no, sira: 0, tur: 'kur', paraBirimi: '-', tarih: null, alis: null, satis: null, yuzde: null, not: null, durum: 'hata',
        neden: `"${(h[0] ?? '').trim()}" tanınmadı; satır adı Kur alış, Kur satış, Kredi, Mevduat ya da Politika ile başlamalı.` });
      return;
    }
    const tarih = tarihSutunuVar ? csvTarihi(h[tarihSutunu] ?? '') : varsayilanTarih;
    const not = notSutunu >= 0 ? (h[notSutunu] ?? '').trim() || null : null;
    for (const { pb, i: sutun } of pbSutunlari) {
      const deger = h[sutun] ?? '';
      if (bosMu(deger)) continue;
      const t = hucreler.get(tur) ?? new Map<string, Hucre[]>();
      hucreler.set(tur, t);
      const liste = t.get(pb) ?? [];
      liste.push({ no, tarih: gecerliTarih(tarih) ? tarih : null, tarihHatasi: !gecerliTarih(tarih), ham: deger, not });
      t.set(pb, liste);
    }
  });
  const satirlar: OnizlemeSatiri[] = [...satirHatalari];
  const gorulen = new Set<string>();
  const ekle = (s: OnizlemeSatiri) => {
    if (s.durum !== 'hata' && s.tarih !== null) {
      const a = anahtar(s.tur, s.paraBirimi, s.tarih);
      if (gorulen.has(a)) { satirlar.push({ ...s, durum: 'hata', neden: 'Bu oran, para birimi ve tarih dosyada ikinci kez var.' }); return; }
      gorulen.add(a);
    }
    satirlar.push(s);
  };
  // Kur: alış ve satış aynı para birimi ve günde eşleşir (2238-1 c: ikisi birlikte girilir).
  const alislar = hucreler.get('alis') ?? new Map<string, Hucre[]>();
  const satislar = hucreler.get('satis') ?? new Map<string, Hucre[]>();
  for (const pb of new Set([...alislar.keys(), ...satislar.keys()])) {
    const s = [...(satislar.get(pb) ?? [])];
    for (const x of alislar.get(pb) ?? []) {
      const ei = s.findIndex((y) => y.tarih === x.tarih);
      const y = ei >= 0 ? s.splice(ei, 1)[0]! : null;
      ekle(kurSatiri(pb, x, y, bugun));
    }
    for (const y of s) ekle(kurSatiri(pb, null, y, bugun));
  }
  for (const tur of ['kredi', 'mevduat', 'politika'] as const) {
    for (const [pb, liste] of hucreler.get(tur) ?? []) for (const x of liste) ekle(faizSatiri(tur, pb, x));
  }
  satirlar.sort((p, q) => p.no - q.no);
  if (satirlar.length === 0) return { satirlar: [], dosyaHatasi: 'Dosyada okunacak değer yok.', tarihSutunuVar };
  if (satirlar.length > KUR_FAIZ_TOPLU_SINIRI) return { satirlar: [], dosyaHatasi: `Tek seferde en çok ${KUR_FAIZ_TOPLU_SINIRI} değer yüklenir.`, tarihSutunuVar };
  return { satirlar: satirlar.map((x, sira) => ({ ...x, sira })), dosyaHatasi: null, tarihSutunuVar };
}

function kurSatiri(pb: string, alis: Hucre | null, satis: Hucre | null, bugun: string): OnizlemeSatiri {
  const ilk = (alis ?? satis)!;
  const r: OnizlemeSatiri = { no: ilk.no, sira: 0, tur: 'kur', paraBirimi: pb, tarih: ilk.tarih, alis: null, satis: null, yuzde: null, not: null, durum: 'hata', neden: null };
  const hata = (neden: string): OnizlemeSatiri => ({ ...r, neden });
  if (pb === 'TRY') return hata('TRY için kur girilmez.');
  if (ilk.tarihHatasi) return hata('Tarih GG.AA.YYYY olmalı.');
  if (!alis) return hata('Alış kuru yok; alış ve satış birlikte girilir.');
  if (!satis) return hata('Satış kuru yok; alış ve satış birlikte girilir.');
  if (r.tarih! > bugun) return hata('İleri tarihli kur girilmez.');
  const a = csvSayisi(alis.ham);
  const s = csvSayisi(satis.ham);
  if (!Number.isFinite(a) || !Number.isFinite(s)) return hata('Kur sayı olmalı.');
  const v = { ...r, alis: a, satis: s };
  if (a <= 0 || s <= 0 || ondalikSayisi(a) > 6 || ondalikSayisi(s) > 6) return { ...v, neden: 'Kur sıfırdan büyük, en çok altı ondalık olmalı.' };
  if (s < a) return { ...v, neden: 'Satış kuru alış kurundan küçük olamaz.' };
  return { ...v, durum: 'yeni' };
}

function faizSatiri(tur: 'kredi' | 'mevduat' | 'politika', pb: string, x: Hucre): OnizlemeSatiri {
  const r: OnizlemeSatiri = { no: x.no, sira: 0, tur, paraBirimi: pb, tarih: x.tarih, alis: null, satis: null, yuzde: null, not: x.not, durum: 'hata', neden: null };
  if (x.tarihHatasi) return { ...r, neden: 'Tarih GG.AA.YYYY olmalı.' };
  const y = csvSayisi(x.ham);
  if (!Number.isFinite(y)) return { ...r, neden: 'Oran sayı olmalı.' };
  if (y < 0 || y > 1000 || ondalikSayisi(y) > 4) return { ...r, yuzde: y, neden: 'Yıllık faiz 0 ile 1000 arasında, en çok dört ondalık olmalı.' };
  if (x.not !== null && x.not.length > 200) return { ...r, yuzde: y, neden: 'Not en çok 200 karakter.' };
  return { ...r, yuzde: y, durum: 'yeni' };
}

// Önizlemenin kayıtlı değerleri okuyacağı aralık: geçerli satırların ilk ve son günü; sunucunun aralık sınırını aşarsa null.
export function okumaAraligi(satirlar: readonly OnizlemeSatiri[]): { baslangic: string; bitis: string } | null {
  const gunler = satirlar.filter((s) => s.durum !== 'hata' && s.tarih).map((s) => s.tarih!).sort();
  const baslangic = gunler[0];
  const bitis = gunler.at(-1);
  if (!baslangic || !bitis) return null;
  const fark = (Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${baslangic}T00:00:00Z`)) / 86_400_000;
  return fark > KUR_FAIZ_ARALIGI_GUN ? null : { baslangic, bitis };
}

const sayiMetni = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 6 });
// 1085 a: kayıtlı güne aynı değer de farklı değer de atlanır; farklıda kayıtlı değer yazılır ki kullanıcı elle düzeltebilsin.
export function kayitliylaKarsilastir(satirlar: readonly OnizlemeSatiri[], kayitli: OranAraligi): OnizlemeSatiri[] {
  const kurlar = new Map(kayitli.kurlar.map((k) => [anahtar('kur', k.paraBirimi, k.tarih), k]));
  const oranlar = new Map<string, string>();
  for (const f of kayitli.faizler) oranlar.set(anahtar(f.tur, f.paraBirimi, f.gecerlilikBaslangic), f.yillikYuzde);
  return satirlar.map((s) => {
    if (s.durum === 'hata' || s.tarih === null) return s;
    if (s.tur === 'kur') {
      const k = kurlar.get(anahtar('kur', s.paraBirimi, s.tarih));
      if (!k) return s;
      if (Number(k.alis) === s.alis && Number(k.satis) === s.satis) return { ...s, durum: 'ayni', neden: 'Kayıtlı değerle aynı; atlanır.' };
      return { ...s, durum: 'farkli', neden: `Kayıtlı: ${sayiMetni(Number(k.alis))} / ${sayiMetni(Number(k.satis))}. Atlanır; o gün elle düzeltilir.` };
    }
    const eski = oranlar.get(anahtar(s.tur, s.paraBirimi, s.tarih));
    if (eski === undefined) return s;
    if (Number(eski) === s.yuzde) return { ...s, durum: 'ayni', neden: 'Kayıtlı değerle aynı; atlanır.' };
    return { ...s, durum: 'farkli', neden: `Kayıtlı: %${sayiMetni(Number(eski))}. Atlanır; aynı güne yeni oran elle girilir.` };
  });
}

// Sunucuya geçerli bütün satırlar gider: atlama kararını sunucu yeniden verir (önizlemeden sonra girilmiş kayıt da atlanır).
export const gonderilecekler = (satirlar: readonly OnizlemeSatiri[]): TopluSatir[] => satirlar
  .filter((s) => s.durum !== 'hata' && s.tarih !== null)
  .map((s): TopluSatir => (s.tur === 'kur'
    ? { tur: 'kur', paraBirimi: s.paraBirimi, tarih: s.tarih!, alis: s.alis!, satis: s.satis! }
    : { tur: s.tur, paraBirimi: s.paraBirimi, tarih: s.tarih!, yillikYuzde: s.yuzde!, not: s.not }));
