import type { AlanHatalari } from '../../../../ortak/veri/form.ts';
import { tarih } from '../bicim.ts';
import { ikBicimi } from '../motor.ts';
import type { Departman, Devam, Egitim, Izin, Performans, Personel } from '../tipler.ts';

export type UcretSatiri = NonNullable<Personel['ucretGecmisi']>[number];
export type Hareket = NonNullable<Personel['hareketler']>[number];

// Personel ekranlarının saf kuralları: tarih karşılaştırmaları GGGG-AA-GG metniyle yapılır, "bugün" dışarıdan gelir.

const iki = (n: number) => String(n).padStart(2, '0');
export const gunMetni = (d: Date) => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
export const bugun = () => gunMetni(new Date());

// Belgelerde ve kişi sayfasında uzun tarih ("3 Ekim 2026", motorun biçimi); motor yoksa kısa biçim.
export const uzunTarih = (v: unknown): string => ikBicimi()?.fmtDate(v) ?? tarih(v);

export function gunTarihi(s: string | null | undefined): Date | null {
  const m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function gunEkle(s: string, n: number): string {
  const d = gunTarihi(s);
  if (!d) return s;
  d.setDate(d.getDate() + n);
  return gunMetni(d);
}

// Ayın son gününü aşmaz (31 Ocak + 1 ay = 28/29 Şubat).
export function ayEkle(s: string, n: number): string {
  const d = gunTarihi(s);
  if (!d) return s;
  const gun = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(gun, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return gunMetni(d);
}

export const sayi = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const kucuk = (s: unknown) => String(s ?? '').toLocaleLowerCase('tr');
// Türkçe harfleri sadeleştirir: içe aktarma başlığı ve departman adı eşleşmesi için.
export const sade = (s: unknown) => kucuk(s).replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c] ?? c);

export const adSoyadMetni = (p: Pick<Personel, 'ad' | 'soyad'> | null | undefined) => (p ? (`${p.ad ?? ''} ${p.soyad ?? ''}`.trim() || 'İsimsiz') : '');

/* ---------------- süre ve durum ---------------- */

function tamYil(a: Date, b: Date): number {
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y -= 1;
  return y;
}

export function sureParcalari(bas: string, bit: string): { yil: number; ay: number; gun: number } {
  const a = gunTarihi(bas);
  const b = gunTarihi(bit);
  if (!a || !b || b < a) return { yil: 0, ay: 0, gun: 0 };
  const yil = tamYil(a, b);
  let c = ayEkle(bas, 12 * yil);
  let ay = 0;
  while (ayEkle(c, 1) <= bit) { c = ayEkle(c, 1); ay += 1; }
  const gc = gunTarihi(c) ?? a;
  return { yil, ay, gun: Math.round((b.getTime() - gc.getTime()) / 864e5) };
}

export function sureMetni(bas: string, bit: string): string {
  const p = sureParcalari(bas, bit);
  const out: string[] = [];
  if (p.yil) out.push(`${p.yil} yıl`);
  if (p.ay) out.push(`${p.ay} ay`);
  if (!p.yil && !p.ay) out.push(`${p.gun} gün`);
  return out.join(' ');
}

// Kıdem: işe girişten çıkışa (çıkış yoksa bugüne).
export const kidemMetni = (p: Personel, gun: string): string | null => (p.iseGiris ? sureMetni(p.iseGiris, p.cikisTarihi || gun) : null);

export function aktifMi(p: Personel | null | undefined, gun: string): boolean {
  if (!p) return false;
  if (p.iseGiris && p.iseGiris.slice(0, 10) > gun) return false;
  const c = p.cikisTarihi ? p.cikisTarihi.slice(0, 10) : '';
  if (c && c < gun) return false;
  if (p.durum === 'Ayrıldı' && (!c || c < gun)) return false;
  return true;
}

export type PersonelDurumu = 'Başlayacak' | 'Ayrıldı' | 'Ücretsiz izinde' | 'İzinde' | 'Deneme süresinde' | 'Aktif';
export const DURUM_TONU = {
  Başlayacak: 'bilgi', Ayrıldı: 'pasif', 'Ücretsiz izinde': 'uyari', İzinde: 'bilgi', 'Deneme süresinde': 'uyari', Aktif: 'tamam',
} as const satisfies Record<PersonelDurumu, 'bilgi' | 'pasif' | 'uyari' | 'tamam'>;

