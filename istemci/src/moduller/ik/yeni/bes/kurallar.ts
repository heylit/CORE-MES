import type { BesTuru, IkBesHareketi } from '#paylasilan/sozlesme/ik-bes.ts';
import type { Personel } from '../tipler.ts';

// BES hareketi (kart 1939). Sunucu `GET /ik/bes` ile kişiye göre süzülmüş hareketleri verir; durum burada, son geçerli hareketten çıkar.
export type { BesTuru };
// İstemci zod'lu sözleşmeyi değer olarak almaz; listeler burada, tip sözleşmeyle aynı kalmaya zorlanır.
export const BES_GIRIS_TURLERI = ['otomatik_katilim', 'gonullu_katilim'] as const satisfies readonly BesTuru[];
export const BES_CIKIS_TURLERI = ['cayma', 'ayrilma', 'isten_cikis'] as const satisfies readonly BesTuru[];
type Eksik = Exclude<BesTuru, (typeof BES_GIRIS_TURLERI)[number] | (typeof BES_CIKIS_TURLERI)[number]>;
const eksikYok: [Eksik] extends [never] ? true : never = true;
void eksikYok;

export const BES_TUR_ADI: Readonly<Record<BesTuru, string>> = {
  otomatik_katilim: 'Otomatik katılım',
  gonullu_katilim: 'Gönüllü katılım',
  cayma: 'Cayma (2 ay içinde)',
  ayrilma: 'Ayrılma',
  isten_cikis: 'İşten çıkışla sona erme',
};

export type BesHareketi = IkBesHareketi;

export type BesDurumu = 'bes' | 'cikti' | 'hic';
export interface BesSatiri {
  personel: Personel;
  durum: BesDurumu;
  giris: BesHareketi | null;
  cikis: BesHareketi | null;
  // Otomatik katılımda cayma hakkının son günü; başka durumda null.
  caymaSonu: string | null;
}

export const girisMi = (t: BesTuru): boolean => (BES_GIRIS_TURLERI as readonly string[]).includes(t);

// Cayma süresi otomatik katılımdan sonra 2 aydır (VARSAYIM: OKS kuralı, mevzuat metniyle doğrulanmadı; sunucu da aynı kuralı uygular).
export const CAYMA_AYI = 2;
export function ayEkle(gun: string, ay: number): string {
  const [y, a, g] = gun.split('-').map(Number) as [number, number, number];
  const toplam = y * 12 + (a - 1) + ay;
  const yy = Math.floor(toplam / 12);
  const aa = (toplam % 12) + 1;
  const sonGun = new Date(Date.UTC(yy, aa, 0)).getUTCDate();
  return `${String(yy).padStart(4, '0')}-${String(aa).padStart(2, '0')}-${String(Math.min(g, sonGun)).padStart(2, '0')}`;
}

const sira = (a: BesHareketi, b: BesHareketi): number => (a.tarih === b.tarih ? a.id - b.id : a.tarih < b.tarih ? -1 : 1);

export function besSatiri(personel: Personel, hareketler: readonly BesHareketi[]): BesSatiri {
  const gecerli = hareketler.filter((h) => h.personel === personel.id && !h.iptal).sort(sira);
  const son = gecerli.at(-1) ?? null;
  if (!son) return { personel, durum: 'hic', giris: null, cikis: null, caymaSonu: null };
  const giris = [...gecerli].reverse().find((h) => girisMi(h.tur)) ?? null;
  if (girisMi(son.tur)) {
    return { personel, durum: 'bes', giris: son, cikis: null, caymaSonu: son.tur === 'otomatik_katilim' ? ayEkle(son.tarih, CAYMA_AYI) : null };
  }
  return { personel, durum: 'cikti', giris, cikis: son, caymaSonu: null };
}

export interface BesSuzgeci { ara: string; durum: '' | BesDurumu; ayrilanlar: boolean }
const kucuk = (s: string): string => s.toLocaleLowerCase('tr');

