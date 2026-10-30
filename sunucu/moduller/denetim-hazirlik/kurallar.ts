import { AZAMI_SINIR } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import type { Filtre, OlcuAletleriCevabi, Sira } from '#paylasilan/sozlesme/denetim-hazirlik.ts';

// Belge deposunun kuralları: yol, kişiye özel alan, birleştirme, sorgu, kilit, oda. Saf; veritabanı ve saat yok.

export type Veri = Record<string, unknown>;
export interface DepoBelgesi { yol: string; kimlik: string; veri: Veri; surum: number }

export const parcalar = (yol: string): string[] => yol.split('/');
export const ustYolu = (yol: string): string => parcalar(yol).slice(0, -1).join('/');
export const sonParca = (yol: string): string => parcalar(yol).at(-1) ?? '';

// Kişiye özel alan: `data/users/<kişi>/...` yalnız o kişiye açıktır (prototiplerin sözleşmesi). `data/users`un kendisi
// kimseye açık değildir: kişiler birbirinin kimliğini oradan listeleyemez.
export function erisebilirMi(yol: string, kisiId: number): boolean {
  const p = parcalar(yol);
  if (p[0] !== 'data' || p.length < 2 || p[1] !== 'users') return true;
  return p.length >= 3 && p[2] === String(kisiId);
}

// Ek kotası (GG-1). VARSAYIM: prototip ve TS ekranı ek yüklemiyor; sınır yalnız uca doğrudan yüklemeyle veritabanının
// doldurulmasını keser. Kişi başına 50 MB, modül toplamı 1 GiB.
export const EK_SINIRI = { kisiBayt: 50 * 1024 ** 2, toplamBayt: 1024 ** 3 } as const;

export function ekKotaReddi(
  d: { kisiBayt: number; toplamBayt: number; yeniBayt: number }, sinir: { kisiBayt: number; toplamBayt: number } = EK_SINIRI,
): 'kisi' | 'toplam' | null {
  if (d.kisiBayt + d.yeniBayt > sinir.kisiBayt) return 'kisi';
  if (d.toplamBayt + d.yeniBayt > sinir.toplamBayt) return 'toplam';
  return null;
}

// Prototip eki belgede `/_blob/<kimlik>` adresiyle anar (köprü bu adresi çevirir).
export const ekAnmasi = (id: string): string => `/_blob/${id}`;

// Ekin okunması belgeye bağlıdır (GG-1): yükleyen ya da eki anan ve okuyanın açabildiği bir belge. Kimliği bilmek yetmez.
export function ekOkunurMu(yukleyenKisiId: number, ananYollar: readonly string[], kisiId: number): boolean {
  return yukleyenKisiId === kisiId || ananYollar.some((yol) => izinliBelgeMi(yol) && erisebilirMi(yol, kisiId));
}

// Genel depo ucu yalnız prototipin kalıcı yerel depo anahtarlarına açıktır (istemcideki `YEREL.onekler` ile aynı): prototip
// başka koleksiyon kullanmaz, uç başka yola yazma ve okuma kapısı olmasın. Kök ortak (`yerel`) ya da kişisel
// (`data/users/<kişi>/yerel/anahtarlar`); anahtar köprüde kodlanır, öneklerde kodlanan karakter yoktur.
export const YEREL_ONEKLERI: readonly string[] = ['kalite-denetim'];
const KISISEL_KOK_UZUNLUGU = 5;

export function izinliKoleksiyonMu(koleksiyon: string): boolean {
  const p = parcalar(koleksiyon);
  if (p.length === 1) return p[0] === 'yerel';
  return p.length === KISISEL_KOK_UZUNLUGU && p[0] === 'data' && p[1] === 'users' && p[3] === 'yerel' && p[4] === 'anahtarlar';
}

export function izinliBelgeMi(yol: string): boolean {
  const anahtar = sonParca(yol);
  return izinliKoleksiyonMu(ustYolu(yol)) && YEREL_ONEKLERI.some((o) => anahtar.startsWith(o));
}

// Ortak kayıt: prototipin yerel deposu (`yerel/<anahtar>`) bütün yazarların birlikte düzenlediği tek durumdur; aynı anda
// yazmayı sürüm denetimi korur. Öteki her var olan belgeyi yalnız oluşturan kişi değiştirir ya da siler (kişiye özel alan
// zaten yalnız sahibine açıktır).
export const ORTAK_KOK = 'yerel';
export function degistirebilirMi(yol: string, kisiId: number, olusturanKisiId: number | null): boolean {
  if (parcalar(yol)[0] === ORTAK_KOK) return true;
  return olusturanKisiId === kisiId;
}

