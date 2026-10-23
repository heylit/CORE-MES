import { AZAMI_SINIR } from '#paylasilan/sozlesme/mesaj.ts';
import type { Filtre, Sira } from '#paylasilan/sozlesme/mesaj.ts';

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

const duzNesneMi = (d: unknown): d is Veri => d !== null && typeof d === 'object' && !Array.isArray(d);

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
// Prototip kanal listesi boşken sohbet açamaz; prototipin kendi örneğindeki iki yapısal kanal kurulur (ileti yok).
export const KURULUM_ISARETI: string | null = 'channels/genel';

export function baslangicBelgeleri(kisi: KurucuKisi, simdiMs: number): BaslangicBelgesi[] {
  const kanal = (kimlik: string, name: string, emoji: string, topic: string): BaslangicBelgesi => ({
    yol: `channels/${kimlik}`,
    veri: { name, emoji, topic, createdAt: simdiMs, createdBy: String(kisi.id), lastAt: simdiMs, lastBy: String(kisi.id) },
  });
  return [
    kanal('genel', 'genel', '\u{1F4AC}', 'Herkes için genel sohbet'),
    kanal('duyurular', 'duyurular', '\u{1F4E3}', 'Resmî duyurular'),
  ];
}

// Yazma hakkı: depo gövdeyi yorumlamaz ama kişiye bağlı alanları yorumlar; yoksa yazma yetkisi olan herkes başkası
// adına ileti atar, başkasının iletisini siler ya da başkası adına "okudum" işaretler (KD-050).
// Prototipte kişi kimliği metindir; kişiye ait harita anahtarı prototipin `sk` kodlamasıyla yazılır.
export const kisiAnahtari = (id: string): string => id.replace(/[^A-Za-z0-9_-]/g, (c) => `_x${c.charCodeAt(0).toString(16)}_`);

// Otomatik uyarıların göndereni; kişi değildir, yalnız `auto` türlü iletide ve kanal özetinde geçer.
export const BOT = '__bot';
// Zamanlanmış ileti, o an sayfası açık herhangi bir yazarın sekmesinden zamanlayan adına gönderilir.
export const ZAMANLI_PENCERE_MS = 5 * 60_000;

const GONDEREN_ALANLARI = ['by', 'lastBy', 'everyoneBy'] as const;
const IZ_ALANLARI = ['last', 'lastEntry'] as const;
// Anahtarı kişi olan haritalar: kişi yalnız kendi anahtarını değiştirir. `rx` iki katlıdır (tepki, kişi).
const KISI_HARITALARI = ['ack', 'votes', 'rsvp', 'qty'] as const;

// Sahipli belgelerde başkasının birleştirebileceği alanlar; içerik (metin, silindi, ek, başlık) yalnız sahibinde ve yöneticide.
// Kanala ileti atan, kanalın son ileti özetini, anmalarını ve @herkes zamanını yazar; adı, konusu, simgesi kanalı açanındır.
// Sipariş, otomatik uyarı, e-posta kuyruğu ve tetik kaydını başkası hiç değiştirmez.
const BASKASININ_ALANLARI: Readonly<Record<string, readonly string[]>> = {
  ileti: ['rx'],
  duyurular: ['ack', 'mid'],
  approvals: ['votes', 'last'],
  toplantilar: ['rsvp', 'last'],
  zamanli: ['status', 'sentAt', 'sendAt', 'lastSent'],
  channels: ['lastAt', 'lastBy', 'lastText', 'lastTs', 'mentions', 'everyone', 'everyoneBy'],
  orders: [],
  kurallar: [],
  eposta: [],
  tetikler: [],
};
// Görevler ortak düzenlenir (prototip her yazara açar), silinmeleri yalnız sahibine ve yöneticiye açıktır.
const SILMESI_SAHIPLI = new Set([...Object.keys(BASKASININ_ALANLARI), 'tasks']);
// Kanalın sahibi onu açandır; öteki sahipli kayıtlarda `by`.
const SAHIP_ALANI: Readonly<Record<string, string>> = { channels: 'createdBy' };

