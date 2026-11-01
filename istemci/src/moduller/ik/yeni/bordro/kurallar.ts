import type { Kayit, Personel } from '../tipler.ts';
import type { AySonucu, BordroGirdileri, BordroSonucu, OtoGun } from './motor-yuzu.ts';

// P3'ün saf kuralları (205 a): bordro toplamları, taslak, kesinleştirme girdisi, toplu ücret güncellemesi, dışa aktarma satırları,
// ayar taslağı ve parametre dönemi denetimleri. Ekran ve motor bilmez; hepsi birim testlidir.

export const sayi = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const kurus = (v: number): number => Math.round(v * 100) / 100;

export const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;
export const ayMetni = (ay: string): string => `${AYLAR[Number(ay.slice(5, 7)) - 1] ?? ''} ${ay.slice(0, 4)}`;

/* ---------------- bordro tablosu ---------------- */

export interface BordroToplami { brut: number; ek: number; mesai: number; yan: number; toplam: number; kes: number; gv: number; dv: number; net: number; mal: number; tes: number }

export function bordroToplami(sonuclar: readonly AySonucu[]): BordroToplami {
  const t: BordroToplami = { brut: 0, ek: 0, mesai: 0, yan: 0, toplam: 0, kes: 0, gv: 0, dv: 0, net: 0, mal: 0, tes: 0 };
  for (const m of sonuclar) {
    t.brut += m.aylik; t.ek += m.ek; t.mesai += m.mesaiUcret; t.toplam += m.toplam; t.kes += m.sgk + m.iss; t.gv += m.gv; t.dv += m.dv;
    t.net += m.banka; t.mal += m.maliyet; t.yan += m.yanTutar; t.tes += m.tInd;
  }
  return t;
}

export type BordroAlani = 'brut' | 'gun' | 'ek' | 'mesaiSaat' | 'tatilSaat' | 'kesinti';
export type Taslak = Readonly<Record<string, Readonly<Record<string, BordroGirdileri>>>>;

// Hücre değişince kişinin taslağı, motorun girdisinin üzerine yazılır (boş hücre 0 sayılır, bugünkü ekran gibi).
export function taslagaYaz(taslak: Taslak, ay: string, personel: string, oto: BordroGirdileri | null, alan: BordroAlani, deger: string): Taslak {
  const r = oto ?? { brut: 0, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 };
  const onceki = taslak[ay]?.[personel];
  const satir: BordroGirdileri = {
    brut: r.brut, ...(r.gun === undefined ? {} : { gun: r.gun }), ek: r.ek, mesaiSaat: r.mesaiSaat, tatilSaat: r.tatilSaat, kesinti: r.kesinti, ...onceki,
  };
  const yeni = { ...satir, [alan]: deger === '' ? 0 : sayi(deger) };
  return { ...taslak, [ay]: { ...taslak[ay], [personel]: yeni } };
}

export function taslakSil(taslak: Taslak, ay: string): Taslak {
  const { [ay]: _sil, ...kalan } = taslak;
  return kalan;
}

export const taslakVar = (taslak: Taslak, ay: string): boolean => Object.keys(taslak[ay] ?? {}).length > 0;

export type BordroDurumu =
  | { tur: 'taslak-degisti' } | { tur: 'duzeltme' } | { tur: 'kesin' } | { tur: 'kismi'; kesin: number; toplam: number } | { tur: 'taslak' };

export function bordroDurumu(o: { taslakVar: boolean; kilitAcik: boolean; kesin: number; toplam: number }): BordroDurumu {
  if (o.taslakVar) return { tur: 'taslak-degisti' };
  if (o.kilitAcik) return { tur: 'duzeltme' };
  if (o.kesin && o.kesin === o.toplam) return { tur: 'kesin' };
  if (o.kesin) return { tur: 'kismi', kesin: o.kesin, toplam: o.toplam };
  return { tur: 'taslak' };
}