export function personelDurumu(p: Personel, izinler: readonly Izin[], gun: string): PersonelDurumu {
  if (!aktifMi(p, gun)) return p.iseGiris && p.iseGiris.slice(0, 10) > gun ? 'Başlayacak' : 'Ayrıldı';
  if (p.durum === 'Ücretsiz izinde') return 'Ücretsiz izinde';
  if (izinler.some((l) => l.empId === p.id && l.durum === 'Onaylandı' && (l.baslangic ?? '') <= gun && (l.bitis ?? '') >= gun)) return 'İzinde';
  if (p.denemeBitis && p.denemeBitis.slice(0, 10) >= gun) return 'Deneme süresinde';
  return 'Aktif';
}

/* ---------------- liste ---------------- */

// Önce aktifler, sonra ada göre (bugünkü ekranın varsayılan sırası).
export function siraliPersonel(liste: readonly Personel[], gun: string): Personel[] {
  return [...liste].sort((a, b) => Number(aktifMi(b, gun)) - Number(aktifMi(a, gun)) || adSoyadMetni(a).localeCompare(adSoyadMetni(b), 'tr'));
}

export const siraliDepartman = (liste: readonly Departman[]) => [...liste].sort((a, b) => (a.ad ?? '').localeCompare(b.ad ?? '', 'tr'));

export type DurumSuzgeci = 'aktif' | 'pasif' | 'tum';
export interface PersonelSuzgeci {
  durum: DurumSuzgeci;
  departman: string;
  sozlesme: string;
  yaka: string;
  kademe: string;
  belge: '' | 'eksik';
  arama: string;
}
export const BOS_SUZGEC: PersonelSuzgeci = { durum: 'aktif', departman: '', sozlesme: '', yaka: '', kademe: '', belge: '', arama: '' };

export interface SuzmeBaglami {
  gun: string;
  // Yaka, kademe ve eksik belge motorun sabitlerinden gelir; motor yokken süzgeç uygulanmaz.
  yaka?: (p: Personel) => string;
  kademe?: (p: Personel) => string;
  eksikBelge?: (p: Personel) => readonly string[];
}

export function personelSuz(liste: readonly Personel[], s: PersonelSuzgeci, b: SuzmeBaglami): Personel[] {
  const q = kucuk(s.arama).trim();
  return liste.filter((p) => {
    if (s.durum !== 'tum' && aktifMi(p, b.gun) !== (s.durum === 'aktif')) return false;
    if (s.departman && p.departmanId !== s.departman) return false;
    if (s.sozlesme && p.sozlesmeTuru !== s.sozlesme) return false;
    if (s.yaka && b.yaka && b.yaka(p) !== s.yaka) return false;
    if (s.kademe && b.kademe && b.kademe(p) !== s.kademe) return false;
    if (s.belge === 'eksik' && b.eksikBelge && b.eksikBelge(p).length === 0) return false;
    if (q && !kucuk([adSoyadMetni(p), p.sicilNo, p.pozisyon, p.tckn, p.eposta, p.telefon].join(' ')).includes(q)) return false;
    return true;
  });
}

export type PersonelSiraAlani = 'ad' | 'sicil' | 'dept' | 'giris' | 'izin';

export function personelSirala(
  liste: readonly Personel[], alan: PersonelSiraAlani, yon: 'artan' | 'azalan',
  b: { departmanAdi: (id: string | undefined) => string; kalanIzin?: (p: Personel) => number | null },
): Personel[] {
  const anahtar = (p: Personel): string | number => {
    switch (alan) {
      case 'sicil': return Number.parseInt(p.sicilNo ?? '', 10) || 0;
      case 'dept': return b.departmanAdi(p.departmanId);
      case 'giris': return p.iseGiris ?? '';
      case 'izin': return b.kalanIzin?.(p) ?? Number.NEGATIVE_INFINITY;
      default: return adSoyadMetni(p);
    }
  };
  const k = yon === 'artan' ? 1 : -1;
  return [...liste].sort((a, c) => {
    const x = anahtar(a);
    const y = anahtar(c);
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'tr')) * k;
  });
}