export function koleksiyonTuru(yol: string): string | null {
  const p = parcalar(yol);
  if (p.length === 4 && p[0] === 'channels' && p[2] === 'msgs') return 'ileti';
  return p.length === 2 ? (p[0] ?? null) : null;
}

const metinMi = (d: unknown): d is string => typeof d === 'string';
const sahipAlani = (tur: string | null): string => (tur === null ? 'by' : SAHIP_ALANI[tur] ?? 'by');
const sahibi = (tur: string | null, veri: Veri | null): string | null => {
  const d = veri?.[sahipAlani(tur)];
  return metinMi(d) ? d : null;
};

// Okundu belgesi `okuma/<kişi>` yalnız o kişinindir; yönetici de başkasının okundu bilgisini yazamaz.
export const OKUMA_ILETISI = 'Başka bir kişinin okundu bilgisi yazılamaz.';
function okumaDenetle(yol: string, ben: string): string | null {
  const p = parcalar(yol);
  if (p[0] !== 'okuma' || p.length !== 2) return null;
  return p[1] === ben || p[1] === kisiAnahtari(ben) ? null : OKUMA_ILETISI;
}

function kanalOf(yol: string, veri: Veri, mevcut: Veri | null): string | null {
  const p = parcalar(yol);
  if (p[0] === 'channels') return p[1] ?? null;
  const cid = veri.cid ?? mevcut?.cid;
  return metinMi(cid) ? cid : null;
}

// Kanal özeti kişi ve kanalla, ileti ve duyuru ayrıca metinle eşleşir: zamanlayan adına yalnız zamanladığı metin gider.
export const zamanliAnahtari = (kisi: string, kanal: string, metin?: string): string =>
  metin === undefined ? `${kisi}/${kanal}` : `${kisi}/${kanal}/${metin}`;

// Son pencerede gönderilmiş zamanlanmış iletilerin sahibi, kanalı ve metni; o kişi adına yazmanın tek dayanağı.
export function zamanliGonderenler(belgeler: readonly DepoBelgesi[], simdi: number): Set<string> {
  const sonuc = new Set<string>();
  for (const { veri } of belgeler) {
    const an = typeof veri.sentAt === 'number' ? veri.sentAt : typeof veri.lastSent === 'number' ? veri.lastSent : null;
    if (an === null || !metinMi(veri.by) || !metinMi(veri.cid) || Math.abs(simdi - an) > ZAMANLI_PENCERE_MS) continue;
    sonuc.add(zamanliAnahtari(veri.by, veri.cid));
    if (metinMi(veri.text)) sonuc.add(zamanliAnahtari(veri.by, veri.cid, veri.text));
  }
  return sonuc;
}

// Gövdede yazandan başka bir kişiye gönderen yazılıyor mu (zamanlanmış ileti denetimi yalnız o zaman gerekir).
export function yabanciGonderenVar(veri: Veri, mevcut: Veri | null, ben: string): boolean {
  return GONDEREN_ALANLARI.some((a) => metinMi(veri[a]) && veri[a] !== ben && veri[a] !== BOT && veri[a] !== mevcut?.[a]);
}

export interface YazmaIstegi {
  yol: string;
  kip: 'tam' | 'birlestir';
  veri: Veri;
  mevcut: Veri | null;
  ben: string;
  yonetici: boolean;
  simdi: number;
  zamanli: ReadonlySet<string>;
}

// `esitMi` yokluğu nesneyle bir tutar (ikisi de en üst tür sırasında); yeni alan her zaman değişiklik sayılır.
const ayniMi = (yeni: unknown, eski: unknown): boolean => eski !== undefined && esitMi(yeni, eski);

