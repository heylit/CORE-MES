import { eslesir, kisiAnahtari, TEPKILER, tepkiEmojisi } from '../kurallar.ts';
import type { Duyuru, Es, Gorev, Ileti, Kanal, Kayit, Okuma, Onay, Tekrar } from '../tipler.ts';

// Sohbetin saf hesapları; davranış eski çerçevenin betiğiyle birebir (adı geçen işlev parantezde).

const DK = 6e4;
const SN = 1e3;

// Aynı kişinin 5 dakika içindeki iletisi öncekine eklenir; duyuru ve otomatik uyarı ayrı durur (renderMsgs).
export function birlesir(onceki: Ileti | null, ileti: Ileti): boolean {
  if (!onceki) return false;
  const ayri = (m: Ileti) => m.kind === 'ann' || m.kind === 'auto';
  return onceki.by === ileti.by && ileti.ts - onceki.ts < 5 * DK && !onceki.deleted && !ayri(ileti) && !ayri(onceki);
}

export const ayniGun = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export type AkisOgesi =
  | { tur: 'gun'; ts: number }
  | { tur: 'yeni' }
  | { tur: 'ileti'; ileti: Kayit<Ileti>; devam: boolean };

// Gün ayracı, "Yeni mesajlar" çizgisi (kanal açıldığındaki okunma zamanından sonraki ilk başkasının iletisi) ve birleşme.
export function akisOgeleri(iletiler: readonly Kayit<Ileti>[], isaret: number, ben: string): AkisOgesi[] {
  const ogeler: AkisOgesi[] = [];
  let onceki: Ileti | null = null;
  let sonGun = '';
  let cizildi = false;
  for (const m of iletiler) {
    const gun = new Date(m.ts).toDateString();
    if (gun !== sonGun) { ogeler.push({ tur: 'gun', ts: m.ts }); sonGun = gun; onceki = null; }
    if (!cizildi && isaret > 0 && m.ts > isaret && m.by !== ben) { ogeler.push({ tur: 'yeni' }); cizildi = true; onceki = null; }
    ogeler.push({ tur: 'ileti', ileti: m, devam: birlesir(onceki, m) });
    onceki = m;
  }
  return ogeler;
}

// Kanalı açık tutarken okundu sayılan son an: son ileti, kanal özeti, kişiye bahis ve @herkes (markRead).
export function sonOkunacak(kanal: Kanal, iletiler: readonly Ileti[], ben: string): number {
  const son = iletiler.length > 0 ? iletiler[iletiler.length - 1]!.ts : 0;
  return Math.max(son, kanal.lastAt ?? 0, kanal.mentions?.[kisiAnahtari(ben)] ?? 0, kanal.everyone ?? 0);
}

// İletiyi okuyanlar: gönderen ve ben hariç, okuma kaydındaki kanal zamanı ileti zamanına ulaşmış kişiler (readersOf).
export function okuyanlar(ileti: Ileti, kanal: string, okuma: Readonly<Record<string, Okuma>>, ben: string): string[] {
  const k = kisiAnahtari(kanal);
  return Object.entries(okuma)
    .filter(([kisi, o]) => kisi !== ben && kisi !== ileti.by && (o.c?.[k] ?? 0) >= ileti.ts)
    .map(([kisi]) => kisi);
}

// Ekranın tanıdığı kişiler: çevrimiçiler, iletilerin yazarları, görev, onay ve duyuru tarafları (knownPeople).
export function bilinenKisiler(girdi: {
  cevrimici: readonly string[];
  iletiler: readonly Ileti[];
  gorevler: readonly Gorev[];
  onaylar: readonly Onay[];
  duyurular: readonly Duyuru[];
}): string[] {
  const s = new Set<string>(girdi.cevrimici);
  for (const m of girdi.iletiler) if (m.by) s.add(m.by);
  for (const t of girdi.gorevler) { if (t.to) s.add(t.to); if (t.by) s.add(t.by); }
  for (const a of girdi.onaylar) { s.add(a.by); for (const x of a.approvers ?? []) s.add(x); }
  for (const a of girdi.duyurular) { s.add(a.by); for (const x of Object.values(a.ack ?? {})) if (x) s.add(x); }
  return [...s].filter((x) => x && !x.startsWith('__'));
}