// Kesinleştir düğmesi: ay tam kesinse, kilit açılmamışsa ve taslak yoksa görünmez.
export const kesinlestirGorunur = (o: { kesin: number; toplam: number; kilitAcik: boolean; taslakVar: boolean }): boolean =>
  !(o.kesin === o.toplam && o.toplam > 0 && !o.kilitAcik && !o.taslakVar);

// Kesinleştirmede girdiler gider; tutarları sunucu motorla yeniden hesaplar (veri.ts bordroGirdisi).
export function kesinlestirmeKayitlari(ay: string, satirlar: readonly (readonly [Personel, BordroSonucu])[]): Kayit[] {
  return satirlar.map(([p, s]) => ({
    id: `pay_${p.id}_${ay}`, kind: 'pay', empId: p.id, donem: ay,
    brut: sayi(s.inp.brut), gun: s.gun, ek: sayi(s.inp.ek), mesaiSaat: sayi(s.inp.mesaiSaat), tatilSaat: sayi(s.inp.tatilSaat), kesinti: sayi(s.inp.kesinti),
  }));
}

export interface OnayDurumu { onaylayan: { empId: string; zaman: string }[]; onaylamayan: string[]; toplam: number }

// Bordro onayı (IK-43): yalnız kesinleşmiş kayıtlar sayılır.
export function onayDurumu(kayitlar: readonly Kayit[]): OnayDurumu | null {
  const kesin = kayitlar.filter((k) => k['snap']);
  if (!kesin.length) return null;
  const onaylayan = kesin.filter((k) => k['gordum']).map((k) => ({ empId: String(k['empId'] ?? ''), zaman: String(k['gordum']) }));
  const onaylamayan = kesin.filter((k) => !k['gordum']).map((k) => String(k['empId'] ?? ''));
  return { onaylayan, onaylamayan, toplam: kesin.length };
}

/* ---------------- toplu ücret güncellemesi ---------------- */

export type ZamYontemi = 'yuzde' | 'sabit' | 'min';
export const ZAM_NEDENLERI = ['Yıllık zam', 'Enflasyon farkı', 'Asgari ücret artışı', 'Terfi', 'Performans', 'Görev değişikliği', 'Düzeltme'] as const;

export function yeniUcret(mevcut: number, yontem: ZamYontemi, deger: number, yuvarla: number): number {
  const yuvar = (g: number) => (yuvarla ? Math.ceil(g / yuvarla) * yuvarla : kurus(g));
  if (yontem === 'yuzde') return yuvar(mevcut * (1 + deger / 100));
  if (yontem === 'sabit') return yuvar(mevcut + deger);
  return Math.max(mevcut, deger);
}

type UcretSatiri = NonNullable<Personel['ucretGecmisi']>[number];

// Motorun salaryAt kuralı: geçmiş yoksa brutMaas, varsa tarihe kadarki son kayıt (ilk kayıttan önceyse ilk kayıt).
export function ucretTarihte(p: Pick<Personel, 'ucretGecmisi' | 'brutMaas'>, tarih: string): number {
  const h = [...(p.ucretGecmisi ?? [])].sort((a, b) => a.tarih.localeCompare(b.tarih));
  if (!h.length) return sayi(p.brutMaas);
  let r = h[0] as UcretSatiri;
  for (const x of h) if (x.tarih <= tarih) r = x;
  return sayi(r.brut);
}

// Ücret geçmişine yürürlük tarihli satır eklenir (aynı tarihli olanın yerine); brutMaas bugünkü ücrete eşitlenir.
export function ucretEkle(p: Personel, tarih: string, brut: number, neden: string, not: string | null, bugun: string): Personel {
  let h: UcretSatiri[] = [...(p.ucretGecmisi ?? [])];
  if (!h.length) h = [{ tarih: p.iseGiris || '2000-01-01', brut: sayi(p.brutMaas), neden: 'İşe giriş' }];
  h = h.filter((s) => s.tarih !== tarih);
  h.push({ tarih, brut: kurus(brut), neden, ...(not ? { not } : {}) });
  h.sort((a, b) => a.tarih.localeCompare(b.tarih));
  const r: Personel = { ...p, ucretGecmisi: h };
  return { ...r, brutMaas: ucretTarihte(r, bugun) };
}