export function besSatirlari(personeller: readonly Personel[], hareketler: readonly BesHareketi[], s: BesSuzgeci, gun: string): BesSatiri[] {
  const ara = kucuk(s.ara.trim());
  return personeller
    .filter((p) => s.ayrilanlar || !p.cikisTarihi || p.cikisTarihi >= gun)
    .map((p) => besSatiri(p, hareketler))
    .filter((r) => !s.durum || r.durum === s.durum)
    .filter((r) => !ara || kucuk(`${r.personel.ad ?? ''} ${r.personel.soyad ?? ''} ${r.personel.sicilNo ?? ''}`).includes(ara))
    .sort((a, b) => `${a.personel.ad ?? ''} ${a.personel.soyad ?? ''}`.localeCompare(`${b.personel.ad ?? ''} ${b.personel.soyad ?? ''}`, 'tr'));
}

// Cayma süresi 15 gün içinde dolacak olanlar: İK çalışana hatırlatır.
export const CAYMA_UYARI_GUNU = 15;
export function caymaYaklasanlar(satirlar: readonly BesSatiri[], gun: string): BesSatiri[] {
  const sinir = new Date(`${gun}T00:00:00Z`);
  sinir.setUTCDate(sinir.getUTCDate() + CAYMA_UYARI_GUNU);
  const ust = sinir.toISOString().slice(0, 10);
  return satirlar.filter((r) => r.caymaSonu !== null && r.caymaSonu >= gun && r.caymaSonu <= ust);
}

// Otomatik katılım 45 yaşını doldurmamış çalışan içindir (VARSAYIM: 4632 sayılı Kanun ek 2; mevzuat metniyle doğrulanmadı).
export const OTOMATIK_YAS_SINIRI = 45;
export function otomatikKapsamda(p: Personel, gun: string): boolean | null {
  if (!p.dogumTarihi) return null;
  return ayEkle(p.dogumTarihi.slice(0, 10), OTOMATIK_YAS_SINIRI * 12) > gun;
}

export interface BesOzeti { bes: number; cikti: number; hic: number }
export function besOzeti(satirlar: readonly BesSatiri[]): BesOzeti {
  return {
    bes: satirlar.filter((r) => r.durum === 'bes').length,
    cikti: satirlar.filter((r) => r.durum === 'cikti').length,
    hic: satirlar.filter((r) => r.durum === 'hic').length,
  };
}

// Formun istemci denetimi; aynı kurallar sunucuda da vardır (ekran yalnız erken uyarır).
export interface BesGirdisi { personel: string; tur: BesTuru | ''; tarih: string; oran: string; sirket: string; aciklama: string }
export function besGirdisiDenetle(g: BesGirdisi, durum: BesSatiri | null, gun: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (!g.personel) h['personel'] = 'Personel seçin.';
  if (!g.tur) h['tur'] = 'Hareket türünü seçin.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.tarih)) h['tarih'] = 'Tarih girin.';
  else if (g.tarih > gun) h['tarih'] = 'İleri tarihli hareket girilmez.';
  if (g.aciklama.length > 300) h['aciklama'] = 'En çok 300 karakter.';
  if (g.sirket.length > 120) h['sirket'] = 'En çok 120 karakter.';
  if (!g.tur || !durum) return h;
  if (girisMi(g.tur)) {
    if (durum.durum === 'bes') h['tur'] = 'Personel zaten BES\'te; önce çıkışını girin.';
    else if (durum.cikis && g.tarih && g.tarih < durum.cikis.tarih) h['tarih'] = 'Hareket tarihi son hareketin tarihinden önce olamaz.';
    if (g.oran.trim() !== '') {
      const oran = Number(g.oran.replace(',', '.'));
      if (!Number.isFinite(oran) || oran <= 0 || oran > 100) h['oran'] = 'Oran 0 ile 100 arasında olmalı.';
    }
  } else {
    if (durum.durum !== 'bes') h['tur'] = 'Personel BES\'te değil; çıkış girilemez.';
    else if (durum.giris && g.tarih && g.tarih < durum.giris.tarih) h['tarih'] = 'Çıkış tarihi giriş tarihinden önce olamaz.';
    if (g.tur === 'cayma' && durum.durum === 'bes') {
      if (durum.giris?.tur !== 'otomatik_katilim') h['tur'] = 'Cayma yalnız otomatik katılımda vardır; Ayrılma seçin.';
      else if (durum.caymaSonu && g.tarih > durum.caymaSonu) h['tur'] = 'Cayma süresi dolmuş; Ayrılma seçin.';
    }
  }
  return h;
}