/* ---------------- organizasyon ---------------- */

// Şema yalnız aktif personelin "bağlı olduğu yönetici" alanından çıkar; yöneticisi aktif değilse kişi köke düşer.
export function orgAgaci(aktifler: readonly Personel[]): { kokler: Personel[]; altlar: Map<string, Personel[]> } {
  const kimlikler = new Set(aktifler.map((p) => p.id));
  const altlar = new Map<string, Personel[]>();
  const kokler: Personel[] = [];
  for (const p of aktifler) {
    const y = p.yoneticiId && kimlikler.has(p.yoneticiId) && p.yoneticiId !== p.id ? p.yoneticiId : '';
    if (!y) { kokler.push(p); continue; }
    const l = altlar.get(y) ?? [];
    l.push(p);
    altlar.set(y, l);
  }
  // Döngüdeki kişiler (A, B'ye; B, A'ya bağlı) köke ulaşamaz: kök listesine eklenir ki şemada kaybolmasınlar.
  const ulasilan = new Set<string>();
  const gez = (p: Personel) => {
    if (ulasilan.has(p.id)) return;
    ulasilan.add(p.id);
    (altlar.get(p.id) ?? []).forEach(gez);
  };
  kokler.forEach(gez);
  for (const p of aktifler) if (!ulasilan.has(p.id)) { kokler.push(p); gez(p); }
  return { kokler, altlar };
}

/* ---------------- ücret ---------------- */

export const ucretGecmisi = (p: Personel): UcretSatiri[] => [...(Array.isArray(p.ucretGecmisi) ? p.ucretGecmisi : [])]
  .sort((a, b) => (a.tarih ?? '').localeCompare(b.tarih ?? ''));

export function ucretTarihte(p: Personel, gun: string): number {
  const h = ucretGecmisi(p);
  const ilk = h[0];
  if (!ilk) return sayi(p.brutMaas);
  let r = ilk;
  for (const x of h) if (x.tarih <= gun) r = x;
  return sayi(r.brut);
}

export const ZAM_NEDENLERI = ['Yıllık zam', 'Enflasyon farkı', 'Asgari ücret artışı', 'Terfi', 'Performans', 'Görev değişikliği', 'Düzeltme'] as const;

// Aynı tarihli satır yenisiyle değişir; brüt ücret alanı bugün geçerli ücrete çekilir.
export function ucretUygula(p: Personel, tarih: string, brut: number, neden: string, not: string, gun: string): Personel {
  let h = ucretGecmisi(p);
  if (h.length === 0) h = [{ tarih: p.iseGiris || '2000-01-01', brut: sayi(p.brutMaas), neden: 'İşe giriş' }];
  h = h.filter((x) => x.tarih !== tarih);
  h.push({ tarih, brut: Math.round(brut * 100) / 100, neden, ...(not ? { not } : {}) });
  h.sort((a, b) => a.tarih.localeCompare(b.tarih));
  const n: Personel = { ...p, ucretGecmisi: h };
  return { ...n, brutMaas: ucretTarihte(n, gun) };
}

// Yalnız ileri tarihli (planlı) satır silinir.
export function ucretSil(p: Personel, tarih: string, gun: string): Personel {
  const n: Personel = { ...p, ucretGecmisi: ucretGecmisi(p).filter((x) => x.tarih !== tarih) };
  return { ...n, brutMaas: ucretTarihte(n, gun) };
}

export function sonrakiZam(p: Personel, gun: string): UcretSatiri | null {
  return ucretGecmisi(p).find((x) => x.tarih > gun) ?? null;
}

// Önceki satıra göre yüzde değişim; önceki yoksa ya da sıfırsa null.
export function ucretDegisimi(h: readonly UcretSatiri[], i: number): number | null {
  const onceki = h[i - 1];
  const bu = h[i];
  if (!onceki || !bu || !sayi(onceki.brut)) return null;
  return Math.round((sayi(bu.brut) / sayi(onceki.brut) - 1) * 1000) / 10;
}

