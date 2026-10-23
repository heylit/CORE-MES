import { adSoyad, tarih } from '../bicim.ts';
import type { Aday, Bordro, Departman, Devam, Egitim, Gorusme, Izin, Personel, Pozisyon } from '../tipler.ts';
import type { IkYetkisi } from '../yetki.ts';
import type { YardimDugumu, YardimKonusu } from './yardim.ts';

// --- Kılavuz araması ---------------------------------------------------------------------------------------------------

// Aramada Türkçe harfler düz harfe iner ("kidem" "kıdem"i bulur); uzunluk korunur, böylece eşleşmenin yeri asıl metinde de doğrudur.
const DUZ: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const yardimDuzle = (s: string): string => s.toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => DUZ[c] ?? c);

export const dugumMetni = (d: YardimDugumu): string =>
  typeof d === 'string' ? d : d.slice(2).map((c) => dugumMetni(c as YardimDugumu)).join(' ');

export const aramaTerimleri = (q: string): string[] => yardimDuzle(q).split(/\s+/).filter((t) => t.length > 1);

export interface MetinParcasi { metin: string; vurgu: boolean }

// Metni terimlerin geçtiği yerlerde böler; vurgulu parçalar ekranda işaretlenir.
export function vurgula(metin: string, terimler: readonly string[]): MetinParcasi[] {
  if (!terimler.length) return [{ metin, vurgu: false }];
  const duz = yardimDuzle(metin);
  const araliklar: [number, number][] = [];
  for (const t of terimler) {
    let p = 0;
    for (let i = duz.indexOf(t, p); i >= 0; i = duz.indexOf(t, p)) { araliklar.push([i, i + t.length]); p = i + t.length; }
  }
  araliklar.sort((a, b) => a[0] - b[0]);
  const out: MetinParcasi[] = [];
  let son = 0;
  for (const [a, b] of araliklar) {
    if (a < son) continue;
    if (a > son) out.push({ metin: metin.slice(son, a), vurgu: false });
    out.push({ metin: metin.slice(a, b), vurgu: true });
    son = b;
  }
  if (son < metin.length) out.push({ metin: metin.slice(son), vurgu: false });
  return out;
}

export interface YardimSonucu { konu: YardimKonusu; parca: MetinParcasi[] }

// Başlık 6, anahtar sözcük ve kategori 3, metin 1 puan; her terim bir yerde geçmeli. Özet parçası ilk terimin çevresidir.
export function yardimAra(konular: readonly YardimKonusu[], q: string): YardimSonucu[] {
  const terimler = aramaTerimleri(q);
  if (!terimler.length) return [];
  const dizin = konular.map((konu) => {
    const ham = `${konu.ozet} ${konu.govde.map(dugumMetni).join(' ')}`.replace(/\s+/g, ' ');
    return { konu, ham, t: yardimDuzle(konu.baslik), k: yardimDuzle(`${konu.sozcukler} ${konu.kategori}`), b: yardimDuzle(ham) };
  });
  const puanli: { x: (typeof dizin)[number]; puan: number }[] = [];
  for (const x of dizin) {
    let puan = 0;
    let tamam = true;
    for (const t of terimler) {
      const p = (x.t.includes(t) ? 6 : 0) + (x.k.includes(t) ? 3 : 0) + (x.b.includes(t) ? 1 : 0);
      if (!p) { tamam = false; break; }
      puan += p;
    }
    if (tamam) puanli.push({ x, puan });
  }
  return puanli.sort((a, b) => b.puan - a.puan).map(({ x }) => {
    const i = x.b.indexOf(terimler[0]!);
    const bas = Math.max(0, i - 60);
    let parca = x.ham.slice(bas, bas + 170);
    if (bas > 0) parca = `…${parca}`;
    if (bas + 170 < x.ham.length) parca += '…';
    // Bugünkü ekran gibi: parçada yalnız eşleşen son terim işaretlenir (makalenin içinde bütün terimler işaretlenir).
    const isaretli = [...terimler].reverse().find((t) => yardimDuzle(parca).includes(t));
    return { konu: x.konu, parca: vurgula(parca, isaretli ? [isaretli] : []) };
  });
}

// --- Ortak: tarih ve sayı ----------------------------------------------------------------------------------------------
// Tarih alanları 'YYYY-AA-GG' metnidir; hesaplar yerel gece yarısıyla yapılır (bugünkü ekranla aynı).