function gonderenDenetle(i: YazmaIstegi): string | null {
  const kanal = kanalOf(i.yol, i.veri, i.mevcut);
  const tur = koleksiyonTuru(i.yol);
  const metin = tur === 'ileti' || tur === 'duyurular' ? (metinMi(i.veri.text) ? i.veri.text : '') : undefined;
  for (const alan of GONDEREN_ALANLARI) {
    const d = i.veri[alan];
    if (d === undefined || d === i.mevcut?.[alan] || d === i.ben) continue;
    if (d === BOT && (alan !== 'by' || i.veri.kind === 'auto')) continue;
    if (metinMi(d) && kanal !== null && i.zamanli.has(zamanliAnahtari(d, kanal, metin))) continue;
    return 'Başka bir kişi adına yazılamaz.';
  }
  for (const alan of IZ_ALANLARI) {
    const iz = i.veri[alan];
    if (duzNesneMi(iz) && !ayniMi(iz, i.mevcut?.[alan]) && iz.by !== undefined && iz.by !== i.ben) return 'Başka bir kişi adına yazılamaz.';
  }
  return null;
}

function kisiDegeriUyarMi(harita: string, deger: unknown, ben: string): boolean {
  if (deger === null || deger === '' || harita === 'qty') return true;
  if (harita === 'ack' || harita === 'rx') return deger === ben;
  return duzNesneMi(deger) && deger.u === ben;
}

function haritaDenetle(harita: string, yeni: unknown, eski: unknown, ben: string): boolean {
  if (!duzNesneMi(yeni)) return true;
  const onceki = duzNesneMi(eski) ? eski : {};
  const benimki = kisiAnahtari(ben);
  return Object.entries(yeni).every(([k, d]) =>
    ayniMi(d, onceki[k]) || (k === benimki && kisiDegeriUyarMi(harita, d, ben)));
}

function kisiHaritalariDenetle(i: YazmaIstegi): string | null {
  for (const h of KISI_HARITALARI) {
    if (!haritaDenetle(h, i.veri[h], i.mevcut?.[h], i.ben)) return 'Başka bir kişinin yanıtı, onayı ya da okundu işareti yazılamaz.';
  }
  const rx = i.veri.rx;
  if (duzNesneMi(rx)) {
    const eski = duzNesneMi(i.mevcut?.rx) ? i.mevcut.rx : {};
    if (!Object.entries(rx).every(([k, d]) => haritaDenetle('rx', d, eski[k], i.ben))) return 'Başka bir kişinin tepkisi yazılamaz.';
  }
  return null;
}

function sahiplikDenetle(i: YazmaIstegi): string | null {
  const tur = koleksiyonTuru(i.yol);
  if (i.yonetici || tur === null || !SILMESI_SAHIPLI.has(tur)) return null;
  const alan = sahipAlani(tur);
  const yeniSahip = i.veri[alan];
  const sahip = sahibi(tur, i.mevcut);
  // `by` gönderen denetiminde; öteki sahip alanı (kanalı açan) yeni kayıtta yazanın kendisi olmalı.
  if (sahip === null) {
    const baskasiAdina = i.mevcut === null && alan !== 'by' && metinMi(yeniSahip) && yeniSahip !== i.ben;
    return baskasiAdina ? 'Kayıt başka bir kişi adına açılamaz.' : null;
  }
  if (metinMi(yeniSahip) && yeniSahip !== sahip) return 'Kaydın sahibi değiştirilemez.';
  const izinli = BASKASININ_ALANLARI[tur];
  if (sahip === i.ben || izinli === undefined) return null;
  if (i.kip === 'tam') return 'Başkasının kaydı yalnız sahibince ya da yöneticice değiştirilir.';
  for (const alan of Object.keys(i.veri)) {
    if (!izinli.includes(alan)) return 'Başkasının kaydı yalnız sahibince ya da yöneticice değiştirilir.';
  }
  if (i.veri.mid !== undefined && i.mevcut?.mid != null && i.veri.mid !== i.mevcut.mid) return 'Başkasının kaydı yalnız sahibince ya da yöneticice değiştirilir.';
  if (tur === 'zamanli') {
    const vakti = i.mevcut?.status === 'bekliyor' && typeof i.mevcut.sendAt === 'number' && i.mevcut.sendAt <= i.simdi + ZAMANLI_PENCERE_MS;
    const durum = i.veri.status;
    if (!vakti || (durum !== undefined && durum !== 'gonderildi' && durum !== 'iptal')) {
      return 'Başkasının zamanlanmış iletisi yalnız vakti gelince gönderildi ya da iptal olarak işaretlenir.';
    }
  }
  return null;
}