/* ---------------- kayıt öncesi düzen (bugünkü form davranışı) ---------------- */

export const IZLENEN_ALANLAR = [
  ['pozisyon', 'Pozisyon'], ['departmanId', 'Departman', 'dept'], ['yoneticiId', 'Yönetici', 'emp'], ['sozlesmeTuru', 'Sözleşme türü'],
  ['calismaSekli', 'Çalışma şekli'], ['kademe', 'Rol kademesi'], ['yakaTipi', 'Yaka tipi'], ['durum', 'Durum'],
] as const;

// Görev, departman, yönetici, sözleşme ve çalışma şekli değişikliği kişinin zaman çizelgesine yazılır (son 200 satır).
export function hareketleriIzle(
  eski: Personel, yeni: Personel, b: { departmanAdi: (id: string) => string; personelAdi: (id: string) => string; gun: string },
): Hareket[] | undefined {
  const goster = (tur: string | undefined, v: string | undefined) => {
    if (!v) return '';
    if (tur === 'dept') return b.departmanAdi(v);
    if (tur === 'emp') return b.personelAdi(v);
    return v;
  };
  const yeniler = IZLENEN_ALANLAR
    .filter(([k]) => (eski[k] || '') !== (yeni[k] || ''))
    .map(([k, l, t]) => ({ tarih: b.gun, alan: l, eski: goster(t, eski[k]), yeni: goster(t, yeni[k]) }));
  return yeniler.length ? [...(eski.hareketler ?? []), ...yeniler].slice(-200) : undefined;
}

export function sonrakiSicil(personeller: readonly Personel[]): string {
  return String(Math.max(1000, ...personeller.map((x) => Number.parseInt(x.sicilNo ?? '', 10) || 0)) + 1);
}

// İşe girişten ayarlardaki deneme süresi kadar sonra, bir gün önce biter.
export const denemeBitisi = (iseGiris: string, denemeAy: number) => gunEkle(ayEkle(iseGiris, denemeAy || 2), -1);

export interface KayitBaglami {
  gun: string;
  personeller: readonly Personel[];
  denemeAy: number;
  bolum: string | null;
  departmanAdi: (id: string) => string;
  personelAdi: (id: string) => string;
  yakaTahmini?: (pozisyon: string) => string;
  kademeTahmini?: (pozisyon: string) => string;
}

export function personelKayitOncesi(onceki: Personel | null, veri: Personel, b: KayitBaglami): Personel {
  const d: Personel = { ...veri };
  if (onceki) {
    const h = hareketleriIzle(onceki, d, b);
    if (h) d.hareketler = h;
  }
  if (!onceki && sayi(d.brutMaas) && !(d.ucretGecmisi ?? []).length) {
    d.ucretGecmisi = [{ tarih: d.iseGiris || b.gun, brut: sayi(d.brutMaas), neden: 'İşe giriş' }];
  }
  // Ücret alanı elle değişince geçerli ücret satırı düzeltilir; ileri tarihli satırlar kalır.
  if (onceki && sayi(onceki.brutMaas) !== sayi(d.brutMaas) && (d.ucretGecmisi ?? []).length) {
    const h = ucretGecmisi(d);
    let gecerli = -1;
    h.forEach((x, i) => { if (x.tarih <= b.gun) gecerli = i; });
    const g = h[gecerli];
    if (g) { h[gecerli] = { ...g, brut: sayi(d.brutMaas), not: 'Düzeltme' }; d.ucretGecmisi = h; }
  }
  if (d.pozisyon && !d.yakaTipi && b.yakaTahmini) d.yakaTipi = b.yakaTahmini(d.pozisyon);
  if (d.pozisyon && !d.kademe && b.kademeTahmini) d.kademe = b.kademeTahmini(d.pozisyon);
  if (d.iseGiris && !d.denemeBitis && (!b.bolum || b.bolum === 'İş')) d.denemeBitis = denemeBitisi(d.iseGiris, b.denemeAy);
  if (d.cikisTarihi && d.cikisTarihi <= b.gun) d.durum = 'Ayrıldı';
  if (!d.cikisTarihi && d.durum === 'Ayrıldı' && b.bolum === 'Ayrılış') d.durum = 'Aktif';
  if (!onceki && !d.sicilNo) d.sicilNo = sonrakiSicil(b.personeller);
  if (!onceki && d.besKatilim === undefined && d.dogumTarihi) {
    const dt = gunTarihi(d.dogumTarihi);
    const bt = gunTarihi(b.gun);
    if (dt && bt && tamYil(dt, bt) < 45) d.besKatilim = true;
  }
  return d;
}