// Yürürlük tarihinin varsayılanı gelecek ayın ilk günü.
export function gelecekAyBasi(bugun: string): string {
  const y = Number(bugun.slice(0, 4)); const a = Number(bugun.slice(5, 7));
  return a === 12 ? `${y + 1}-01-01` : `${y}-${String(a + 1).padStart(2, '0')}-01`;
}

/* ---------------- dışa aktarma ---------------- */

// MUHSGK eksik gün nedeni: 01 istirahat, 13 ücretsiz izin, 12 birden fazla neden.
export function eksikGunNedeni(gun: number, oto: Pick<OtoGun, 'rapor' | 'ucretsiz'>): string {
  if (gun >= 30) return '';
  if (oto.rapor && oto.ucretsiz) return '12';
  if (oto.rapor) return '01';
  if (oto.ucretsiz) return '13';
  return '';
}

export const BORDRO_LISTESI_BASLIKLARI = [
  'Çalışan', 'Sicil', 'Departman', 'Prim günü', 'Aylık brüt', 'Gün karşılığı brüt', 'Prim / ek ödeme', 'Fazla mesai', 'Yemek yardımı', 'Yol yardımı',
  'Toplam brüt', 'Prime esas kazanç', 'SGK işçi', 'İşsizlik işçi', 'Gelir vergisi matrahı', 'Gelir vergisi', 'Damga vergisi', 'BES', 'Diğer kesinti',
  'Net (yan haklar dahil)', 'Kart / ayni ödemeler', 'Bankaya ödenecek', 'SGK işveren (teşviksiz)', 'Teşvik', 'Teşvik indirimi', 'SGK işveren',
  'İşsizlik işveren', 'İşveren maliyeti',
] as const;

export function bordroListesiSatiri(ad: string, sicil: string, departman: string, n: AySonucu): (string | number)[] {
  return [
    ad, sicil, departman, n.gun, n.aylik, n.brut, n.ek, n.mesaiUcret, n.yemek ? n.yemek.tutar : 0, n.yol ? n.yol.tutar : 0, n.toplam, n.sgkMatrah,
    n.sgk, n.iss, n.matrah, n.gv, n.dv, n.bes, n.kesinti, n.net, n.ayni, n.banka, n.isvBrut, n.tesvik ? n.tesvik.ad : '', n.tInd, n.isvSgk, n.isvIss,
    n.maliyet,
  ];
}

export const MUHSGK_BASLIKLARI = [
  'T.C. kimlik no', 'Ad', 'Soyad', 'SGK sicil no', 'Belge türü', 'Kanun no', 'Prim günü', 'Eksik gün', 'Eksik gün nedeni', 'Hak edilen ücret',
  'Prim, ikramiye ve benzeri', 'Prime esas kazanç', 'İşe giriş', 'İşten çıkış', 'Çıkış nedeni kodu', 'GV matrahı', 'Hesaplanan GV',
  'Asgari ücret GV istisnası', 'Kesilecek GV', 'Hesaplanan DV', 'Asgari ücret DV istisnası', 'Kesilecek DV',
] as const;

const gunAyYil = (t: string): string => (/^\d{4}-\d{2}-\d{2}/.test(t) ? `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}` : '');

export function muhsgkSatiri(ay: string, p: Personel, n: AySonucu, oto: OtoGun, cikisKodu: string): (string | number)[] {
  const neden = eksikGunNedeni(n.gun, oto);
  const buAy = (t: string | undefined): t is string => Boolean(t?.startsWith(ay));
  return [
    p.tckn ?? '', p.ad ?? '', p.soyad ?? '', p.sgkNo ?? '', '1', n.tesvik?.kanunNo ?? '', n.gun, n.gun < 30 && neden ? 30 - n.gun : '', neden,
    n.brut + n.mesaiUcret, n.ek, n.sgkMatrah, buAy(p.iseGiris) ? gunAyYil(p.iseGiris) : '', buAy(p.cikisTarihi) ? gunAyYil(p.cikisTarihi) : '',
    buAy(p.cikisTarihi) ? cikisKodu : '', n.matrah, n.gvHam, n.gvIst, n.gv, n.dvHam, n.dvIst, n.dv,
  ];
}