// 311 a: üretim adedi yalnız Üretim Terminali'nden girilir; buradaki giriş üretim emrine gitmez ve emirle ayrı bir sayı tutardı.
// Yeni sipariş boş adetle açılabilir; giriş defteri, kişi adetleri, aktarılan adetler ve son giriş yazılmaz.
export const URETIM_ADEDI_ILETISI = 'Üretim adedi yalnız Üretim Terminali\'nden girilir.';
const ADET_ALANLARI = ['qty', 'imp', 'lastEntry'] as const;

function uretimAdediDenetle(i: YazmaIstegi): string | null {
  const p = parcalar(i.yol);
  if (p[0] !== 'orders') return null;
  if (p.length >= 3) return p[2] === 'giris' ? URETIM_ADEDI_ILETISI : null;
  for (const alan of ADET_ALANLARI) {
    const yeni = i.veri[alan];
    if (yeni === undefined || ayniMi(yeni, i.mevcut?.[alan])) continue;
    if (i.mevcut?.[alan] === undefined && duzNesneMi(yeni) && Object.keys(yeni).length === 0) continue;
    return URETIM_ADEDI_ILETISI;
  }
  return null;
}

// Yazılabilirse null, değilse nedeni.
export function yazmaEngeli(i: YazmaIstegi): string | null {
  return okumaDenetle(i.yol, i.ben) ?? uretimAdediDenetle(i) ?? sahiplikDenetle(i) ?? gonderenDenetle(i) ?? kisiHaritalariDenetle(i);
}

export function silmeEngeli(yol: string, mevcut: Veri | null, ben: string, yonetici: boolean): string | null {
  const okuma = okumaDenetle(yol, ben);
  if (okuma !== null) return okuma;
  const tur = koleksiyonTuru(yol);
  const sahip = sahibi(tur, mevcut);
  if (yonetici || tur === null || sahip === null || sahip === ben || !SILMESI_SAHIPLI.has(tur)) return null;
  return 'Başkasının kaydı yalnız sahibince ya da yöneticice silinir.';
}

// Örnek veri: bir uydurma kanal ve iki ileti; yollar `ORN-` önekli, işaret belgesi kanalın kendisidir.
export const ORNEK_KANAL = 'channels/ORN-uretim';

export interface OrnekYazim { yazar: 'mudur' | 'planlama'; yol: string; kip: 'tam' | 'birlestir'; veri: Veri }

// Prototipin kendi yazım sırası: kanal, iletiler, sonra kanal özeti son iletiyi yazanla.
export function ornekYazimlar(kisi: { mudur: string; planlama: string }, anMs: number): OrnekYazim[] {
  const ilk = anMs - 2 * 3_600_000;
  const ikinci = anMs - 90 * 60_000;
  const metin1 = 'Günaydın. ORNEK Mil emrinin sevki bugün çıkıyor; Flanş OP20 ne durumda?';
  const metin2 = 'Flanş OP20 öğleden sonra bitiyor, ısıl işlem sevkini yarına planladım.';
  return [
    {
      yazar: 'mudur', yol: ORNEK_KANAL, kip: 'tam',
      veri: { name: 'ornek-uretim', emoji: '\u{1F3ED}', topic: 'ORNEK Atölye üretim sohbeti (örnek veri)', createdAt: ilk, createdBy: kisi.mudur, lastAt: ilk, lastBy: kisi.mudur, lastText: metin1 },
    },
    { yazar: 'mudur', yol: `${ORNEK_KANAL}/msgs/ORN-m1`, kip: 'tam', veri: { by: kisi.mudur, ts: ilk, kind: 'msg', text: metin1, rx: {} } },
    { yazar: 'planlama', yol: `${ORNEK_KANAL}/msgs/ORN-m2`, kip: 'tam', veri: { by: kisi.planlama, ts: ikinci, kind: 'msg', text: metin2, rx: {} } },
    { yazar: 'planlama', yol: ORNEK_KANAL, kip: 'birlestir', veri: { lastAt: ikinci, lastBy: kisi.planlama, lastText: metin2 } },
  ];
}