/* ---------------- doğrulama ---------------- */

// T.C. kimlik, IBAN ve performans etiketi motorun biçim yardımcılarındandır (ikBicimi); burada kopyası yazılmaz. Motor yoksa
// biçim denetimi atlanır, denetim sunucudadır.
export const tcknGecerli = (t: string): boolean => ikBicimi()?.validTCKN(t) ?? true;
export const ibanGecerli = (ham: string): boolean => ikBicimi()?.validIBAN(ham) ?? true;
export const ibanBicimi = (ham: string | undefined): string => ikBicimi()?.fmtIBAN(String(ham ?? '')) ?? String(ham ?? '');
export const epostaGecerli = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export interface AlanKurali { k: keyof Personel & string; zorunlu?: boolean; tur?: string }

export function personelDogrula(veri: Personel, alanlar: readonly AlanKurali[], personeller: readonly Personel[]): AlanHatalari {
  const h: AlanHatalari = {};
  for (const f of alanlar) {
    const v = veri[f.k];
    const bos = v === '' || v === undefined || v === null;
    if (f.zorunlu && bos) h[f.k] = 'Bu alan zorunlu.';
    else if (f.tur === 'tckn' && !bos && !tcknGecerli(String(v))) h[f.k] = 'Geçerli bir T.C. kimlik numarası girin (11 hane).';
    else if (f.tur === 'iban' && !bos && !ibanGecerli(String(v))) h[f.k] = 'Geçerli bir TR IBAN girin (26 karakter).';
    else if (f.tur === 'email' && !bos && !epostaGecerli(String(v))) h[f.k] = 'Geçerli bir e-posta adresi girin.';
  }
  const baska = personeller.filter((x) => x.id !== veri.id);
  if (!h.sicilNo && veri.sicilNo && baska.some((x) => x.sicilNo === veri.sicilNo)) h.sicilNo = 'Bu sicil numarası başka bir personelde kayıtlı.';
  if (!h.cikisTarihi && veri.cikisTarihi && veri.iseGiris && veri.cikisTarihi < veri.iseGiris) h.cikisTarihi = 'Çıkış tarihi işe girişten önce olamaz.';
  if (!h.tckn && veri.tckn && baska.some((x) => x.tckn === veri.tckn)) h.tckn = 'Bu kimlik numarası başka bir personelde kayıtlı.';
  return h;
}

/* ---------------- özlük belgeleri, çıkış listesi, notlar ---------------- */