export const FIS_BASLIKLARI = ['Hesap kodu', 'Hesap adı', 'Açıklama', 'Borç', 'Alacak'] as const;
export interface FisHesaplari { hesapGider: string; hesapPersonel: string; hesapVergi: string; hesapSgk: string; hesapDiger: string }
export type FisSatiri = [string, string, string, number | '', number | ''];

// Muhasebe fişi: gider hesabı departmandan (yoksa ayardan); borç ve alacak dengesi son satırda yazılır.
export function muhasebeFisi(ay: string, h: FisHesaplari, satirlar: readonly { giderHesabi: string | undefined; departman: string; n: AySonucu }[]): FisSatiri[] {
  const ad = ayMetni(ay);
  const gider = new Map<string, { brut: number; isv: number; d: Set<string> }>();
  const t = { net: 0, gv: 0, dv: 0, sgk: 0, iss: 0, isvSgk: 0, isvIss: 0, bes: 0, kes: 0 };
  for (const { giderHesabi, departman, n } of satirlar) {
    const kod = giderHesabi || h.hesapGider;
    const g = gider.get(kod) ?? { brut: 0, isv: 0, d: new Set<string>() };
    g.brut += n.toplam; g.isv += n.isvSgk + n.isvIss; g.d.add(departman); gider.set(kod, g);
    t.net += n.net; t.gv += n.gv; t.dv += n.dv; t.sgk += n.sgk; t.iss += n.iss; t.isvSgk += n.isvSgk; t.isvIss += n.isvIss; t.bes += n.bes; t.kes += n.kesinti;
  }
  const r: FisSatiri[] = [];
  for (const [kod, g] of gider) {
    const d = [...g.d].filter((x) => x && x !== '—').join(', ');
    const ek = d ? ` (${d})` : '';
    r.push([kod, 'Ücret giderleri', `${ad} brüt ücret, prim ve yan haklar${ek}`, kurus(g.brut), '']);
    r.push([kod, 'SGK işveren payları', `${ad} SGK ve işsizlik işveren payı, teşvik sonrası${ek}`, kurus(g.isv), '']);
  }
  r.push([h.hesapPersonel, 'Personele borçlar', `${ad} net ücretler`, '', kurus(t.net)]);
  r.push([h.hesapVergi, 'Ödenecek vergi ve fonlar', `${ad} gelir vergisi kesintisi`, '', kurus(t.gv)]);
  r.push([h.hesapVergi, 'Ödenecek vergi ve fonlar', `${ad} damga vergisi kesintisi`, '', kurus(t.dv)]);
  r.push([h.hesapSgk, 'Ödenecek sosyal güvenlik kesintileri', `${ad} SGK ve işsizlik işçi payı`, '', kurus(t.sgk + t.iss)]);
  r.push([h.hesapSgk, 'Ödenecek sosyal güvenlik kesintileri', `${ad} SGK ve işsizlik işveren payı`, '', kurus(t.isvSgk + t.isvIss)]);
  if (t.bes) r.push([h.hesapDiger, 'Ödenecek diğer yükümlülükler', `${ad} BES kesintisi`, '', kurus(t.bes)]);
  if (t.kes) r.push([h.hesapDiger, 'Ödenecek diğer yükümlülükler', `${ad} diğer kesintiler (avans, icra vb.)`, '', kurus(t.kes)]);
  const borc = r.reduce((s, x) => s + (x[3] === '' ? 0 : x[3]), 0);
  const alacak = r.reduce((s, x) => s + (x[4] === '' ? 0 : x[4]), 0);
  r.push(['', 'TOPLAM', Math.abs(borc - alacak) < 0.05 ? 'Fiş dengeli' : 'Fark var, kontrol edin', kurus(borc), kurus(alacak)]);
  return r;
}