const duzNesneMi = (d: unknown): d is Veri => d !== null && typeof d === 'object' && !Array.isArray(d);

// 226 a: ortak kayıt prototipin bütün profillerini tek belgede tutar (`veri.deger` içinde `{ data: { <id>: profil } }` metni); kural
// yazmanın sonucuna bakar. Profil sayısını düşüren (profil silme, "Tümünü sil") ya da dolu kaydı
// boşaltan ya da okunamaz kılan yazma ve dolu kaydın silinmesi yönetim ister. Okunamayan eski kayıt korunacak veri sayılmaz.
// "Dolu" prototipin `isEmptyProfile` tanımıdır: firma adı, takvim ya da bir programda cevap, işaret, not.
const PROGRAM_ALANLARI = ['ans', 'checks', 'docs', 'cards', 'trace', 'notes'] as const;
const doluNesneMi = (d: unknown): boolean => duzNesneMi(d) && Object.keys(d).length > 0;

function doluProfilMi(p: unknown): boolean {
  if (!duzNesneMi(p)) return false;
  const bilgi = p['profile'];
  if (duzNesneMi(bilgi) && typeof bilgi['firma'] === 'string' && bilgi['firma'] !== '') return true;
  if (Array.isArray(p['audits']) && p['audits'].length > 0) return true;
  const pw = p['pw'];
  return duzNesneMi(pw) && Object.values(pw).some((w) => duzNesneMi(w) && PROGRAM_ALANLARI.some((k) => doluNesneMi(w[k])));
}

export interface KayitOzeti { profil: number; dolu: number }

// Belge yoksa sıfır; `deger` prototip deposu olarak okunamıyorsa null.
export function kayitOzeti(veri: Veri | null): KayitOzeti | null {
  if (veri === null) return { profil: 0, dolu: 0 };
  const deger = veri['deger'];
  if (typeof deger !== 'string') return null;
  let depo: unknown;
  try { depo = JSON.parse(deger); } catch { return null; }
  if (!duzNesneMi(depo) || !duzNesneMi(depo['data'])) return null;
  const profiller = Object.values(depo['data']);
  return { profil: profiller.length, dolu: profiller.filter(doluProfilMi).length };
}

// `yeni` null ise silmedir.
export function yonetimGerekirMi(yol: string, eski: Veri | null, yeni: Veri | null): boolean {
  if (parcalar(yol)[0] !== ORTAK_KOK || eski === null) return false;
  const once = kayitOzeti(eski);
  if (once === null || once.profil === 0) return false;
  const sonra = kayitOzeti(yeni);
  if (sonra === null) return once.dolu > 0;
  return sonra.profil < once.profil || (once.dolu > 0 && sonra.dolu === 0);
}

// İç içe nesneler birleşir; dizi ve öteki her değer alanı olduğu gibi değiştirir. Girdiler değişmez.
export function derinBirlestir(hedef: Veri, yama: Veri): Veri {
  const sonuc: Veri = { ...hedef };
  for (const [anahtar, deger] of Object.entries(yama)) {
    const eski = sonuc[anahtar];
    sonuc[anahtar] = duzNesneMi(deger) && duzNesneMi(eski) ? derinBirlestir(eski, deger) : deger;
  }
  return sonuc;
}

// Tür sırası: null < mantıksal < sayı < metin < dizi < nesne. Aynı türde doğal sıra; dizi ve nesne metniyle.
function turSirasi(d: unknown): number {
  if (d === null) return 0;
  if (typeof d === 'boolean') return 1;
  if (typeof d === 'number') return 2;
  if (typeof d === 'string') return 3;
  if (Array.isArray(d)) return 4;
  return 5;
}

export function karsilastir(a: unknown, b: unknown): number {
  const ta = turSirasi(a);
  const tb = turSirasi(b);
  if (ta !== tb) return ta - tb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  return ja < jb ? -1 : ja > jb ? 1 : 0;
}

const esitMi = (a: unknown, b: unknown): boolean => turSirasi(a) === turSirasi(b) && karsilastir(a, b) === 0;