export const belgeListesi = (ayar: string | undefined) => String(ayar ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

export function belgeIsaretle(p: Personel, belge: string, isaretli: boolean, gun: string): Personel {
  return { ...p, belgeler: { ...(p.belgeler ?? {}), [belge]: isaretli ? { ok: true, tarih: gun } : { ok: false } } };
}

export const CIKIS_ADIMLARI = [
  ['sgk', 'SGK işten ayrılış bildirgesi verildi', 'Çıkış tarihinden itibaren 10 gün içinde e-Bildirge ile verilir; geç bildirime idari para cezası uygulanır.'],
  ['bordro', 'Son ay ücreti ve kullanılmayan izin ücreti ödendi', 'Çalışılan günler ve izin ücreti son bordroda gösterilir.'],
  ['tazminat', 'Kıdem ve ihbar tazminatı ödendi', 'Hak varsa fesihte hemen ödenir; geciken kıdem tazminatına mevduata uygulanan en yüksek faiz işler.'],
  ['zimmet', 'Zimmetler iade alındı', ''],
  ['belge', 'Çalışma belgesi verildi', 'İşçinin talebi olmasa da verilmesi önerilir (md. 28).'],
  ['ibra', 'İbraname imzalandı', 'Fesihten en az 1 ay sonra, ödemeler banka yoluyla yapılmışsa geçerlidir (TBK md. 420).'],
  ['erisim', 'Sistem, e-posta ve bina erişimleri kapatıldı', ''],
  ['gorusme', 'Çıkış görüşmesi yapıldı', 'Ayrılma nedenini anlamak için kısa bir görüşme yapın ve notlara ekleyin.'],
] as const;

export function cikisAdimi(p: Personel, adim: string, isaretli: boolean, gun: string): Personel {
  const ck = { ...(p.cikisListesi ?? {}) };
  if (isaretli) ck[adim] = gun;
  else delete ck[adim];
  return { ...p, cikisListesi: ck };
}

export const cikisIlerlemesi = (p: Personel) => CIKIS_ADIMLARI.filter(([k]) => (p.cikisListesi ?? {})[k]).length;

// Çıkış tarihinden sonraya düşen onaylı ya da bekleyen izin (çıkış kaydında uyarı).
export const cikistanSonrakiIzinler = (p: Personel, izinler: readonly Izin[]) => (p.cikisTarihi
  ? izinler.filter((l) => l.empId === p.id && (l.durum === 'Onaylandı' || l.durum === 'Beklemede') && (l.baslangic ?? '') > (p.cikisTarihi ?? '')).length
  : 0);

export const notEkle = (p: Personel, metin: string, zaman: string): Personel => ({ ...p, notlar: [...(p.notlar ?? []), { t: zaman, m: metin }] });
export const notSil = (p: Personel, t: string): Personel => ({ ...p, notlar: (p.notlar ?? []).filter((n) => n.t !== t) });
export const siraliNotlar = (p: Personel) => [...(p.notlar ?? [])].sort((a, b) => (b.t ?? '').localeCompare(a.t ?? ''));

/* ---------------- kişi özetindeki sayılar ---------------- */

// Puanlanmamış değerlendirmede null (motor 0 der; veri yoksa sıfır yazılmaz).
export function performansOrtalamasi(p: Performans): number | null {
  const o = ikBicimi()?.perfAvg(p);
  return o ? o : null;
}

const PERF_TONU: Readonly<Record<string, 'tamam' | 'bilgi' | 'uyari' | 'hata'>> = { ok: 'tamam', info: 'bilgi', warn: 'uyari', bad: 'hata' };
export function performansEtiketi(o: number | null): [string, 'tamam' | 'bilgi' | 'uyari' | 'hata' | 'pasif'] {
  const e = ikBicimi()?.perfLabel(o ?? 0);
  if (!e || !o) return ['Puanlanmadı', 'pasif'];
  return [e[0], PERF_TONU[e[1]] ?? 'pasif'];
}

export const MESAI_TURLERI = ['Fazla mesai', 'Hafta tatili çalışması'] as const;
export function yillikFazlaMesai(personel: string, devam: readonly Devam[], yil: string): number {
  return devam
    .filter((a) => a.empId === personel && (a.tarih ?? '').startsWith(yil) && (MESAI_TURLERI as readonly string[]).includes(a.tur ?? ''))
    .reduce((s, a) => s + sayi(a.saat), 0);
}

export const tamamlananEgitimSaati = (egitimler: readonly Egitim[]) => egitimler.filter((t) => t.durum === 'Tamamlandı').reduce((s, t) => s + sayi(t.sure), 0);

/* ---------------- zaman çizelgesi ---------------- */

export type OlayTuru = 'giris' | 'ucret' | 'hareket' | 'izin' | 'perf' | 'egitim' | 'not' | 'kayit' | 'cikis';
export interface Olay { tarih: string; tur: OlayTuru; baslik: string; alt: string; ton: 'tamam' | 'bilgi' | 'hata' | '' }

export interface CizelgeBaglami {
  gun: string;
  izinler: readonly Izin[];
  performanslar: readonly Performans[];
  egitimler: readonly Egitim[];
  gecmis: readonly { t: string; op: string; rid: string; by?: { name: string }; changes: readonly { f: string }[] }[];
  departmanAdi: (id: string) => string;
  alanAdi: (alan: string) => string;
  para: (v: number) => string;
  kisaTarih: (v: string) => string;
}

export function zamanCizelgesi(p: Personel, b: CizelgeBaglami): Olay[] {
  const ev: Olay[] = [];
  const ekle = (tarih: string | undefined, tur: OlayTuru, baslik: string, alt: string, ton: Olay['ton'] = '') => {
    if (tarih) ev.push({ tarih: tarih.slice(0, 10), tur, baslik, alt, ton });
  };
  const sayiMetni = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  ekle(p.iseGiris, 'giris', 'İşe giriş', [p.pozisyon, p.departmanId ? b.departmanAdi(p.departmanId) : ''].filter(Boolean).join(', '), 'tamam');
  const h = ucretGecmisi(p);
  h.forEach((x, i) => {
    if (i === 0 && x.neden === 'İşe giriş') return;
    const fark = ucretDegisimi(h, i);
    ekle(x.tarih, 'ucret', `Ücret: ${b.para(sayi(x.brut))}`, `${x.neden ?? ''}${fark === null ? '' : ` (${fark >= 0 ? '+' : ''}${sayiMetni(fark)}%)`}`, x.tarih > b.gun ? 'bilgi' : '');
  });
  (p.hareketler ?? []).forEach((m) => ekle(m.tarih, 'hareket', `${m.alan} değişti`, `${m.eski || '—'} → ${m.yeni || '—'}`, 'bilgi'));
  b.izinler.filter((l) => l.empId === p.id && l.durum === 'Onaylandı')
    .forEach((l) => ekle(l.baslangic, 'izin', l.tur ?? 'İzin', `${b.kisaTarih(l.baslangic ?? '')} – ${b.kisaTarih(l.bitis ?? '')}, ${sayiMetni(sayi(l.gun))} gün`));
  b.performanslar.filter((x) => x.empId === p.id).forEach((x) => {
    const o = performansOrtalamasi(x);
    ekle(x.tarih, 'perf', `Performans: ${x.donem ?? ''}`, o === null ? '' : `${sayiMetni(Math.round(o * 100) / 100)} / 5`);
  });
  b.egitimler.filter((t) => (t.katilimcilar ?? []).includes(p.id) && t.durum === 'Tamamlandı')
    .forEach((t) => ekle(t.tarih, 'egitim', `Eğitim: ${t.ad ?? ''}`, t.sure ? `${sayiMetni(sayi(t.sure))} saat` : ''));
  (p.notlar ?? []).forEach((n) => ekle(n.t, 'not', 'Not', n.m.length > 90 ? `${n.m.slice(0, 90)}…` : n.m));
  b.gecmis.filter((l) => l.rid === p.id && l.op === 'guncelle' && l.changes.length).forEach((l) => {
    const adlar = l.changes.slice(0, 3).map((c) => b.alanAdi(c.f)).join(', ');
    ekle(l.t, 'kayit', `Kayıt güncellendi: ${adlar}${l.changes.length > 3 ? '…' : ''}`, l.by?.name ? `Değiştiren: ${l.by.name}` : '');
  });
  if (p.cikisTarihi) ekle(p.cikisTarihi, 'cikis', 'İşten çıkış', (p.cikisKodu ?? '').replace(/^\d+\s/, ''), 'hata');
  return ev.sort((a, c) => c.tarih.localeCompare(a.tarih));
}

/* ---------------- kişinin yerine pozisyon ---------------- */

// Pozisyon formunun ön dolu alanları: ücret aralığının üstü %15 fazlası, bine yuvarlı; son başvuru 30 gün sonra.
export function yerinePozisyonTaslagi(p: Personel, brut: number, gun: string) {
  return {
    baslik: p.pozisyon ?? '', departmanId: p.departmanId ?? '', gerekce: 'Ayrılan çalışanın yerine', yerineId: p.id,
    talepEdenId: p.yoneticiId ?? '', calismaSekli: p.calismaSekli || 'Ofis', ucretMin: brut || undefined,
    ucretMax: brut ? Math.round((brut * 1.15) / 1000) * 1000 : undefined, sonBasvuru: gunEkle(gun, 30),
  };
}