export const duyuruOkuyanlari = (d: Duyuru) => Object.values(d.ack ?? {}).filter(Boolean);

export interface TepkiOzeti {
  anahtar: string;
  emoji: string;
  etiket: string;
  kurumsal: boolean;
  kisiler: string[];
  benim: boolean;
}

// Tepki düğmeleri: bilinmeyen kurumsal anahtar çizilmez, genel emoji anahtarından çözülür (rxHTML).
export function tepkiOzetleri(ileti: Ileti, ben: string): TepkiOzeti[] {
  const ozet: TepkiOzeti[] = [];
  for (const [anahtar, harita] of Object.entries(ileti.rx ?? {})) {
    const kisiler = Object.values(harita ?? {}).filter(Boolean);
    if (kisiler.length === 0) continue;
    const t = TEPKILER.find((x) => x.k === anahtar);
    const emoji = t ? t.g : anahtar.startsWith('e') ? tepkiEmojisi(anahtar) : null;
    if (!emoji) continue;
    ozet.push({ anahtar, emoji, etiket: t?.l ?? '', kurumsal: anahtar.startsWith('c_'), kisiler, benim: kisiler.includes(ben) });
  }
  return ozet;
}

// Tepki açıp kapama yaması: kendi anahtarım boşaltılır ya da kimliğimle dolar (toggleReact).
export function tepkiYamasi(ileti: Ileti, anahtar: string, ben: string) {
  const k = kisiAnahtari(ben);
  const acik = Boolean(ileti.rx?.[anahtar]?.[k]);
  return { rx: { [anahtar]: { [k]: acik ? '' : ben } } };
}

export type IletiIslemi = 'yanitla' | 'goreve' | 'onaya' | 'kopyala' | 'bilgi' | 'duzenle' | 'sil';

// İleti menüsünün maddeleri, sırasıyla (msgMenu). Düzenleme ve silme yalnız kendi iletinde.
export function iletiIslemleri(ileti: Ileti, ben: string, yazabilir: boolean): IletiIslemi[] {
  const benim = ileti.by === ben;
  const liste: (IletiIslemi | false)[] = [
    yazabilir && 'yanitla',
    yazabilir && ileti.kind === 'msg' && 'goreve',
    yazabilir && ileti.kind === 'msg' && 'onaya',
    Boolean(ileti.text) && 'kopyala',
    benim && 'bilgi',
    benim && yazabilir && (ileti.kind === 'msg' || ileti.kind === 'ann') && 'duzenle',
    benim && yazabilir && 'sil',
  ];
  return liste.filter((x): x is IletiIslemi => x !== false);
}

// Yanıt alıntısı: metni olmayan kart iletisi türüyle anılır (replyTo).
export function yanitBilgisi(ileti: Kayit<Ileti>) {
  const metin = ileti.text || (ileti.kind === 'approval' ? 'Onay isteği' : ileti.kind === 'task' ? 'Görev' : 'Ek');
  return { id: ileti.id, by: ileti.by, text: metin.slice(0, 200) };
}

// Kanal listesindeki önizleme: son yazanın kısa adı önde (chPreview).
export function kanalOnizlemesi(kanal: Kanal, ben: string, ad: (id: string) => string): string {
  if (!kanal.lastText) return kanal.topic ?? '';
  const kim = !kanal.lastBy ? '' : kanal.lastBy === ben ? 'Sen: ' : kanal.lastBy === '__bot' ? 'Uyarı: ' : `${ilkAd(ad(kanal.lastBy))}: `;
  return kim + kanal.lastText;
}

export const ilkAd = (ad: string) => ad.split(' ')[0] ?? ad;

export const kanalSirasi = <T extends Kanal>(kanallar: readonly T[]) => kanallar.slice().sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0));