// Alanı olmayan belge hiçbir koşula uymaz (eşit değil koşulu dahil).
export function uyarMi(veri: Veri, f: Filtre): boolean {
  if (!Object.hasOwn(veri, f.alan)) return false;
  const d = veri[f.alan];
  switch (f.islec) {
    case '==': return esitMi(d, f.deger);
    case '!=': return !esitMi(d, f.deger);
    case '<': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) < 0;
    case '<=': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) <= 0;
    case '>': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) > 0;
    case '>=': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) >= 0;
    case 'in': return Array.isArray(f.deger) && f.deger.some((x) => esitMi(d, x));
    case 'not-in': return Array.isArray(f.deger) && !f.deger.some((x) => esitMi(d, x));
    case 'array-contains': return Array.isArray(d) && d.some((x) => esitMi(x, f.deger));
  }
}

export interface SorguKosulu { filtreler?: readonly Filtre[]; sira?: Sira; sinir?: number }

// Sırasız sorgu kimliğe göre artan döner. Sıralama alanı olmayan belge sona düşer; eşitlikte kimlik belirler.
export function sorgula<T extends DepoBelgesi>(belgeler: readonly T[], kosul: SorguKosulu): T[] {
  const uyan = belgeler.filter((b) => (kosul.filtreler ?? []).every((f) => uyarMi(b.veri, f)));
  const kimlikle = (a: T, b: T): number => (a.kimlik < b.kimlik ? -1 : a.kimlik > b.kimlik ? 1 : 0);
  const sira = kosul.sira;
  const sirali = [...uyan].sort((a, b) => {
    if (sira === undefined) return kimlikle(a, b);
    const varA = Object.hasOwn(a.veri, sira.alan);
    const varB = Object.hasOwn(b.veri, sira.alan);
    if (varA !== varB) return varA ? -1 : 1;
    const fark = varA ? karsilastir(a.veri[sira.alan], b.veri[sira.alan]) : 0;
    return (sira.yon === 'desc' ? -fark : fark) || kimlikle(a, b);
  });
  return sirali.slice(0, Math.min(kosul.sinir ?? AZAMI_SINIR, AZAMI_SINIR));
}

// Kilit kısa süreli ve işbirliğine dayalıdır: süresi geçmiş ya da aynı sahibin kilidi yeniden alınır.
export function kilitAlinirMi(mevcut: { sahip: string | null; bitis: number | null }, sahip: string, simdi: number): boolean {
  return mevcut.sahip === null || mevcut.bitis === null || mevcut.bitis <= simdi || mevcut.sahip === sahip;
}

// Oda: sayfası o an açık olanlar. Durum yaması birleşir; null değer alanı siler. Son görülmeden bu yana süre geçen düşer.
export const ODA_SURESI_MS = 45_000;
export interface OdaKaydi { durum: Veri; guncellendi: number }

export function durumYamala(eski: Veri, yama: Veri): Veri {
  const yeni: Veri = { ...eski };
  for (const [anahtar, deger] of Object.entries(yama)) {
    if (deger === null) delete yeni[anahtar];
    else yeni[anahtar] = deger;
  }
  return yeni;
}

export function canliEsler(oda: ReadonlyMap<number, OdaKaydi>, simdi: number): { kisiId: number; durum: Veri; guncellendi: number }[] {
  return [...oda.entries()]
    .filter(([, k]) => simdi - k.guncellendi < ODA_SURESI_MS)
    .map(([kisiId, k]) => ({ kisiId, durum: k.durum, guncellendi: k.guncellendi }))
    .sort((a, b) => a.kisiId - b.kisiId);
}

// Boş depoda prototipin açılabilmesi için gereken yapısal belgeler (gerçek veri değil, prototipin varsayılanları).
export interface BaslangicBelgesi { yol: string; veri: Veri }
export interface KurucuKisi { id: number; ad: string }
export const KURULUM_ISARETI: string | null = null;

// Prototip yalnız yerel deposunu kullanır; başlangıç belgesi gerekmez.
export function baslangicBelgeleri(kisi: KurucuKisi, simdiMs: number): BaslangicBelgesi[] {
  void kisi;
  void simdiMs;
  return [];
}

// 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon modülüdür; prototipin kalibrasyon sekmesindeki cihaz listesi ondan salt okunur
// gelir. Kalibrasyonda karşılığı olmayan alanlar (marka, seri, çözünürlük, sorumlu, laboratuvar, kabul, kalibrasyon türü) hiç
// gönderilmez. Vade, prototipin "elle girilen sonraki tarih" alanına yazılır: durum Kalibrasyonun hesabıyla aynı çıkar.
export interface OlcuAleti {
  id: number; no: string; tur: string; ad: string | null; olcmeAraligi: string | null; yer: string | null; periyotGun: number;
  kullanimDisi: boolean; sonKalibrasyon: string | null; vade: string | null;
  kayitlar: readonly { tarih: string; sonuc: 'uygun' | 'uygunsuz'; sertifikaNo: string | null; aciklama: string | null }[];
}
export const OLCU_ALETI_KAYIT_ADEDI = 20;