const ik2 = (n: number): string => String(n).padStart(2, '0');
export const tarihOku = (s: unknown): Date | null => {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
export const gunMetni = (d: Date): string => `${d.getFullYear()}-${ik2(d.getMonth() + 1)}-${ik2(d.getDate())}`;
export const gunEkle = (d: Date, n: number): Date => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const ayEkle = (d: Date, n: number): Date => {
  const x = new Date(d);
  const gun = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  x.setDate(Math.min(gun, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
};
export const gunFarki = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 864e5);
export const tamYil = (a: Date, b: Date): number => {
  let y = b.getFullYear() - a.getFullYear();
  if (b.getMonth() < a.getMonth() || (b.getMonth() === a.getMonth() && b.getDate() < a.getDate())) y--;
  return y;
};
const sonrakiYildonumu = (s: unknown, from: Date): Date | null => {
  const d = tarihOku(s);
  if (!d) return null;
  const x = new Date(from.getFullYear(), d.getMonth(), d.getDate());
  return x < from ? new Date(from.getFullYear() + 1, d.getMonth(), d.getDate()) : x;
};
export const sayiOku = (v: unknown): number => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
export const sayiYaz = (v: number): string => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(v || 0);
const satirlar = (v: unknown): string[] => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
export const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'] as const;

export function goreliGun(d: Date, bugun: Date): string {
  const n = gunFarki(bugun, d);
  if (n === 0) return 'Bugün';
  if (n === 1) return 'Yarın';
  if (n === -1) return 'Dün';
  return n > 0 ? `${n} gün sonra` : `${-n} gün önce`;
}

// --- Girdi: kayıtlar ve motor ------------------------------------------------------------------------------------------
// Alanlar ik-modulu veri modelindedir ve hepsi isteğe bağlıdır; burada yalnız bu parçanın okuduğu alanlar yazılır.

export interface AnalizVerisi {
  personel: readonly Personel[];
  departmanlar: readonly Departman[];
  izinler: readonly Izin[];
  devam: readonly Devam[];
  egitimler: readonly Egitim[];
  gorusmeler: readonly Gorusme[];
  adaylar: readonly Aday[];
  pozisyonlar: readonly Pozisyon[];
  bordrolar: readonly Bordro[];
  // Görev durumu (ertele, gizle) ayarlarda tutulur.
  gorevDurumu: Readonly<Record<string, { ertele?: string; gizle?: boolean } | undefined>>;
}

// Motorun bu parçada kullanılan yüzü: hesaplar motorda kalır, burada yeniden yazılmaz.
export interface AnalizMotoru {
  aktifMi(p: Personel, tarih?: Date): boolean;
  izinBakiyesi(p: Personel): { kalan: number; sonrakiGun: number };
  eksikBelgeler(p: Personel): readonly string[];
  guncelBrut(p: Personel): number;
  aydaCalisiyor(p: Personel, yil: number, ay: number): boolean;
  yaka(p: Personel): string;
  kademe(p: Personel): string;
  yakalar: readonly string[];
  kademeler: readonly string[];
  // Parametre dönemlerinin başlangıçları ('YYYY-AA-GG').
  donemBaslangiclari(): readonly string[];
  // Geçerli ayar (dönem parametresi dahil, varsayılanla).
  ayar(anahtar: string): unknown;
}

// Uzun tarih ("5 Ekim 2026"): bugünkü ekranın olay ve görev metinlerinde geçer; iskeletin bicim.ts'inde yok.
export function uzunTarih(s: string | null | undefined): string {
  const d = tarihOku(s);
  return d ? `${d.getDate()} ${AYLAR[d.getMonth()]} ${d.getFullYear()}` : '—';
}

const adayAdi = (c: Aday | null | undefined): string => (c ? (`${c.ad ?? ''} ${c.soyad ?? ''}`.trim() || 'İsimsiz aday') : '—');

function dizin<T extends { id: string }>(xs: readonly T[]): Map<string, T> { return new Map(xs.map((x) => [x.id, x])); }

export function say<T>(xs: readonly T[], f: (x: T) => string | null | undefined): [string, number][] {
  const m = new Map<string, number>();
  for (const x of xs) { const k = f(x) || 'Belirtilmemiş'; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const aktifler = (v: AnalizVerisi, m: AnalizMotoru): Personel[] =>
  v.personel.filter((p) => m.aktifMi(p)).sort((a, b) => adSoyad(a).localeCompare(adSoyad(b), 'tr'));

// Değerlendirmesi girilmemiş görüşme: planlı ve tarihi geçmiş.
export const degerlendirmesizGorusmeler = (v: AnalizVerisi, bugun: Date): Gorusme[] => {
  const adaylar = dizin(v.adaylar);
  return v.gorusmeler.filter((i) => { const d = tarihOku(i.tarih); return i.durum === 'Planlandı' && d !== null && d < bugun && adaylar.has(i.candId ?? ''); });
};

// Geçerli İSG eğitimi kaydı olmayan aktif çalışanlar.
export function isgEksikler(v: AnalizVerisi, m: AnalizMotoru, bugun: Date): Personel[] {
  const tamam = new Set<string>();
  for (const e of v.egitimler) {
    const g = tarihOku(e.gecerlilik);
    if (e.tur === 'İSG (zorunlu)' && e.durum === 'Tamamlandı' && (!e.gecerlilik || (g !== null && g >= bugun))) for (const k of e.katilimcilar ?? []) tamam.add(k);
  }
  return aktifler(v, m).filter((p) => !tamam.has(p.id));
}

const yillikMesai = (v: AnalizVerisi, p: Personel, yil: string): number =>
  v.devam.filter((a) => a.empId === p.id && (a.tarih ?? '').startsWith(yil) && (a.tur === 'Fazla mesai' || a.tur === 'Hafta tatili çalışması'))
    .reduce((s, a) => s + sayiOku(a.saat), 0);
const ilk = (xs: readonly string[], n: number): string => xs.slice(0, n).join(', ') + (xs.length > n ? ' ve diğerleri' : '');

// --- Pano --------------------------------------------------------------------------------------------------------------

export type Hedef =
  | { gorunum: 'calisan' | 'aday' | 'pozisyon'; kimlik: string; ad: string }
  | { gorunum: 'egitim'; kimlik?: undefined; ad?: undefined };

export interface PanoOlayi { tarih: Date; tur: string; aciklama: string; uyari: boolean; hedef: Hedef | null }
export interface PanoUyarisi { kotu: boolean; baslik: string; ayrinti: string; gorunum: string; suzgec?: string }

export interface PanoOzeti {
  aktif: number;
  bugunIzinde: Izin[];
  bekleyen: Izin[];
  giris: number;
  cikis: number;
  acikKadro: number;
  devirOrani: number;
  olaylar: PanoOlayi[];
  uyarilar: PanoUyarisi[];
  departmanlar: [string, number][];
  yaka: { beyaz: number; mavi: number };
}

export function panoOzeti(v: AnalizVerisi, m: AnalizMotoru, bugun: Date): PanoOzeti {
  const personel = dizin(v.personel);
  const kisi = (id: string | undefined) => personel.get(id ?? '') ?? null;
  const ad = (id: string | undefined) => { const p = kisi(id); return p ? adSoyad(p) : '—'; };
  const ay = gunMetni(bugun).slice(0, 7);
  const sinir = gunEkle(bugun, 30);
  const act = v.personel.filter((p) => m.aktifMi(p));
  const bugunIzinde = v.izinler.filter((l) => {
    const b = tarihOku(l.baslangic), s = tarihOku(l.bitis), p = kisi(l.empId);
    return l.durum === 'Onaylandı' && b !== null && b <= bugun && s !== null && s >= bugun && p !== null && m.aktifMi(p);
  });
  const bekleyen = v.izinler.filter((l) => l.durum === 'Beklemede').sort((a, b) => (a.baslangic ?? '').localeCompare(b.baslangic ?? ''));
  const yilOnce = gunEkle(bugun, -365);
  const ayrilan = v.personel.filter((p) => { const c = tarihOku(p.cikisTarihi); return c !== null && c > yilOnce && c <= bugun; }).length;
  const ortalama = (v.personel.filter((p) => m.aktifMi(p, yilOnce)).length + act.length) / 2;

  const olaylar: PanoOlayi[] = [];
  for (const p of act) {
    const h: Hedef = { gorunum: 'calisan', kimlik: p.id, ad: adSoyad(p) };
    const dg = sonrakiYildonumu(p.dogumTarihi, bugun);
    if (dg && dg <= sinir) olaylar.push({ tarih: dg, tur: 'Doğum günü', aciklama: `${tamYil(tarihOku(p.dogumTarihi)!, dg)} yaşına giriyor`, uyari: false, hedef: h });
    const g = tarihOku(p.iseGiris);
    if (g) {
      const yd = sonrakiYildonumu(p.iseGiris, bugun);
      if (yd && yd <= sinir && yd > g) olaylar.push({ tarih: yd, tur: 'İş yıldönümü', aciklama: `${tamYil(g, yd)}. yıl, ${m.izinBakiyesi(p).sonrakiGun} gün yıllık izin hak edişi`, uyari: false, hedef: h });
    }
    const db = tarihOku(p.denemeBitis);
    if (db && db >= bugun && db <= sinir) olaylar.push({ tarih: db, tur: 'Deneme süresi bitiyor', aciklama: 'Değerlendirme görüşmesini planlayın', uyari: true, hedef: h });
    const sb = tarihOku(p.sozlesmeBitis);
    if (sb && sb >= gunEkle(bugun, -7) && sb <= sinir) olaylar.push({ tarih: sb, tur: 'Sözleşme bitiyor', aciklama: `${p.sozlesmeTuru ?? ''} sözleşme; yenileme kararı gerekiyor`, uyari: true, hedef: h });
  }
  for (const l of v.izinler) {
    const b = tarihOku(l.baslangic);
    const p = kisi(l.empId);
    if (l.durum === 'Onaylandı' && b && b > bugun && b <= gunEkle(bugun, 14)) {
      olaylar.push({ tarih: b, tur: 'İzne çıkıyor', aciklama: `${l.tur ?? ''}, ${sayiYaz(sayiOku(l.gun))} gün`, uyari: false, hedef: p ? { gorunum: 'calisan', kimlik: p.id, ad: adSoyad(p) } : null });
    }
  }
  for (const e of v.egitimler) {
    const g = tarihOku(e.gecerlilik);
    if (g && e.durum === 'Tamamlandı' && g >= gunEkle(bugun, -30) && g <= sinir) olaylar.push({ tarih: g, tur: 'Sertifika süresi doluyor', aciklama: `${e.ad ?? ''}, ${(e.katilimcilar ?? []).length} kişi`, uyari: true, hedef: { gorunum: 'egitim' } });
  }
  for (const e of v.egitimler) {
    const g = tarihOku(e.tarih);
    if (g && e.durum === 'Planlandı' && g >= bugun && g <= sinir) olaylar.push({ tarih: g, tur: 'Eğitim', aciklama: e.ad ?? '', uyari: false, hedef: { gorunum: 'egitim' } });
  }
  const adaylar = dizin(v.adaylar);
  const pozisyonlar = dizin(v.pozisyonlar);
  for (const i of v.gorusmeler) {
    const d = tarihOku(i.tarih);
    const c = adaylar.get(i.candId ?? '');
    if (d && c && i.durum === 'Planlandı' && d >= bugun && d <= sinir) {
      const j = pozisyonlar.get(c.jobId ?? '');
      olaylar.push({ tarih: d, tur: 'Mülakat', aciklama: `${i.tur ?? ''}${i.saat ? `, saat ${i.saat}` : ''}${j ? `, ${j.baslik ?? ''}` : ''}`, uyari: false, hedef: { gorunum: 'aday', kimlik: c.id, ad: adayAdi(c) } });
    }
  }
  for (const j of v.pozisyonlar) {
    if (j.durum !== 'Açık' || !j.sonBasvuru) continue;
    const d = tarihOku(j.sonBasvuru);
    const baslik = j.ilanBaslik || j.baslik || '';
    if (d && d >= bugun && d <= sinir) olaylar.push({ tarih: d, tur: 'Son başvuru', aciklama: `${baslik} ilanı`, uyari: true, hedef: { gorunum: 'pozisyon', kimlik: j.id, ad: baslik } });
  }
  olaylar.sort((a, b) => a.tarih.getTime() - b.tarih.getTime());

  const u: PanoUyarisi[] = [];
  const eksi = act.filter((p) => m.izinBakiyesi(p).kalan < 0);
  if (eksi.length) u.push({ kotu: true, baslik: `${eksi.length} çalışanın yıllık izin bakiyesi eksiye düştü`, ayrinti: eksi.map(adSoyad).join(', '), gorunum: 'izin' });
  const eksik = act.filter((p) => m.eksikBelgeler(p).length);
  if (eksik.length) u.push({ kotu: false, baslik: `${eksik.length} çalışanın özlük dosyasında eksik belge var`, ayrinti: ilk(eksik.map(adSoyad), 4), gorunum: 'personel', suzgec: 'eksik' });
  const L = sayiOku(m.ayar('yillikMesaiLimit')) || 270;
  const yil = String(bugun.getFullYear());
  const mesai = act.map((p) => [p, yillikMesai(v, p, yil)] as const).filter(([, h]) => h >= L * 0.85);
  if (mesai.length) u.push({ kotu: mesai.some(([, h]) => h > L), baslik: `${mesai.length} çalışan yıllık ${L} saatlik fazla mesai sınırına yaklaştı`, ayrinti: mesai.map(([p, h]) => `${adSoyad(p)} (${sayiYaz(h)} sa)`).join(', '), gorunum: 'devam' });
  const kimliksiz = act.filter((p) => !p.tckn || !p.sgkNo);
  if (kimliksiz.length) u.push({ kotu: false, baslik: `${kimliksiz.length} çalışanın kimlik veya SGK numarası girilmemiş`, ayrinti: kimliksiz.slice(0, 4).map(adSoyad).join(', '), gorunum: 'personel' });
  const isg = isgEksikler(v, m, bugun);
  if (isg.length) u.push({ kotu: false, baslik: `${isg.length} çalışanın geçerli İSG eğitimi kaydı yok`, ayrinti: ilk(isg.map(adSoyad), 4), gorunum: 'egitim' });
  const gecen = v.pozisyonlar.filter((j) => { const d = tarihOku(j.sonBasvuru); return j.durum === 'Açık' && j.sonBasvuru && d !== null && d < bugun; });
  if (gecen.length) u.push({ kotu: false, baslik: `${gecen.length} ilanın son başvuru tarihi geçti ama pozisyon açık`, ayrinti: `${gecen.map((j) => j.ilanBaslik || j.baslik).join(', ')}. Tarihi uzatın veya ilanı kapatın.`, gorunum: 'isealim', suzgec: 'pozisyon' });
  const onayda = v.pozisyonlar.filter((j) => j.durum === 'Onay bekliyor');
  if (onayda.length) u.push({ kotu: false, baslik: `${onayda.length} kadro talebi onay bekliyor`, ayrinti: onayda.map((j) => j.baslik).join(', '), gorunum: 'isealim', suzgec: 'pozisyon' });
  const deg = degerlendirmesizGorusmeler(v, bugun);
  if (deg.length) u.push({ kotu: false, baslik: `${deg.length} iş görüşmesinin değerlendirmesi girilmemiş`, ayrinti: deg.map((i) => `${adayAdi(adaylar.get(i.candId ?? ''))} (${i.tur ?? ''})`).join(', '), gorunum: 'isealim', suzgec: 'takvim' });
  const sgkCikis = v.personel.filter((p) => { const c = tarihOku(p.cikisTarihi); return c !== null && c <= bugun && gunFarki(c, bugun) <= 30 && !p.cikisListesi?.sgk; });
  if (sgkCikis.length) {
    u.push({
      kotu: sgkCikis.some((p) => gunFarki(tarihOku(p.cikisTarihi)!, bugun) > 10), baslik: `${sgkCikis.length} çalışanın SGK işten ayrılış bildirgesi işaretlenmemiş`,
      ayrinti: `${sgkCikis.map((p) => `${adSoyad(p)} (${Math.max(0, 10 - gunFarki(tarihOku(p.cikisTarihi)!, bugun))} gün kaldı)`).join(', ')}. Çıkıştan itibaren 10 gün içinde verilmelidir.`,
      gorunum: 'personel', suzgec: 'pasif',
    });
  }
  const sgkGiris = v.personel.filter((p) => { const g = tarihOku(p.iseGiris); return g !== null && gunFarki(bugun, g) <= 7 && gunFarki(g, bugun) <= 30 && !p.belgeler?.['SGK işe giriş bildirgesi']?.ok; });
  if (sgkGiris.length) u.push({ kotu: true, baslik: `${sgkGiris.length} yeni çalışanın SGK işe giriş bildirgesi işaretlenmemiş`, ayrinti: `${sgkGiris.map((p) => `${adSoyad(p)} (giriş ${tarih(p.iseGiris)})`).join(', ')}. Bildirge işe başlamadan önce verilmelidir.`, gorunum: 'personel', suzgec: 'eksik' });
  const bayat = bekleyen.filter((l) => { const b = tarihOku(l.baslangic); return b !== null && b < bugun; });
  if (bayat.length) u.push({ kotu: false, baslik: `Başlangıç tarihi geçmiş ${bayat.length} izin talebi hâlâ onay bekliyor`, ayrinti: bayat.map((l) => ad(l.empId)).join(', '), gorunum: 'izin' });
  const esik = sayiOku(m.ayar('engelliEsik')) || 50;
  const oran = sayiOku(m.ayar('engelliOran')) || 3;
  if (act.length >= esik) {
    const gerek = Math.floor((act.length * oran) / 100);
    const var_ = act.filter((p) => p.engelDurumu && p.engelDurumu !== 'Yok').length;
    if (var_ < gerek) u.push({ kotu: true, baslik: `Engelli çalışan istihdam yükümlülüğü karşılanmıyor (${var_}/${gerek})`, ayrinti: `${esik} ve üzeri çalışanı olan özel sektör işyerlerinde %${oran} oranı aranır (İş Kanunu md. 30).`, gorunum: 'rapor' });
  }

  const departmanlar = dizin(v.departmanlar);
  const beyaz = act.filter((p) => m.yaka(p) === 'Beyaz yaka').length;
  return {
    aktif: act.length, bugunIzinde, bekleyen,
    giris: v.personel.filter((p) => (p.iseGiris ?? '').slice(0, 7) === ay).length,
    cikis: v.personel.filter((p) => (p.cikisTarihi ?? '').slice(0, 7) === ay).length,
    acikKadro: v.pozisyonlar.filter((j) => j.durum === 'Açık').reduce((s, j) => s + (sayiOku(j.adet) || 1), 0),
    devirOrani: ortalama ? (ayrilan / ortalama) * 100 : 0,
    olaylar, uyarilar: u,
    departmanlar: say(act, (p) => departmanlar.get(p.departmanId ?? '')?.ad ?? '—'),
    yaka: { beyaz, mavi: act.length - beyaz },
  };
}

// --- Yapılacaklar ------------------------------------------------------------------------------------------------------

export const GOREV_KATEGORILERI = ['İzin', 'SGK', 'Personel', 'Bordro', 'İşe alım', 'Mevzuat', 'Eğitim'] as const;
export type GorevKategorisi = (typeof GOREV_KATEGORILERI)[number];
export type GorevKovasi = 'late' | 'today' | 'week' | 'later' | 'none';

// Görev düğmesinin işi; ekran yetkiye göre gizler ve yürütür.
export type GorevEylemi =
  | { tur: 'izin-karar'; izin: string; durum: 'Onaylandı' | 'Reddedildi' }
  | { tur: 'git'; gorunum: string; kimlik?: string; sekme?: string; ay?: string }
  | { tur: 'gorusme-degerlendir'; gorusme: string }
  | { tur: 'yeni-donem' };
export interface GorevDugmesi { etiket: string; birincil: boolean; eylem: GorevEylemi }

export interface Gorev {
  anahtar: string;
  kategori: GorevKategorisi;
  ton: '' | 'bad' | 'warn';
  baslik: string;
  aciklama: string;
  son: string | null;
  dugmeler: GorevDugmesi[];
  gizli: boolean;
  ertelendi: boolean;
  erteleme: string | null;
  kova: GorevKovasi;
}

type HamGorev = Omit<Gorev, 'gizli' | 'ertelendi' | 'erteleme' | 'kova' | 'ton'> & { ton?: Gorev['ton'] };

export function gorevler(v: AnalizVerisi, m: AnalizMotoru, bugun: Date): Gorev[] {
  const T = gunMetni(bugun);
  const out: HamGorev[] = [];
  const personel = dizin(v.personel);
  const ad = (id: string | undefined) => { const p = personel.get(id ?? ''); return p ? adSoyad(p) : '—'; };
  const git = (etiket: string, gorunum: string, ek: Omit<Extract<GorevEylemi, { tur: 'git' }>, 'tur' | 'gorunum'> = {}, birincil = false): GorevDugmesi =>
    ({ etiket, birincil, eylem: { tur: 'git', gorunum, ...ek } });

  for (const l of v.izinler.filter((x) => x.durum === 'Beklemede')) {
    out.push({
      anahtar: `leave:${l.id}`, kategori: 'İzin', baslik: `${ad(l.empId)}: ${l.tur ?? ''} talebi`,
      aciklama: `${uzunTarih(l.baslangic)} – ${uzunTarih(l.bitis)}, ${sayiYaz(sayiOku(l.gun))} gün${l.aciklama ? `. ${l.aciklama}` : ''}`, son: l.baslangic ?? null,
      dugmeler: [
        { etiket: 'Onayla', birincil: true, eylem: { tur: 'izin-karar', izin: l.id, durum: 'Onaylandı' } },
        { etiket: 'Reddet', birincil: false, eylem: { tur: 'izin-karar', izin: l.id, durum: 'Reddedildi' } },
      ],
    });
  }
  for (const p of v.personel) {
    const kim = adSoyad(p);
    const kart = (sekme: string, etiket: string) => git(etiket, 'calisan', { kimlik: p.id, sekme });
    const g = tarihOku(p.iseGiris);
    if (g && gunFarki(bugun, g) <= 14 && gunFarki(g, bugun) <= 30 && !p.belgeler?.['SGK işe giriş bildirgesi']?.ok) {
      out.push({ anahtar: `sgkin:${p.id}`, kategori: 'SGK', ton: 'bad', baslik: `${kim}: SGK işe giriş bildirgesi`, aciklama: `İşe giriş ${uzunTarih(p.iseGiris)}. Bildirge en geç işe başlamadan bir gün önce verilmelidir.`, son: gunMetni(gunEkle(g, -1)), dugmeler: [kart('belge', 'Özlük belgelerini aç')] });
    }
    const c = tarihOku(p.cikisTarihi);
    if (c && c <= bugun && gunFarki(c, bugun) <= 40 && !p.cikisListesi?.sgk) {
      out.push({ anahtar: `sgkout:${p.id}`, kategori: 'SGK', ton: 'bad', baslik: `${kim}: SGK işten ayrılış bildirgesi`, aciklama: `Çıkış ${uzunTarih(p.cikisTarihi)}. Bildirge çıkıştan itibaren 10 gün içinde verilmelidir.`, son: gunMetni(gunEkle(c, 10)), dugmeler: [kart('ayrilis', 'Çıkış listesini aç')] });
    }
    if (!m.aktifMi(p)) continue;
    const db = tarihOku(p.denemeBitis);
    if (db && db >= gunEkle(bugun, -3) && gunFarki(bugun, db) <= 14) {
      out.push({ anahtar: `deneme:${p.id}:${p.denemeBitis}`, kategori: 'Personel', baslik: `${kim}: deneme süresi bitiyor`, aciklama: 'Deneme süresi bitmeden değerlendirme görüşmesi yapın ve kararı kaydedin.', son: p.denemeBitis ?? null, dugmeler: [kart('gelisim', 'Kartı aç')] });
    }
    const sb = tarihOku(p.sozlesmeBitis);
    if (sb && sb >= gunEkle(bugun, -7) && gunFarki(bugun, sb) <= 30) {
      out.push({ anahtar: `soz:${p.id}:${p.sozlesmeBitis}`, kategori: 'Personel', ton: sb < bugun ? 'bad' : '', baslik: `${kim}: ${p.sozlesmeTuru ?? ''} sözleşme bitiyor`.replace(':  ', ': '), aciklama: 'Yenileme, belirsiz süreliye geçiş veya fesih kararı verin.', son: p.sozlesmeBitis ?? null, dugmeler: [kart('is', 'İş bilgilerini aç')] });
    }
    const md = m.eksikBelgeler(p).filter((d) => d !== 'SGK işe giriş bildirgesi');
    if (md.length) out.push({ anahtar: `docs:${p.id}:${md.length}`, kategori: 'Personel', baslik: `${kim}: ${md.length} eksik özlük belgesi`, aciklama: ilk(md, 4), son: null, dugmeler: [kart('belge', 'Belgeleri aç')] });
  }
  const adaylar = dizin(v.adaylar);
  for (const i of degerlendirmesizGorusmeler(v, bugun)) {
    out.push({ anahtar: `intv:${i.id}`, kategori: 'İşe alım', baslik: `${adayAdi(adaylar.get(i.candId ?? ''))}: ${i.tur ?? ''} değerlendirmesi`, aciklama: `${uzunTarih(i.tarih)} tarihli görüşmenin puanları girilmedi.`, son: i.tarih ?? null, dugmeler: [{ etiket: 'Değerlendir', birincil: true, eylem: { tur: 'gorusme-degerlendir', gorusme: i.id } }] });
  }
  for (const j of v.pozisyonlar) {
    if (j.durum === 'Onay bekliyor') {
      out.push({ anahtar: `jobappr:${j.id}`, kategori: 'İşe alım', baslik: `${j.baslik ?? ''}: kadro talebi onay bekliyor`, aciklama: j.talepEdenId ? `Talep eden ${ad(j.talepEdenId)}` : 'Onaylanınca ilan yayına hazırlanabilir.', son: j.acilis ?? null, dugmeler: [git('Pozisyonu aç', 'pozisyon', { kimlik: j.id })] });
    }
    const sb = tarihOku(j.sonBasvuru);
    if (j.durum === 'Açık' && j.sonBasvuru && sb && sb < bugun) {
      out.push({ anahtar: `joblate:${j.id}:${j.sonBasvuru}`, kategori: 'İşe alım', baslik: `${j.ilanBaslik || j.baslik || ''}: son başvuru tarihi geçti`, aciklama: 'Tarihi uzatın veya pozisyonu kapatın; kanallardaki ilanları güncelleyin.', son: j.sonBasvuru, dugmeler: [git('Pozisyonu aç', 'pozisyon', { kimlik: j.id })] });
    }
  }
  // Geçen ayın bordrosu: o ay çalışanların hepsi kesinleşene kadar.
  const gecenAy = new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1);
  const gecen = `${gecenAy.getFullYear()}-${ik2(gecenAy.getMonth() + 1)}`;
  const bordrolar = dizin(v.bordrolar);
  const calisan = v.personel.filter((p) => m.aydaCalisiyor(p, gecenAy.getFullYear(), gecenAy.getMonth() + 1));
  const kesin = calisan.filter((p) => bordrolar.get(`pay_${p.id}_${gecen}`)?.snap).length;
  if (calisan.length && kesin < calisan.length) {
    out.push({ anahtar: `pay:${gecen}`, kategori: 'Bordro', baslik: `${AYLAR[gecenAy.getMonth()]} ${gecenAy.getFullYear()} bordrosunu kesinleştirin`, aciklama: `${kesin}/${calisan.length} çalışan kesinleşti. MUHSGK beyannamesi ayın 26'sına kadar verilir.`, son: gunMetni(new Date(bugun.getFullYear(), bugun.getMonth(), 26)), dugmeler: [git('Bordroyu aç', 'bordro', { ay: gecen }, true)] });
  }
  // Son iki ayın kesinleşmiş ama çalışanın onaylamadığı bordroları (v3).
  const sinir = new Date(bugun.getFullYear(), bugun.getMonth() - 2, 1);
  const sinirAy = `${sinir.getFullYear()}-${ik2(sinir.getMonth() + 1)}`;
  const onaysiz = new Map<string, Bordro[]>();
  for (const b of v.bordrolar) if (b.snap && !b.gordum && (b.donem ?? '') >= sinirAy) onaysiz.set(b.donem!, [...(onaysiz.get(b.donem!) ?? []), b]);
  for (const [donem, bs] of [...onaysiz].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push({ anahtar: `payok:${donem}:${bs.length}`, kategori: 'Bordro', baslik: `${AYLAR[Number(donem.slice(5)) - 1]} ${donem.slice(0, 4)} bordrosunu ${bs.length} çalışan onaylamadı`, aciklama: ilk(bs.map((b) => ad(b.empId)), 4), son: null, dugmeler: [git('Bordroyu aç', 'bordro', { ay: donem })] });
  }
  const donemler = m.donemBaslangiclari();
  for (const ayNo of [1, 7]) {
    const yil = ayNo === 1 ? bugun.getFullYear() + 1 : bugun.getFullYear();
    const bas = `${yil}-${ik2(ayNo)}-01`;
    const kalan = gunFarki(bugun, tarihOku(bas)!);
    if (kalan > 0 && kalan <= 45 && !donemler.includes(bas)) {
      out.push({ anahtar: `period:${bas}`, kategori: 'Mevzuat', ton: 'warn', baslik: `${AYLAR[ayNo - 1]} ${yil} parametre dönemini oluşturun`, aciklama: 'Asgari ücret, SGK tavanı, vergi dilimleri ve kıdem tavanı genellikle bu tarihte değişir. Dönem yoksa güncel değerler kullanılmaya devam eder.', son: gunMetni(gunEkle(tarihOku(bas)!, -1)), dugmeler: [{ etiket: 'Yeni dönem', birincil: true, eylem: { tur: 'yeni-donem' } }] });
    }
  }
  if (bugun.getMonth() >= 10) {
    const yil = bugun.getFullYear() + 1;
    if (!satirlar(m.ayar('tatiller')).some((l) => l.startsWith(String(yil)))) {
      out.push({ anahtar: `tatil:${yil}`, kategori: 'Mevzuat', baslik: `${yil} resmî tatillerini ekleyin`, aciklama: 'Ramazan ve Kurban Bayramı tarihleri her yıl değişir; izin ve mesai hesapları bu listeyi kullanır.', son: `${yil}-01-01`, dugmeler: [git('Takvim ayarlarını aç', 'ayarlar', { sekme: 'genel' })] });
    }
  }
  const L = sayiOku(m.ayar('yillikMesaiLimit')) || 270;
  const yil = String(bugun.getFullYear());
  for (const p of v.personel.filter((x) => m.aktifMi(x))) {
    const h = yillikMesai(v, p, yil);
    if (h >= L * 0.85) out.push({ anahtar: `ot:${p.id}:${yil}`, kategori: 'Personel', ton: h > L ? 'bad' : 'warn', baslik: `${adSoyad(p)}: fazla mesai ${sayiYaz(h)} / ${L} saat`, aciklama: 'Yıllık sınıra yaklaşıldı; vardiya planını gözden geçirin.', son: null, dugmeler: [git('Devam kayıtları', 'calisan', { kimlik: p.id, sekme: 'devam' })] });
  }
  const isg = isgEksikler(v, m, bugun);
  if (isg.length) out.push({ anahtar: `isg:${isg.length}`, kategori: 'Eğitim', baslik: `${isg.length} çalışanın geçerli İSG eğitimi yok`, aciklama: ilk(isg.map(adSoyad), 5), son: null, dugmeler: [git('Eğitimler', 'egitim')] });

  return out.map((o) => {
    const d = v.gorevDurumu[o.anahtar] ?? {};
    const gizli = d.gizle === true;
    const ertelendi = !gizli && !!d.ertele && d.ertele > T;
    const kova: GorevKovasi = !o.son ? 'none' : o.son < T ? 'late' : o.son === T ? 'today' : gunFarki(bugun, tarihOku(o.son)!) <= 7 ? 'week' : 'later';
    return { ...o, ton: o.ton ?? '', gizli, ertelendi, erteleme: d.ertele ?? null, kova };
  });
}

// Menü sayacı ve pano şeridi: açık işlerden gecikmiş ve bugünküler.
export const acikGorevler = (g: readonly Gorev[]): Gorev[] => g.filter((x) => !x.gizli && !x.ertelendi);

export function sonGunMetni(son: string | null, bugun: Date): string {
  if (!son) return '';
  const d = gunFarki(bugun, tarihOku(son)!);
  return d < 0 ? `${-d} gün gecikti` : d === 0 ? 'bugün' : `${d} gün kaldı`;
}

// Görev durumunu değiştirir; ayarlara yazılacak yeni harita döner.
export function gorevDurumuDegistir(
  durum: AnalizVerisi['gorevDurumu'], anahtar: string, islem: 'ertele' | 'gizle' | 'geri', bugun: Date,
): Record<string, { ertele?: string; gizle?: boolean; t?: string }> {
  const g: Record<string, { ertele?: string; gizle?: boolean; t?: string }> = {};
  for (const [k, x] of Object.entries(durum)) if (x) g[k] = x;
  if (islem === 'geri') delete g[anahtar];
  else if (islem === 'ertele') g[anahtar] = { ertele: gunMetni(gunEkle(bugun, 7)) };
  else g[anahtar] = { gizle: true, t: gunMetni(bugun) };
  return g;
}

// --- Raporlar ----------------------------------------------------------------------------------------------------------

export type Dagilim = [etiket: string, deger: number, gosterim?: string][];
export interface YakaOzeti { calisan: number; ortalamaBrut: number | null; toplamBrut: number; kadinOrani: number; yasOrtalamasi: number | null; ortalamaKidem: number | null }

export interface Rapor {
  aktif: number;
  kadinOrani: number;
  yasOrtalamasi: number | null;
  ortalamaKidem: number | null;
  brutYuku: number;
  engelli: number;
  engelliGerek: number;
  yaka: { beyaz: number; mavi: number; beyazOzet: YakaOzeti; maviOzet: YakaOzeti };
  departmanYaka: { ad: string; beyaz: number; mavi: number }[];
  kademeler: { ad: string; toplam: number; beyaz: number }[];
  pozisyonlar: { ad: string; toplam: number; mavi: number }[];
  tahminEdilen: number;
  departman: Dagilim;
  departmanBrut: Dagilim;
  yas: Dagilim;
  kidem: Dagilim;
  cinsiyet: Dagilim;
  egitim: Dagilim;
  sozlesme: Dagilim;
  calismaSekli: Dagilim;
  izinKullanimi: Dagilim;
  izinYili: string;
  cikisNedenleri: Dagilim;
  adayKaynaklari: Dagilim;
  girisCikis: { ay: string; giris: number; cikis: number }[];
}

const ortalama = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sirala = (rows: [string, number][], anahtarlar: readonly string[]): [string, number][] =>
  anahtarlar.map((k): [string, number] => [k, rows.find((r) => r[0] === k)?.[1] ?? 0]).concat(rows.filter((r) => !anahtarlar.includes(r[0])));

export function rapor(v: AnalizVerisi, m: AnalizMotoru, bugun: Date, para: (n: number) => string): Rapor {
  const act = aktifler(v, m);
  const departmanlar = [...v.departmanlar].sort((a, b) => (a.ad ?? '').localeCompare(b.ad ?? '', 'tr'));
  const depAdi = new Map(v.departmanlar.map((d) => [d.id, d.ad ?? '—']));
  const yas = (p: Personel) => { const d = tarihOku(p.dogumTarihi); if (!d) return null; const a = tamYil(d, bugun); return a < 25 ? '25 yaş altı' : a < 35 ? '25–34' : a < 45 ? '35–44' : a < 55 ? '45–54' : '55 ve üzeri'; };
  const kidem = (p: Personel) => { const g = tarihOku(p.iseGiris); if (!g) return null; const y = tamYil(g, bugun); return y < 1 ? '1 yıldan az' : y < 3 ? '1–3 yıl' : y < 5 ? '3–5 yıl' : y < 10 ? '5–10 yıl' : '10 yıl ve üzeri'; };
  const yasListesi = (es: readonly Personel[]) => es.map((p) => tarihOku(p.dogumTarihi)).filter((d): d is Date => d !== null).map((d) => tamYil(d, bugun));
  const kidemListesi = (es: readonly Personel[]) => es.map((p) => tarihOku(p.iseGiris)).filter((d): d is Date => d !== null).map((d) => gunFarki(d, bugun) / 365.25);
  const kadin = (es: readonly Personel[]) => (es.length ? Math.round((es.filter((p) => p.cinsiyet === 'Kadın').length / es.length) * 100) : 0);
  const ozet = (es: readonly Personel[]): YakaOzeti => {
    const brut = es.map((p) => m.guncelBrut(p)).filter(Boolean);
    return { calisan: es.length, ortalamaBrut: ortalama(brut), toplamBrut: brut.reduce((a, b) => a + b, 0), kadinOrani: kadin(es), yasOrtalamasi: ortalama(yasListesi(es)), ortalamaKidem: ortalama(kidemListesi(es)) };
  };
  const beyazlar = act.filter((p) => m.yaka(p) === 'Beyaz yaka');
  const mavi = act.filter((p) => m.yaka(p) === 'Mavi yaka');

  const departmanYaka = departmanlar.map((d) => ({ ad: d.ad ?? '', es: act.filter((p) => p.departmanId === d.id) })).filter((x) => x.es.length);
  const depsiz = act.filter((p) => !depAdi.has(p.departmanId ?? ''));
  if (depsiz.length) departmanYaka.push({ ad: 'Departmansız', es: depsiz });
  const poz = new Map<string, Personel[]>();
  for (const p of act) { const k = (p.pozisyon || 'Belirtilmemiş').trim(); poz.set(k, [...(poz.get(k) ?? []), p]); }

  const aylar: string[] = [];
  for (let i = 11; i >= 0; i--) { const d = ayEkle(new Date(bugun.getFullYear(), bugun.getMonth(), 1), -i); aylar.push(`${d.getFullYear()}-${ik2(d.getMonth() + 1)}`); }
  const yil = String(bugun.getFullYear());
  const izin = new Map<string, number>();
  for (const l of v.izinler) if (l.durum === 'Onaylandı' && (l.baslangic ?? '').startsWith(yil)) izin.set(l.tur ?? '', (izin.get(l.tur ?? '') ?? 0) + sayiOku(l.gun));
  const esik = sayiOku(m.ayar('engelliEsik')) || 50;
  const oran = sayiOku(m.ayar('engelliOran')) || 3;
  const brutDep = departmanlar.map((d): [string, number] => { const es = act.filter((p) => p.departmanId === d.id && m.guncelBrut(p)); return [d.ad ?? '', es.length ? es.reduce((s, p) => s + m.guncelBrut(p), 0) / es.length : 0]; })
    .filter((r) => r[1]).sort((a, b) => b[1] - a[1]);

  return {
    aktif: act.length,
    kadinOrani: kadin(act),
    yasOrtalamasi: ortalama(yasListesi(act)),
    ortalamaKidem: ortalama(kidemListesi(act)),
    brutYuku: act.reduce((s, p) => s + m.guncelBrut(p), 0),
    engelli: act.filter((p) => p.engelDurumu && p.engelDurumu !== 'Yok').length,
    engelliGerek: act.length >= esik ? Math.floor((act.length * oran) / 100) : 0,
    yaka: { beyaz: beyazlar.length, mavi: act.length - beyazlar.length, beyazOzet: ozet(beyazlar), maviOzet: ozet(mavi) },
    departmanYaka: departmanYaka.map(({ ad, es }) => { const b = es.filter((p) => m.yaka(p) === 'Beyaz yaka').length; return { ad, beyaz: b, mavi: es.length - b }; }),
    kademeler: m.kademeler.map((k) => ({ ad: k, es: act.filter((p) => m.kademe(p) === k) })).filter((x) => x.es.length)
      .map(({ ad, es }) => ({ ad, toplam: es.length, beyaz: es.filter((p) => m.yaka(p) === 'Beyaz yaka').length })),
    pozisyonlar: [...poz.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'tr'))
      .map(([ad, es]) => ({ ad, toplam: es.length, mavi: es.filter((p) => m.yaka(p) === 'Mavi yaka').length })),
    tahminEdilen: act.filter((p) => !m.yakalar.includes(p.yakaTipi ?? '') || !m.kademeler.includes(p.kademe ?? '')).length,
    departman: say(act, (p) => depAdi.get(p.departmanId ?? '') ?? '—'),
    departmanBrut: brutDep.map(([d, x]) => [d, x, para(x)]),
    yas: sirala(say(act, yas), ['25 yaş altı', '25–34', '35–44', '45–54', '55 ve üzeri']).filter((r) => r[1]),
    kidem: sirala(say(act, kidem), ['1 yıldan az', '1–3 yıl', '3–5 yıl', '5–10 yıl', '10 yıl ve üzeri']).filter((r) => r[1]),
    cinsiyet: say(act, (p) => p.cinsiyet),
    egitim: say(act, (p) => p.egitim),
    sozlesme: say(act, (p) => p.sozlesmeTuru),
    calismaSekli: say(act, (p) => p.calismaSekli),
    izinKullanimi: [...izin.entries()].sort((a, b) => b[1] - a[1]),
    izinYili: yil,
    cikisNedenleri: say(v.personel.filter((p) => p.cikisTarihi), (p) => (p.cikisKodu || 'Belirtilmemiş').replace(/^\d+\s/, '')),
    adayKaynaklari: say(v.adaylar, (c) => c.kaynak).map(([k, n]) => [k, n, `${n} aday, ${v.adaylar.filter((c) => (c.kaynak || 'Belirtilmemiş') === k && c.asama === 'İşe alındı').length} işe alındı`]),
    girisCikis: aylar.map((a) => ({ ay: `${AYLAR[Number(a.slice(5)) - 1]!.slice(0, 3)} ${a.slice(2, 4)}`, giris: v.personel.filter((p) => (p.iseGiris ?? '').startsWith(a)).length, cikis: v.personel.filter((p) => (p.cikisTarihi ?? '').startsWith(a)).length })),
  };
}

// Raporlar sayfasının indirmeleri: personel listesi ve izin kayıtları (bugünkü sütunlarla).
export function personelCsv(v: AnalizVerisi, m: AnalizMotoru, sutunlar: readonly (readonly [string, string])[], adlar: Readonly<Record<string, string>>, bugun: Date, sure: (a: Date, b: Date) => string) {
  const personel = dizin(v.personel);
  const depAdi = new Map(v.departmanlar.map((d) => [d.id, d.ad ?? '—']));
  const sirali = [...v.personel].sort((a, b) => Number(m.aktifMi(b)) - Number(m.aktifMi(a)) || adSoyad(a).localeCompare(adSoyad(b), 'tr'));
  const basliklar = [...sutunlar.map(([k]) => adlar[k] ?? k), 'Kıdem', 'Kalan yıllık izin', 'Eksik belge sayısı'];
  const satir = sirali.map((p) => {
    const kayit = p as unknown as Readonly<Record<string, unknown>>;
    const deger = ([k, t]: readonly [string, string]): string | number => {
      const x = kayit[k];
      if (t === 'dept') return depAdi.get(String(x ?? '')) ?? '—';
      if (t === 'emp') return x ? adSoyad(personel.get(String(x)) ?? null) : '';
      if (t === 'date') return x ? tarih(String(x)) : '';
      return typeof x === 'number' ? x : x === undefined || x === null ? '' : String(x);
    };
    const g = tarihOku(p.iseGiris);
    return [...sutunlar.map(deger), g ? sure(g, tarihOku(p.cikisTarihi) ?? bugun) : '', m.izinBakiyesi(p).kalan, m.eksikBelgeler(p).length];
  });
  return { basliklar, satirlar: satir };
}

export function izinCsv(v: AnalizVerisi) {
  const personel = dizin(v.personel);
  const depAdi = new Map(v.departmanlar.map((d) => [d.id, d.ad ?? '—']));
  const satirlar_ = [...v.izinler].sort((a, b) => (b.baslangic ?? '').localeCompare(a.baslangic ?? '')).map((l) => {
    const p = personel.get(l.empId ?? '') ?? null;
    return [p ? adSoyad(p) : '—', depAdi.get(p?.departmanId ?? '') ?? '—', l.tur ?? '', tarih(l.baslangic), tarih(l.bitis), sayiOku(l.gun), l.durum ?? '', l.aciklama ?? ''];
  });
  return { basliklar: ['Çalışan', 'Departman', 'İzin türü', 'Başlangıç', 'Bitiş', 'Gün', 'Durum', 'Açıklama'], satirlar: satirlar_ };
}

// --- Değişiklik günlüğü ------------------------------------------------------------------------------------------------
// Satırları sunucu yazar (GET /ik/veri gecmis, son 1000); burada yalnız süzülür ve okunur hale gelir.

export interface GunlukDegisikligi { f: string; from?: unknown; to?: unknown; big?: boolean; gizli?: boolean }
export interface GunlukSatiri {
  id: string; t: string; by?: { id?: number | string; name?: string } | null; op: string; rk?: string; rid?: string; label?: string; note?: string | null;
  changes?: readonly GunlukDegisikligi[]; snap?: unknown;
}
export interface GunlukSuzgeci { q?: string; gun?: string; op?: string; rk?: string; by?: string }

export const ISLEM_ADLARI: Readonly<Record<string, readonly [ad: string, ton: '' | 'ok' | 'info' | 'bad' | 'warn']>> = {
  ekle: ['Ekledi', 'ok'], guncelle: ['Güncelledi', 'info'], sil: ['Sildi', 'bad'], ayarlar: ['Ayarları değiştirdi', 'warn'], toplu: ['Toplu işlem', ''], geri: ['Geri aldı', 'warn'],
};
export const TUR_ADLARI: Readonly<Record<string, string>> = {
  emp: 'Personel', dept: 'Departman', leave: 'İzin', att: 'Devam / mesai kaydı', perf: 'Performans değerlendirmesi', train: 'Eğitim', job: 'Pozisyon', cand: 'Aday', intv: 'Görüşme', asset: 'Zimmet', pay: 'Bordro', log: 'Günlük',
};
export const turAdi = (k: string): string => TUR_ADLARI[k] ?? k;
const OZEL_ALAN_ADLARI: Readonly<Record<string, string>> = {
  belgeler: 'Özlük belgeleri', ucretGecmisi: 'Ücret geçmişi', hareketler: 'Görev değişiklikleri', notlar: 'Notlar', cikisListesi: 'Çıkış kontrol listesi', yayinlar: 'İlan yayınları',
  durum: 'Durum', karar: 'Karar tarihi', snap: 'Bordro sonucu', donemler: 'Parametre dönemleri', gorevler: 'Yapılacaklar durumu', maliyetPlani: 'Maliyet planı', soruSetleri: 'Soru setleri', ilanKanallari: 'İlan kanalları',
};
export const alanAdi = (adlar: Readonly<Record<string, Readonly<Record<string, string>>>>, tur: string | undefined, f: string): string =>
  adlar[tur ?? '']?.[f] ?? OZEL_ALAN_ADLARI[f] ?? f;

export const GUNLUK_SAYFASI = 150;

export function gunlukSuz(satirlar_: readonly GunlukSatiri[], s: GunlukSuzgeci, adlar: Readonly<Record<string, Readonly<Record<string, string>>>>, bugun: Date): GunlukSatiri[] {
  const q = (s.q ?? '').toLocaleLowerCase('tr');
  const gun = s.gun ?? '30';
  const once = gun === 'tum' ? '' : gunMetni(gunEkle(bugun, -Number(gun)));
  return satirlar_.filter((l) => (!once || l.t.slice(0, 10) >= once) && (!s.op || l.op === s.op) && (!s.rk || l.rk === s.rk) && (!s.by || l.by?.name === s.by)
    && (!q || [l.label, l.by?.name, (l.changes ?? []).map((c) => alanAdi(adlar, l.rk, c.f)).join(' ')].join(' ').toLocaleLowerCase('tr').includes(q)))
    .sort((a, b) => b.t.localeCompare(a.t));
}

export function gunlukGruplari(satirlar_: readonly GunlukSatiri[]): [gun: string, satirlar: GunlukSatiri[]][] {
  const g: [string, GunlukSatiri[]][] = [];
  for (const l of satirlar_) { const d = l.t.slice(0, 10); const son = g[g.length - 1]; if (son && son[0] === d) son[1].push(l); else g.push([d, [l]]); }
  return g;
}

export const gunlukKisileri = (s: readonly GunlukSatiri[]): string[] => [...new Set(s.map((l) => l.by?.name).filter((x): x is string => !!x))].sort();
export const gunlukTurleri = (s: readonly GunlukSatiri[]): string[] => [...new Set(s.map((l) => l.rk).filter((x): x is string => !!x))];

// Kaydın günlükteki adı (bugünkü ekranın "ts" kuralı); bağlı kişi ve aday adı depodan çözülür.
export function kayitEtiketi(k: Readonly<Record<string, unknown>> | null, al: (id: string) => Readonly<Record<string, unknown>> | null): string {
  if (!k) return '';
  const m = (x: unknown) => (typeof x === 'string' ? x : '');
  const kisi = () => { const e = al(m(k['empId'])); return e ? adSoyad(e) : '—'; };
  switch (k['kind']) {
    case 'emp': return adSoyad(k);
    case 'dept': case 'train': return m(k['ad']);
    case 'job': return m(k['ilanBaslik']) || m(k['baslik']);
    case 'cand': return adayAdi(k as Aday);
    case 'leave': return `${kisi()}: ${m(k['tur'])} ${tarih(k['baslangic'])}–${tarih(k['bitis'])}`;
    case 'pay': return `${kisi()}: ${m(k['donem'])} bordrosu`;
    case 'att': return `${kisi()}: ${m(k['tur'])} ${tarih(k['tarih'])}`;
    case 'perf': return `${kisi()}: ${m(k['donem'])} değerlendirmesi`;
    case 'intv': return `${adayAdi(al(m(k['candId'])) as Aday | null)}: ${m(k['tur'])}`;
    default: return m(k['id']);
  }
}

// Değeri okunur yazar: tarih, evet/hayır, öğe sayısı, kayıt kimliği yerine kaydın adı; uzun metin kısalır.
export function gunlukDegeri(v: unknown, kayitAdi: (id: string) => string | null): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  if (typeof v === 'object') return Array.isArray(v) ? `${v.length} öğe` : `${Object.keys(v).length} alan`;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return uzunTarih(s);
  if (/^[a-z]+_[a-z0-9_]+$/i.test(s)) { const a = kayitAdi(s); if (a !== null) return a; }
  return s.length > 90 ? `${s.slice(0, 90)}…` : s;
}

export const degisiklikOzeti = (l: GunlukSatiri, adlar: Readonly<Record<string, Readonly<Record<string, string>>>>): string => {
  const ch = l.changes ?? [];
  return ch.slice(0, 3).map((c) => alanAdi(adlar, l.rk, c.f)).join(', ') + (ch.length > 3 ? ` ve ${ch.length - 3} alan daha` : '');
};

// Gizli alan (ücret, kimlik) yalnız "değişti" diye görünür; büyük değer açılmaz.
export const buyukDeger = (c: GunlukDegisikligi): string | null => (c.big ? (c.gizli ? 'değişti' : 'büyük değer') : null);

// Geri alma ve geri getirme kaydın kendi yazma işlemini ister (sunucudaki IK_ALANLARI); bordro sunucuda hesaplanır, geri alınmaz.
export const GUNLUK_YAZMASI: Readonly<Record<string, keyof IkYetkisi>> = {
  emp: 'personelYaz', dept: 'personelYaz', leave: 'izinYaz', att: 'devamYaz', perf: 'performansYaz', train: 'egitimYaz', job: 'iseAlimYaz', cand: 'iseAlimYaz', intv: 'iseAlimYaz',
};
export const gunlukYazabilir = (l: GunlukSatiri, yetki: IkYetkisi): boolean => { const y = GUNLUK_YAZMASI[l.rk ?? '']; return y !== undefined && yetki[y]; };
export const geriAlinabilir = (l: GunlukSatiri, kayitVar: boolean): boolean =>
  l.op === 'guncelle' && kayitVar && (l.changes ?? []).length > 0 && (l.changes ?? []).every((c) => !c.big);
export const geriGetirilebilir = (l: GunlukSatiri, kayitVar: boolean): boolean => l.op === 'sil' && !!l.snap && !kayitVar;

// Geri alma: değişiklikten önceki değerler; o alanlar sonradan yeniden değiştiyse çakışma listesi döner (ekran onay sorar).
export function geriAlmaKaydi(kayit: Readonly<Record<string, unknown>>, l: GunlukSatiri, adlar: Readonly<Record<string, Readonly<Record<string, string>>>>) {
  const yeni: Record<string, unknown> = { ...kayit };
  const cakisan: string[] = [];
  for (const c of l.changes ?? []) {
    if (JSON.stringify(kayit[c.f] ?? null) !== JSON.stringify(c.to ?? null)) cakisan.push(alanAdi(adlar, l.rk, c.f));
    if (c.from === null || c.from === undefined) delete yeni[c.f];
    else yeni[c.f] = c.from;
  }
  return { yeni, cakisan };
}

export function gunlukCsv(satirlar_: readonly GunlukSatiri[], adlar: Readonly<Record<string, Readonly<Record<string, string>>>>, kayitAdi: (id: string) => string | null) {
  const out: string[][] = [];
  for (const l of [...satirlar_].sort((a, b) => b.t.localeCompare(a.t))) {
    const ch: (GunlukDegisikligi | null)[] = l.changes?.length ? [...l.changes] : [null];
    for (const c of ch) {
      const deger = (x: unknown) => (c ? buyukDeger(c) ?? gunlukDegeri(x, kayitAdi) : '');
      out.push([l.t.replace('T', ' ').slice(0, 19), l.by?.name ?? '', (ISLEM_ADLARI[l.op] ?? [l.op])[0], turAdi(l.rk ?? ''), l.label ?? '', c ? alanAdi(adlar, l.rk, c.f) : '', deger(c?.from), deger(c?.to)]);
    }
  }
  return { basliklar: ['Zaman', 'Kişi', 'İşlem', 'Kayıt türü', 'Kayıt', 'Alan', 'Önce', 'Sonra'], satirlar: out };
}

// Kıdem metni ("3 yıl 2 ay"; bir aydan kısaysa gün).
export function sureMetni(a: Date, b: Date): string {
  if (b < a) return '0 gün';
  const y = tamYil(a, b);
  let c = ayEkle(a, 12 * y);
  let ay = 0;
  while (ayEkle(c, 1) <= b) { c = ayEkle(c, 1); ay++; }
  const out: string[] = [];
  if (y) out.push(`${y} yıl`);
  if (ay) out.push(`${ay} ay`);
  if (!y && !ay) out.push(`${gunFarki(c, b)} gün`);
  return out.join(' ');
}