// Yazıyor göstergesi: oda durumunda bu kanalı yazan, son 10 saniyede güncellenmiş başkaları (computeTyping).
export function yazanlar(
  esler: readonly Es[],
  kanal: string,
  ben: string,
  simdi: number,
): string[] {
  return [...new Set(esler
    .filter((e) => e.kisi !== ben && e.durum['typing'] === kanal && simdi - e.guncellendi < 10 * SN)
    .map((e) => e.kisi))];
}

export function yaziyorMetni(kisiler: readonly string[], ad: (id: string) => string): string {
  if (kisiler.length === 0) return '';
  return kisiler.length === 1 ? `${ilkAd(ad(kisiler[0]!))} yazıyor…` : `${kisiler.length} kişi yazıyor…`;
}

// "@ad" tamamlaması: imlecin solundaki son @ sözcüğü (acUpdate).
export function bahisSorgusu(metin: string, imlec: number): { sorgu: string; bas: number } | null {
  const m = /(^|\s)@([^\s@]{0,24})$/.exec(metin.slice(0, imlec));
  if (!m) return null;
  const sorgu = m[2] ?? '';
  return { sorgu, bas: imlec - sorgu.length - 1 };
}

export function bahisAdaylari(
  kisiler: readonly { id: string; ad: string }[],
  sorgu: string,
  ben: string,
  herkes: boolean,
): { id: string; ad: string }[] {
  const liste = kisiler.filter((k) => k.ad && k.id !== ben && eslesir(k.ad, sorgu)).slice(0, 8);
  return herkes && 'herkes'.startsWith(sorgu.toLocaleLowerCase('tr')) ? [...liste, { id: '__all', ad: 'herkes' }] : liste;
}

// Zamanlama kısayolları: 1 saat sonra, yarın 08:00, gelecek pazartesi 08:30, cuma 16:00 (whenChips).
export function zamanKisayollari(simdi: number): { ts: number; etiket: string }[] {
  const d = new Date(simdi);
  const yarin = new Date(d); yarin.setDate(d.getDate() + 1); yarin.setHours(8, 0, 0, 0);
  const pzt = new Date(d); pzt.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); pzt.setHours(8, 30, 0, 0);
  const cuma = new Date(d); cuma.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); cuma.setHours(16, 0, 0, 0);
  return [
    { ts: simdi + 60 * DK, etiket: '1 saat sonra' },
    { ts: yarin.getTime(), etiket: 'Yarın 08:00' },
    { ts: pzt.getTime(), etiket: 'Pazartesi 08:30' },
    { ts: cuma.getTime(), etiket: 'Cuma 16:00' },
  ];
}

export const TEKRARLAR: Readonly<Record<Tekrar, string>> = { none: 'Tekrar yok', daily: 'Her gün', weekdays: 'Hafta içi her gün', weekly: 'Her hafta' };

// Zamanlama denetimi: geçersiz tarih; tekrarsız ve 5 dakikadan eski zaman reddedilir.
export function zamanlamaHatasi(zaman: string, tekrar: Tekrar, simdi: number): string | null {
  const ts = new Date(zaman).getTime();
  if (!zaman || Number.isNaN(ts)) return 'Geçerli bir tarih seç.';
  if (ts < simdi - 5 * DK && tekrar === 'none') return 'Geçmiş bir zaman seçtin.';
  return null;
}

// Otomatik uyarı iletisinin etiketi; kural türünün adı (RULES[..].t).
export const KURAL_ADLARI: Readonly<Record<string, string>> = {
  order_risk: 'Teslim riskteyse uyar',
  order_ready: 'Sipariş hazır olunca haber ver',
  order_new: 'Yeni sipariş açılınca bildir',
  prod_word: 'Üretim notunda uyarı kelimesi',
  task_late: 'Görev gecikince sorumluyu uyar',
  appr_wait: 'Onay bekletilirse hatırlat',
  ann_unread: 'Duyuru okunmazsa hatırlat',
};