/* ---------------- vergi dilimleri ---------------- */

export interface DilimSatiri { alt: number; ust: number | null; oran: number; birikmis: number | null }

// "Kayıtlı tarifenin özeti": her dilimin sonuna kadar toplam vergi; son dilimde sınır yoktur.
export function dilimOzeti(dilimler: readonly (readonly [number, number])[]): DilimSatiri[] {
  let alt = 0; let toplam = 0;
  return dilimler.map(([sinir, oran]) => {
    const ust = sinir === Infinity ? null : sinir;
    const dilimVergisi = ust === null ? null : (ust - alt) * oran / 100;
    const satir: DilimSatiri = { alt, ust, oran, birikmis: dilimVergisi === null ? null : toplam + dilimVergisi };
    if (dilimVergisi !== null && ust !== null) { toplam += dilimVergisi; alt = ust; }
    return satir;
  });
}

/* ---------------- ayarlar ---------------- */

export interface DonemKaydi { id: string; ad: string; baslangic: string; not?: string; params: Record<string, unknown> }

// Ayar formundaki değer: sayı kutusu boşsa '' kalır (bugünkü ekran gibi), değilse sayı.
export function ayarDegeri(tur: 'sayi' | 'metin' | 'isaret', ham: string | boolean): unknown {
  if (tur === 'isaret') return Boolean(ham);
  if (tur === 'sayi') return ham === '' ? '' : sayi(ham);
  return ham;
}

export type AyarKaydi = { tur: 'tamam'; govde: Record<string, unknown>; donemli: boolean } | { tur: 'kilitli' };

// Taslaktaki dönem anahtarları seçili dönemin parametrelerine, ötekiler genel ayara yazılır. Kayıtlı dönem listesi yoksa
// motorun varsayılan dönemleri de ayara yazılır (sonraki kayıtta dönemler kaybolmasın).
export function ayarKaydiKur(o: {
  ayarlar: Record<string, unknown>; taslak: Readonly<Record<string, unknown>>; donemAnahtarlari: readonly string[];
  donemler: readonly DonemKaydi[]; seciliDonem: string; seciliKilitli: boolean;
}): AyarKaydi {
  const govde: Record<string, unknown> = { ...o.ayarlar };
  const donemli: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o.taslak)) (o.donemAnahtarlari.includes(k) ? donemli : govde)[k] = v;
  const kopya = (): DonemKaydi[] => structuredClone([...o.donemler]);
  if (Object.keys(donemli).length) {
    if (o.seciliKilitli) return { tur: 'kilitli' };
    const d = kopya();
    const r = d.find((x) => x.id === o.seciliDonem);
    if (r) r.params = { ...r.params, ...structuredClone(donemli) };
    govde['donemler'] = d;
    return { tur: 'tamam', govde, donemli: true };
  }
  const kayitli = o.ayarlar['donemler'];
  if (!Array.isArray(kayitli) || !kayitli.length) govde['donemler'] = kopya();
  return { tur: 'tamam', govde, donemli: false };
}

// Yeni dönem en erken bu ayın başında ya da son kesinleşmiş bordronun ertesi ayında başlar.
export function enErkenDonem(bugun: string, kesinAylar: readonly string[]): string {
  let e = `${bugun.slice(0, 7)}-01`;
  const son = [...kesinAylar].sort().pop();
  if (son) {
    const sonraki = gelecekAyBasi(`${son}-01`);
    if (sonraki > e) e = sonraki;
  }
  return e;
}

export type DonemDenetimi = { tur: 'tamam'; baslangic: string; duzeltildi: boolean } | { tur: 'hata'; ileti: string };

