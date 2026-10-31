import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { Aday, Egitim, Gorusme, Performans, Personel, Pozisyon } from '../tipler.ts';

// P4 ekranlarının saf hesapları (205 a): performans sonucu, eğitim özeti, aday süreci, görüşme ve ilan yayını kuralları.
// Kurallar bugünkü uygulamanınkiyle aynıdır; tarih kayıtların yerel günüdür (YYYY-AA-GG) ve metin olarak karşılaştırılır.

export const sayi = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const sayiBicimi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
export const sayiMetni = (v: number): string => sayiBicimi.format(v);
// Puan: iki basamak, puan yoksa çizgi (veri yoksa sıfır yazılmaz).
export const puanMetni = (v: number | null): string => (v ? sayiBicimi.format(Math.round(v * 100) / 100) : '—');

// Çok satırlı metin alanının dolu satırları (soru seti, sorumluluklar).
export const satirlar = (v: unknown): string[] => String(v ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

function gunSayisi(t: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : null;
}
// a'dan b'ye gün; tarih yoksa null.
export function gunFarki(a: string | undefined, b: string | undefined): number | null {
  const x = a ? gunSayisi(a) : null;
  const y = b ? gunSayisi(b) : null;
  return x === null || y === null ? null : Math.round(y - x);
}
export function gunEkle(t: string, gun: number): string {
  const g = gunSayisi(t);
  if (g === null) return t;
  return new Date((g + gun) * 86_400_000).toISOString().slice(0, 10);
}
const gecerliTarih = (t: string | undefined): t is string => typeof t === 'string' && gunSayisi(t) !== null;

/* ---------------- Performans ---------------- */

// Sıfırdan büyük puanların ortalaması; puan yoksa null.
export function puanOrtalamasi(skorlar: Readonly<Record<string, unknown>> | undefined): number | null {
  const p = Object.values(skorlar ?? {}).map(sayi).filter((x) => x > 0);
  return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null;
}

export const SONUCLAR = ['Beklentinin çok üzerinde', 'Beklentinin üzerinde', 'Beklentiyi karşılıyor', 'Gelişime açık', 'Beklentinin altında'] as const;
export function performansSonucu(ort: number | null): { etiket: string; ton: RozetTonu } {
  if (!ort) return { etiket: 'Puanlanmadı', ton: 'pasif' };
  if (ort >= 4.5) return { etiket: SONUCLAR[0], ton: 'tamam' };
  if (ort >= 3.5) return { etiket: SONUCLAR[1], ton: 'tamam' };
  if (ort >= 2.5) return { etiket: SONUCLAR[2], ton: 'bilgi' };
  if (ort >= 1.5) return { etiket: SONUCLAR[3], ton: 'uyari' };
  return { etiket: SONUCLAR[4], ton: 'hata' };
}

export interface PerformansSuzgeci { ara: string; donem: string; departman: string }
export function performanslariSuz(
  liste: readonly Performans[], s: PerformansSuzgeci, kisi: (id: string | undefined) => Personel | undefined, ad: (id: string | undefined) => string,
): Performans[] {
  const ara = s.ara.trim().toLocaleLowerCase('tr');
  return liste
    .filter((x) => !s.donem || x.donem === s.donem)
    .filter((x) => !s.departman || kisi(x.empId)?.departmanId === s.departman)
    .filter((x) => !ara || ad(x.empId).toLocaleLowerCase('tr').includes(ara))
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}
export const donemler = (liste: readonly Performans[]): string[] =>
  [...new Set(liste.map((x) => x.donem).filter((d): d is string => Boolean(d)))].sort().reverse();

// Sonuç dağılımı, departman ve yetkinlik ortalamaları (bugünkü üç panel).
export function performansOzeti(liste: readonly Performans[], kriterler: readonly string[], departmanAdi: (empId: string | undefined) => string) {
  const dagilim = SONUCLAR.map((e) => ({ etiket: e, sayi: liste.filter((x) => performansSonucu(puanOrtalamasi(x.skorlar)).etiket === e).length })).filter((x) => x.sayi > 0);
  const grup = new Map<string, number[]>();
  for (const x of liste) {
    const o = puanOrtalamasi(x.skorlar);
    if (o === null) continue;
    const d = departmanAdi(x.empId);
    grup.set(d, [...(grup.get(d) ?? []), o]);
  }
  const departman = [...grup.entries()].map(([etiket, l]) => ({ etiket, deger: l.reduce((a, b) => a + b, 0) / l.length })).sort((a, b) => b.deger - a.deger);
  const yetkinlik = kriterler.map((k) => {
    const l = liste.map((x) => sayi(x.skorlar?.[k])).filter((v) => v > 0);
    return { etiket: k, deger: l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0 };
  });
  return { dagilim, departman, yetkinlik };
}

/* ---------------- Eğitim ---------------- */

export const EGITIM_DURUMLARI = ['Planlandı', 'Tamamlandı', 'İptal'] as const;
export const ISG_EGITIMI = 'İSG (zorunlu)';

export function egitimOzeti(liste: readonly Egitim[], yil: string, aktifSayisi: number) {
  const t = liste.filter((x) => x.durum === 'Tamamlandı' && (x.tarih ?? '').startsWith(yil));
  const saat = t.reduce((a, x) => a + sayi(x.sure) * (x.katilimcilar ?? []).length, 0);
  return {
    tamamlanan: t.length, saat, harcama: t.reduce((a, x) => a + sayi(x.maliyet), 0),
    kisiBasi: aktifSayisi ? Math.round((saat / aktifSayisi) * 10) / 10 : 0,
  };
}

export interface EgitimSuzgeci { ara: string; tur: string; durum: string }
export function egitimleriSuz(liste: readonly Egitim[], s: EgitimSuzgeci): Egitim[] {
  const ara = s.ara.trim().toLocaleLowerCase('tr');
  return liste
    .filter((x) => !s.tur || x.tur === s.tur)
    .filter((x) => !s.durum || x.durum === s.durum)
    .filter((x) => !ara || `${x.ad ?? ''} ${x.kurum ?? ''}`.toLocaleLowerCase('tr').includes(ara))
    .sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
}

// Tamamlanmış, sertifikası geçerli İSG (zorunlu) eğitimine katılmamış aktif çalışanlar.
export function isgEksikleri(egitimler: readonly Egitim[], aktifler: readonly Personel[], bugun: string): Personel[] {
  const var_ = new Set<string>();
  for (const e of egitimler) {
    if (e.tur !== ISG_EGITIMI || e.durum !== 'Tamamlandı' || (gecerliTarih(e.gecerlilik) && e.gecerlilik < bugun)) continue;
    for (const k of e.katilimcilar ?? []) var_.add(k);
  }
  return aktifler.filter((p) => !var_.has(p.id));
}

// Sertifika: süresi dolmuş, 30 gün içinde dolacak ya da geçerli.
export function sertifikaDurumu(gecerlilik: string | undefined, bugun: string): 'yok' | 'doldu' | 'yakin' | 'gecerli' {
  if (!gecerliTarih(gecerlilik)) return 'yok';
  if (gecerlilik < bugun) return 'doldu';
  return (gunFarki(bugun, gecerlilik) ?? 99) <= 30 ? 'yakin' : 'gecerli';
}

/* ---------------- Aday ve görüşme ---------------- */

export const ISE_ALINDI = 'İşe alındı';
export const REDDEDILDI = 'Reddedildi';
export const TEKLIF = 'Teklif';
export const asamasi = (a: Pick<Aday, 'asama'>): string => a.asama || 'Başvuru';
export const surecteMi = (a: Pick<Aday, 'asama'>): boolean => ![ISE_ALINDI, REDDEDILDI].includes(asamasi(a));
export const adayAdi = (a: Pick<Aday, 'ad' | 'soyad'> | null | undefined): string => (a ? `${a.ad ?? ''} ${a.soyad ?? ''}`.trim() || 'İsimsiz aday' : '—');
export const tamamlandiMi = (g: Gorusme): boolean => g.durum === 'Tamamlandı';
export const kisaGorusmeZamani = (g: Pick<Gorusme, 'tarih' | 'saat'>): string => `${tarih(g.tarih)}${g.saat ? `, ${g.saat}` : ''}`;

export function adayGorusmeleri(gorusmeler: readonly Gorusme[], adayId: string): Gorusme[] {
  return gorusmeler.filter((g) => g.candId === adayId)
    .sort((a, b) => `${a.tarih ?? ''}${a.saat ?? ''}`.localeCompare(`${b.tarih ?? ''}${b.saat ?? ''}`));
}
// Tamamlanan görüşmelerin puan ortalamalarının ortalaması.
export function adayPuani(gorusmeler: readonly Gorusme[], adayId: string): number | null {
  const l = adayGorusmeleri(gorusmeler, adayId).filter(tamamlandiMi).map((g) => puanOrtalamasi(g.skorlar)).filter((x): x is number => x !== null);
  return l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
}
export function sonrakiGorusme(gorusmeler: readonly Gorusme[], adayId: string, bugun: string): Gorusme | null {
  return adayGorusmeleri(gorusmeler, adayId).find((g) => g.durum === 'Planlandı' && gecerliTarih(g.tarih) && g.tarih >= bugun) ?? null;
}
// Tarihi geçmiş ama sonucu girilmemiş görüşmeler (adayı silinmemiş olanlar).
export function degerlendirmeBekleyenler(gorusmeler: readonly Gorusme[], bugun: string, adayVar: (id: string | undefined) => boolean): Gorusme[] {
  return gorusmeler.filter((g) => g.durum === 'Planlandı' && gecerliTarih(g.tarih) && g.tarih < bugun && adayVar(g.candId));
}
export const degerlendirilebilir = (g: Gorusme, bugun: string): boolean => g.durum === 'Planlandı' && gecerliTarih(g.tarih) && g.tarih <= bugun;

// Görüşmeci önerilerinin sayısı, öneri sırasıyla.
export function oneriSayilari(gorusmeler: readonly Gorusme[], adayId: string, oneriler: readonly string[]): { oneri: string; sayi: number }[] {
  const m = new Map<string, number>();
  for (const g of adayGorusmeleri(gorusmeler, adayId)) if (g.oneri && tamamlandiMi(g)) m.set(g.oneri, (m.get(g.oneri) ?? 0) + 1);
  return oneriler.filter((o) => m.has(o)).map((o) => ({ oneri: o, sayi: m.get(o) ?? 0 }));
}

// Kanban oku: asama listesinde bir ileri ya da geri.
export function asamaKaydir(asamalar: readonly string[], a: Pick<Aday, 'asama'>, yon: 1 | -1): string {
  const i = asamalar.indexOf(asamasi(a));
  return asamalar[Math.max(0, Math.min(asamalar.length - 1, i + yon))] ?? asamasi(a);
}

// Görüşme planlanınca süreçteki aday en az "Ön görüşme" (telefon) ya da "Mülakat" aşamasına geçer; geri gitmez.
export function gorusmeSonrasiAsama(asamalar: readonly string[], aday: Aday, gorusmeTuru: string | undefined): string | null {
  if (!surecteMi(aday)) return null;
  const hedef = gorusmeTuru === 'Telefon ön görüşmesi' ? 'Ön görüşme' : 'Mülakat';
  return asamalar.indexOf(asamasi(aday)) < asamalar.indexOf(hedef) ? hedef : null;
}

export interface IseAlimOzeti {
  acik: number; onayBekleyen: number; surecte: number; yediGun: number; bekleyen: number; ortalamaSure: number | null; kabulOrani: number | null;
}
export function iseAlimOzeti(pozisyonlar: readonly Pozisyon[], adaylar: readonly Aday[], gorusmeler: readonly Gorusme[], bugun: string, adayVar: (id: string | undefined) => boolean): IseAlimOzeti {
  const yedi = gunEkle(bugun, 7);
  const alinan = adaylar.filter((a) => a.asama === ISE_ALINDI && gecerliTarih(a.basvuruTarihi) && gecerliTarih(a.iseAlimTarihi));
  const sure = alinan.map((a) => gunFarki(a.basvuruTarihi, a.iseAlimTarihi) ?? 0);
  const kabul = adaylar.filter((a) => a.teklifYanit === 'Kabul etti').length;
  const ret = adaylar.filter((a) => a.teklifYanit === 'Reddetti').length;
  return {
    acik: pozisyonlar.filter((p) => p.durum === 'Açık').length,
    onayBekleyen: pozisyonlar.filter((p) => p.durum === 'Onay bekliyor').length,
    surecte: adaylar.filter(surecteMi).length,
    yediGun: gorusmeler.filter((g) => g.durum === 'Planlandı' && gecerliTarih(g.tarih) && g.tarih >= bugun && g.tarih <= yedi).length,
    bekleyen: degerlendirmeBekleyenler(gorusmeler, bugun, adayVar).length,
    ortalamaSure: sure.length ? Math.round(sure.reduce((a, b) => a + b, 0) / sure.length) : null,
    kabulOrani: kabul + ret ? Math.round((kabul / (kabul + ret)) * 100) : null,
  };
}

// Pozisyonda bir kriterin adayın tamamlanan görüşmelerindeki ortalaması (karşılaştırma tablosu ve karne).
export function kriterOrtalamasi(gorusmeler: readonly Gorusme[], kriter: string): number | null {
  const l = gorusmeler.filter(tamamlandiMi).map((g) => sayi(g.skorlar?.[kriter])).filter((x) => x > 0);
  return l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
}

/* ---------------- Pozisyon ve ilan ---------------- */

export interface DurumGecisi { hedef: string; etiket: string; birincil: boolean }
export const POZISYON_GECISLERI: Readonly<Record<string, readonly DurumGecisi[]>> = {
  Taslak: [{ hedef: 'Onay bekliyor', etiket: 'Onaya gönder', birincil: false }],
  'Onay bekliyor': [{ hedef: 'Açık', etiket: 'Onayla ve yayına hazırla', birincil: true }, { hedef: 'Taslak', etiket: 'Taslağa geri al', birincil: false }],
  Açık: [{ hedef: 'Beklemede', etiket: 'Durdur', birincil: false }, { hedef: 'Kapandı', etiket: 'Kapat', birincil: false }],
  Beklemede: [{ hedef: 'Açık', etiket: 'Yeniden aç', birincil: true }, { hedef: 'Kapandı', etiket: 'Kapat', birincil: false }],
  Kapandı: [{ hedef: 'Açık', etiket: 'Yeniden aç', birincil: false }],
};
export const pozisyonDurumu = (p: Pick<Pozisyon, 'durum'>): string => p.durum || 'Taslak';
export function pozisyonDurumRozeti(durum: string | undefined): { etiket: string; ton: RozetTonu } {
  const d = durum || 'Taslak';
  if (d === 'Açık') return { etiket: 'Açık (yayında)', ton: 'tamam' };
  if (d === 'Beklemede' || d === 'Onay bekliyor') return { etiket: d, ton: 'uyari' };
  if (d === 'Taslak') return { etiket: d, ton: 'bilgi' };
  return { etiket: d, ton: 'pasif' };
}
export const yayindakiKanalSayisi = (p: Pozisyon): number => Object.values(p.yayinlar ?? {}).filter((y) => y?.durum === 'Yayında').length;

// Pozisyonlar: açıklar önce, sonra açılışı yeni olan.
export const siraliPozisyonlar = (l: readonly Pozisyon[]): Pozisyon[] =>
  [...l].sort((a, b) => (a.durum === 'Açık' ? 0 : 1) - (b.durum === 'Açık' ? 0 : 1) || (b.acilis ?? '').localeCompare(a.acilis ?? ''));

// Durum değişimi: Açık'a geçen pozisyonun açılış tarihi yoksa bugün yazılır.
export function durumDegistir(p: Pozisyon, hedef: string, bugun: string): Pozisyon {
  return { ...p, durum: hedef, ...(hedef === 'Açık' && !p.acilis ? { acilis: bugun } : {}) };
}

export interface YayinBilgisi { tarih: string; bitis: string; link: string; not: string }
// Kanal yayında işaretlenince taslak, onay bekleyen ya da beklemedeki pozisyon açılır (bugünkü kural).
export function yayindaIsaretle(p: Pozisyon, kanalId: string, b: YayinBilgisi, bugun: string): { pozisyon: Pozisyon; acildi: boolean } {
  const yayinlar = { ...(p.yayinlar ?? {}), [kanalId]: { durum: 'Yayında', tarih: b.tarih, bitis: b.bitis, link: b.link, not: b.not } };
  const acildi = ['Taslak', 'Onay bekliyor', 'Beklemede'].includes(pozisyonDurumu(p));
  return { pozisyon: { ...p, yayinlar, ...(acildi ? { durum: 'Açık', acilis: p.acilis || bugun } : {}) }, acildi };
}
export function yayindanKaldir(p: Pozisyon, kanalId: string, bugun: string): Pozisyon {
  const eski = p.yayinlar?.[kanalId] ?? {};
  return { ...p, yayinlar: { ...(p.yayinlar ?? {}), [kanalId]: { ...eski, durum: 'Kapandı', kapanis: bugun } as typeof eski } };
}

export interface IlanKanali { id: string; ad: string; url?: string; kod?: string; aktif?: boolean }
// Kaydedilmiş özel metin kanala özgü ilan kodu ve izleme ekiyle (bugünkü kural); özel metin yoksa motorun metni.
export function kanalMetni(
  p: Pozisyon, k: IlanKanali | null, sablon: (p: Pozisyon, k: IlanKanali | null) => string, izleme: (url: string, p: Pozisyon, k: IlanKanali | null) => string, kariyerSayfasi: string,
): string {
  if (!p.ozelMetin) return sablon(p, k);
  let m = p.ilanKodu ? p.ozelMetin.split(p.ilanKodu).join(p.ilanKodu + (k?.kod ? `-${k.kod}` : '')) : p.ozelMetin;
  const link = p.basvuruLink || kariyerSayfasi;
  if (link) m = m.split(link).join(izleme(link, p, k));
  return m;
}

// Kopya pozisyon: yeni kimlik, taslak, yayınsız, yeni ilan kodu ve tarih; özel metin taşınmaz.
export function pozisyonKopyasi(p: Pozisyon, kimlik: string, ilanKodu: string, bugun: string): Pozisyon {
  const { ozelMetin: _o, ...geri } = p;
  return { ...geri, id: kimlik, durum: 'Taslak', yayinlar: {}, acilis: bugun, ilanKodu, sonBasvuru: gunEkle(bugun, 30), baslik: `${p.baslik ?? ''} (kopya)` };
}

// "Yerine pozisyon aç" ve İşe al ön dolumu: adayın bilgileri personel formuna (sözleşmedeki alan listesi).
export function iseGirisTaslagi(a: Aday, p: Pozisyon | undefined, bugun: string): Partial<Personel> {
  const baslar = a.baslayabilir && a.baslayabilir > bugun ? a.baslayabilir : bugun;
  const brut = a.teklifUcret || a.maasBeklentisi;
  return {
    ad: a.ad ?? '', soyad: a.soyad ?? '', telefon: a.telefon ?? '', kisiselEposta: a.eposta ?? '', il: a.il ?? '', pozisyon: p?.baslik ?? '',
    departmanId: p?.departmanId ?? '', iseGiris: baslar, egitim: a.egitim ?? '', okul: a.okul ?? '', yabanciDil: a.yabanciDil ?? '',
    ...(brut ? { brutMaas: brut } : {}),
  } as Partial<Personel>;
}

/* ---------------- Soru bankası ---------------- */

export interface SoruSeti { id: string; ad: string; kategori?: string; odak?: string; sorular: string }
const soruSetiMi = (x: unknown): x is SoruSeti => typeof x === 'object' && x !== null && typeof (x as SoruSeti).id === 'string';
// Ayarlarda liste yoksa motorun varsayılan setleri.
export function soruSetleri(ayarlar: Readonly<Record<string, unknown>>, varsayilan: readonly unknown[]): SoruSeti[] {
  const l = Array.isArray(ayarlar['soruSetleri']) ? ayarlar['soruSetleri'] : varsayilan;
  return l.filter(soruSetiMi);
}
// Seçilen setin pozisyonda olmayan soruları eklenir.
export function sorulariEkle(mevcut: string, set: SoruSeti): string {
  const var_ = new Set(satirlar(mevcut));
  return [...satirlar(mevcut), ...satirlar(set.sorular).filter((s) => !var_.has(s))].join('\n');
}