export function olcuAletleriKaydi(aletler: readonly OlcuAleti[]): OlcuAletleriCevabi['aletler'] {
  return aletler.map((a) => {
    // Kayıtlar eskiden yeniye gelir; prototipin geçmişi yeniden eskiye tutulur.
    const hist = [...a.kayitlar].reverse().map((k) => ({
      date: k.tarih, res: k.sonuc === 'uygun' ? 'uygun' as const : 'red' as const, lab: '', cert: k.sertifikaNo ?? '', note: k.aciklama ?? '',
    }));
    return {
      id: `kal-${String(a.id)}`,
      no: a.no,
      ad: a.ad ?? a.tur,
      yer: a.yer ?? '',
      aralik: a.olcmeAraligi ?? '',
      periyotGun: a.periyotGun,
      per: a.periyotGun / 30,
      last: a.sonKalibrasyon ?? '',
      nx: a.vade ?? '',
      st: a.kullanimDisi ? 'disi' as const : 'aktif' as const,
      res: hist[0]?.res ?? '',
      cert: hist[0]?.cert ?? '',
      hist,
    };
  });
}

// Takvim (891): ortak kayıttaki (`yerel/kalite-denetim-v4`) bütün profillerin denetimleri ve son günleri, tarihi [baslangic, bitis]
// içindekiler. İptal edilen gelmez; yapılan denetim bitti, geçmiş son gün bitti sayılır (ekrandaki takvimin "geçmiş" ayrımı).
// Okunamayan kayıt ve alan atlanır: kayıt prototip biçimindedir, sunucu ona yazmaz.
export const ORTAK_KAYIT_YOLU = `${ORTAK_KOK}/kalite-denetim-v4`;
const PROGRAM_KISA_ADLARI: Readonly<Record<string, string>> = { iso9001: 'ISO 9001', as9100: 'AS9100', eydep: 'EYDEP' };
const TARIH = /^\d{4}-\d{2}-\d{2}$/;
const metin = (d: unknown): string => (typeof d === 'string' ? d : '');

export interface TakvimDenetimi {
  kimlik: string; tarih: string; baslik: string; profil: string; durum: 'Planlı' | 'Yapıldı' | 'Son gün' | 'Son günü geçti' | 'Sonuç girilmedi'; bitti: boolean;
}

export function takvimDenetimleri(veri: Veri | null, baslangic: string, bitis: string, bugun: string): TakvimDenetimi[] {
  const deger = veri?.['deger'];
  if (typeof deger !== 'string') return [];
  let depo: unknown;
  try { depo = JSON.parse(deger); } catch { return []; }
  if (!duzNesneMi(depo) || !duzNesneMi(depo['data'])) return [];
  const sonuc: TakvimDenetimi[] = [];
  for (const [pid, p] of Object.entries(depo['data'])) {
    if (!duzNesneMi(p) || !Array.isArray(p['audits'])) continue;
    const bilgi = p['profile'];
    const profil = (duzNesneMi(bilgi) ? metin(bilgi['firma']) : '') || 'Adsız profil';
    for (const a of p['audits'] as unknown[]) {
      if (!duzNesneMi(a)) continue;
      const tarih = metin(a['date']);
      const id = metin(a['id']);
      const durum = metin(a['status']);
      if (!TARIH.test(tarih) || id === '' || durum === 'cancel' || tarih < baslangic || tarih > bitis) continue;
      const sonGun = a['kind'] === 'deadline';
      const program = PROGRAM_KISA_ADLARI[metin(a['prog'])];
      const ad = metin(a['type']) || (sonGun ? 'Son gün' : 'Denetim');
      const bitti = sonGun ? tarih < bugun : durum === 'done';
      sonuc.push({
        kimlik: `${pid}/${id}`, tarih, baslik: program === undefined ? ad : `${program} · ${ad}`, profil,
        durum: sonGun ? (bitti ? 'Son günü geçti' : 'Son gün') : durum === 'done' ? 'Yapıldı' : (metin(a['end']) || tarih) < bugun ? 'Sonuç girilmedi' : 'Planlı',
        bitti,
      });
    }
  }
  return sonuc.sort((x, y) => (x.tarih < y.tarih ? -1 : x.tarih > y.tarih ? 1 : x.kimlik < y.kimlik ? -1 : 1));
}