export function yeniDonemDenetle(baslangic: string, enErken: string, mevcut: readonly DonemKaydi[], tarihMetni: (t: string) => string): DonemDenetimi {
  if (!baslangic) return { tur: 'hata', ileti: 'Başlangıç tarihi girin.' };
  const duzeltildi = !baslangic.endsWith('-01');
  const b = duzeltildi ? `${baslangic.slice(0, 8)}01` : baslangic;
  if (b < enErken) return { tur: 'hata', ileti: `Dönem en erken ${tarihMetni(enErken)} başlayabilir; geçmişe dönük dönem açılamaz.` };
  if (mevcut.some((d) => d.baslangic === b)) return { tur: 'hata', ileti: 'Bu tarihte başlayan bir dönem zaten var.' };
  return { tur: 'tamam', baslangic: b, duzeltildi };
}

// Dönem silinebilir mi: henüz başlamamış, kilitsiz ve tek dönem değil.
export const donemSilinir = (durum: { k: string; lock: string }, adet: number): boolean => durum.k === 'future' && !durum.lock && adet > 1;

export interface IceAktarimSonucu { eklenen: DonemKaydi[]; atlanan: string[] }

// Dönem dosyası (dizi ya da { donemler }): geçersiz, aynı tarihli ve geçmişe dönük dönemler atlanır; mevcutlar değişmez.
export function donemleriIceAl(veri: unknown, enErken: string, mevcut: readonly DonemKaydi[], kimlik: () => string, parametreSec: (p: Record<string, unknown>) => Record<string, unknown>): IceAktarimSonucu | null {
  const liste: unknown = Array.isArray(veri) ? veri : (veri && typeof veri === 'object' ? (veri as { donemler?: unknown }).donemler : null);
  if (!Array.isArray(liste)) return null;
  const tarihler = new Set(mevcut.map((d) => d.baslangic));
  const eklenen: DonemKaydi[] = []; const atlanan: string[] = [];
  for (const o of liste as unknown[]) {
    const d = (o && typeof o === 'object' ? o : {}) as { ad?: unknown; baslangic?: unknown; not?: unknown; params?: unknown };
    const b = String(d.baslangic ?? '');
    const ad = typeof d.ad === 'string' && d.ad ? d.ad : '';
    if (!/^\d{4}-\d{2}-01$/.test(b) || !d.params || typeof d.params !== 'object') { atlanan.push(`${ad || '?'}: geçersiz`); continue; }
    if (tarihler.has(b)) { atlanan.push(`${ad || b}: bu tarihte dönem var`); continue; }
    if (b < enErken) { atlanan.push(`${ad || b}: geçmişe dönük`); continue; }
    const yeni: DonemKaydi = { id: kimlik(), ad: ad || `Dönem ${b}`, baslangic: b, not: String(d.not ?? ''), params: parametreSec(d.params as Record<string, unknown>) };
    tarihler.add(b); eklenen.push(yeni);
  }
  return { eklenen, atlanan };
}

export type ListeAdi = 'primler' | 'tesvikler' | 'ilanKanallari';

export function yeniListeSatiri(liste: ListeAdi, kimlik: (on: string) => string): Record<string, unknown> {
  if (liste === 'primler') return { id: kimlik('p'), ad: 'Yeni prim', tur: 'sabit', deger: 0, siklik: 'her', aylar: '', atama: 'yok', kidem: false };
  if (liste === 'ilanKanallari') return { id: kimlik('k'), ad: 'Yeni kanal', url: 'https://', kod: '', aktif: true };
  return { id: kimlik('t'), ad: 'Yeni teşvik', tur: 'puan', deger: 0, kanunNo: '' };
}

// Silinen prim ya da teşvikin kişiye özel ayarı olan personel sayısı (silmeden önce sorulur).
export function listeKullanimi(liste: ListeAdi, satirKimligi: string, personel: readonly Personel[]): number {
  if (liste === 'ilanKanallari') return 0;
  if (liste === 'tesvikler') return personel.filter((p) => p.tesvikId === satirKimligi).length;
  return personel.filter((p) => p.primler?.[satirKimligi]).length;
}
