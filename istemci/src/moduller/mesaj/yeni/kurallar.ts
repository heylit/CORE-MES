import { D, H, M, ayniGun, kisaTarih, kisaZaman, saatDakika } from './bicim.ts';
import type { Duyuru, Gorev, Ileti, Kanal, Onay, Oy, SiparisOzeti, Tekrar, Toplanti, ToplantiYaniti } from './tipler.ts';

// Eski ekranın tarayıcıdaki hesapları (205 a): saf işlevler, davranış birebir. Koruma kuralları sunucudadır; burada yalnız
// gösterim ve hesap vardır.

// Kişi haritalarının anahtarı (eski ekranın `sk`'si): izinli karakter dışındakiler kodlanır.
export const kisiAnahtari = (id: string): string =>
  String(id).replace(/[^A-Za-z0-9_-]/g, (c) => `_x${c.charCodeAt(0).toString(16)}_`);

// Genel emoji tepkisinin anahtarı ve tersi (`ek`, `de`).
export const tepkiAnahtari = (emoji: string): string => `e${Array.from(emoji).map((c) => (c.codePointAt(0) ?? 0).toString(16)).join('_')}`;
export const tepkiEmojisi = (anahtar: string): string => {
  try {
    return String.fromCodePoint(...anahtar.slice(1).split('_').map((h) => parseInt(h, 16)));
  } catch {
    return '❓';
  }
};

export interface TepkiTanimi { k: string; g: string; l: string; ton: 'tamam' | 'bilgi' | 'uyari' | 'pasif' | 'vurgu' | null }
// 4 kurumsal + 2 genel; başka tepki yoktur.
export const TEPKILER: readonly TepkiTanimi[] = [
  { k: 'c_tamam', g: '✅', l: 'Tamam', ton: 'tamam' },
  { k: 'c_bakiyorum', g: '👀', l: 'Bakıyorum', ton: 'bilgi' },
  { k: 'c_uzerindeyim', g: '🛠️', l: 'Üzerindeyim', ton: 'vurgu' },
  { k: 'c_bekliyor', g: '⏳', l: 'Bekliyor', ton: 'uyari' },
  { k: tepkiAnahtari('👍'), g: '👍', l: '', ton: null },
  { k: tepkiAnahtari('🙏'), g: '🙏', l: 'Teşekkürler', ton: 'pasif' },
];
export const EMOJILER: readonly string[] = ['👍', '👏', '🙏', '✅', '👀', '🔥', '🎉', '💪', '👌', '🙌', '😊', '😂', '😅', '🤔', '😮', '😢', '❤️', '⭐', '💯', '⚠️', '❗', '❓', '📦', '🚚', '🏭', '🛠️', '📅', '⏰', '📌', '📝', '💡', '☕', '🎯', '🚀', '👋', '🤝'];
export const KANAL_SIMGELERI: readonly string[] = ['💬', '📣', '🏭', '🤝', '🚚', '🛠️', '📦', '💼', '🧪', '🦺'];

const TR: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
export const asciiKucuk = (s: string): string => String(s).replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c] ?? c).toLowerCase();
export const kucuk = (s: string | null | undefined): string => String(s ?? '').toLocaleLowerCase('tr');
// Türkçe harf duyarsız arama.
export const eslesir = (metin: string, sorgu: string): boolean => kucuk(metin).includes(kucuk(sorgu)) || asciiKucuk(metin).includes(asciiKucuk(sorgu));

// Kanal kimliği ASCII'dir; ad küçük harf, boşluk yerine tire, harf/rakam dışı atılır.
export const kanalKimligiTaslagi = (ad: string): string =>
  asciiKucuk(ad).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'kanal';
export const kanalAdiDuzelt = (ad: string): string =>
  kucuk(String(ad).trim()).replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40);
export function kanalKimligi(ad: string, mevcut: readonly string[]): string {
  const taban = kanalKimligiTaslagi(ad);
  let id = taban;
  for (let k = 2; mevcut.includes(id); k += 1) id = `${taban}-${k}`;
  return id;
}

// ----- onay, duyuru, görev -----
export interface OnayDurumu { s: 'wait' | 'ok' | 'no'; ds: { id: string; v: Oy | null }[] }

// Geçerli turdaki oylar: biri red ise reddedildi, hepsi onaysa onaylandı, yoksa bekliyor.
export function onayDurumu(onay: Onay): OnayDurumu {
  const tur = onay.round ?? 1;
  const oylar = Object.values(onay.votes ?? {}).filter((v) => v && v.r === tur && (v.d === 'ok' || v.d === 'no'));
  const ds = (onay.approvers ?? []).map((id) => ({ id, v: oylar.find((v) => v.u === id) ?? null }));
  let s: OnayDurumu['s'] = 'wait';
  if (ds.some((x) => x.v?.d === 'no')) s = 'no';
  else if (ds.length > 0 && ds.every((x) => x.v?.d === 'ok')) s = 'ok';
  return { s, ds };
}
export const bendenOnayBekliyor = (onay: Onay, ben: string): boolean => {
  const d = onayDurumu(onay);
  return d.s === 'wait' && d.ds.some((x) => x.id === ben && !x.v);
};
export const duyuruBekliyor = (d: Duyuru, ben: string): boolean => d.by !== ben && !Object.values(d.ack ?? {}).includes(ben);

// ----- kanal okunmamış ve bahis -----
// acikKanal: sohbette o an açık olan kanal (açıkken okunmamış sayılmaz).
export const okunmamis = (k: Kanal & { id: string }, okunan: Record<string, number>, ben: string, acikKanal: string | null): boolean =>
  k.id !== acikKanal && (k.lastAt ?? 0) > (okunan[k.id] ?? 0) && k.lastBy !== ben;

export function bahsedildi(k: Kanal & { id: string }, okunan: Record<string, number>, ben: string, acikKanal: string | null): boolean {
  if (k.id === acikKanal) return false;
  const son = okunan[k.id] ?? 0;
  const bahis = k.mentions?.[kisiAnahtari(ben)];
  return (bahis !== undefined && bahis > son) || (k.everyone !== undefined && k.everyone > son && k.everyoneBy !== ben);
}

// ----- tarih -----
export interface TeslimEtiketi { t: string; c: 'late' | 'soon' | ''; diff: number }
export function teslimEtiketi(ts: number | null | undefined, simdi = Date.now()): TeslimEtiketi | null {
  if (!ts) return null;
  const a = new Date(simdi); a.setHours(0, 0, 0, 0);
  const b = new Date(ts); b.setHours(0, 0, 0, 0);
  const diff = Math.round((b.getTime() - a.getTime()) / D);
  if (diff < 0) return { t: `${-diff} gün gecikti`, c: 'late', diff };
  if (diff === 0) return { t: 'Bugün', c: 'soon', diff };
  if (diff === 1) return { t: 'Yarın', c: 'soon', diff };
  if (diff <= 7) return { t: `${diff} gün kaldı`, c: '', diff };
  return { t: kisaTarih(ts), c: '', diff };
}

// ----- toplantı -----
export const toplantiBitisi = (mt: Toplanti): number => mt.start + (mt.dur ?? 30) * M;
export const katilimciMi = (mt: Toplanti, kisi: string): boolean => mt.by === kisi || (mt.attendees ?? []).includes(kisi);
export const benimYanitim = (mt: Toplanti, ben: string): ToplantiYaniti | null =>
  mt.rsvp?.[kisiAnahtari(ben)]?.r ?? (mt.by === ben ? 'yes' : null);
export const saatAraligi = (mt: Toplanti): string => `${saatDakika(mt.start)}–${saatDakika(toplantiBitisi(mt))}`;
export const toplantiZamani = (mt: Toplanti, simdi = Date.now()): string =>
  `${ayniGun(mt.start, simdi) ? 'Bugün' : ayniGun(mt.start, simdi + D) ? 'Yarın' : new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }).format(mt.start)}, ${saatAraligi(mt)}`;
export function baslamaMetni(ts: number, simdi = Date.now()): string {
  const d = ts - simdi;
  if (d <= 0) return simdi < ts + 60 * M ? 'Şimdi' : 'Bitti';
  if (d < H) return `${Math.ceil(d / M)} dk sonra`;
  if (d < D && ayniGun(ts, simdi)) return `${Math.floor(d / H)} sa ${Math.round((d % H) / M)} dk sonra`;
  return `${kisaZaman(ts, simdi)} ${saatDakika(ts)}`;
}
// Davet: başkasının, gelecekteki, iptal edilmemiş ve henüz yanıtlanmamış toplantısı.
export const yanitBekleyenDavet = (mt: Toplanti, ben: string, simdi = Date.now()): boolean =>
  !mt.cancelled && mt.by !== ben && katilimciMi(mt, ben) && !benimYanitim(mt, ben) && mt.start > simdi;

// Zamanlı mesajın sonraki gönderim zamanı (tekrarlıysa, şimdiden sonraki ilk uygun an).
export function sonrakiZaman(ts: number, tekrar: Tekrar | undefined, simdi = Date.now()): number {
  let t = ts;
  const adim = () => {
    t += tekrar === 'weekly' ? 7 * D : D;
    if (tekrar === 'weekdays') while ([0, 6].includes(new Date(t).getDay())) t += D;
  };
  do adim(); while (t <= simdi);
  return t;
}

// ----- sayaçlar -----
export interface SayacGirdisi {
  ben: string;
  acikKanal: string | null;
  okunan: Record<string, number>;
  kanallar: readonly (Kanal & { id: string })[];
  gorevler: readonly Gorev[];
  onaylar: readonly Onay[];
  duyurular: readonly Duyuru[];
  toplantilar: readonly Toplanti[];
  siparisler: readonly SiparisOzeti[];
  simdi?: number;
}
export interface Sayaclar { sohbet: number; isler: number; siparis: number; duyuru: number; toplanti: number; baslik: number }

export function sayaclar(g: SayacGirdisi): Sayaclar {
  const simdi = g.simdi ?? Date.now();
  const bendenOnay = g.onaylar.filter((a) => bendenOnayBekliyor(a, g.ben)).length;
  const sohbet = g.kanallar.filter((k) => okunmamis(k, g.okunan, g.ben, g.acikKanal) || bahsedildi(k, g.okunan, g.ben, g.acikKanal)).length;
  const duyuru = g.duyurular.filter((d) => duyuruBekliyor(d, g.ben)).length;
  return {
    sohbet,
    isler: bendenOnay + g.gorevler.filter((t) => t.to === g.ben && t.status !== 'done').length,
    siparis: g.siparisler.filter((o) => o.durum !== 'sevk' && o.teslim !== null && (teslimEtiketi(o.teslim, simdi)?.c ?? '') !== '').length,
    duyuru,
    toplanti: g.toplantilar.filter((mt) => yanitBekleyenDavet(mt, g.ben, simdi)).length,
    // Pencere başlığı: okunmamış kanal, okunmamış duyuru ve benden onay bekleyen.
    baslik: sohbet + duyuru + bendenOnay,
  };
}

// ----- ileti metni -----
// Metindeki `@Ad` bilinen kişilerde `<@kisi>` koduna çevrilir; uzun ad önce eşleşir.
export function bahisleriKodla(metin: string, bilinen: ReadonlyMap<string, string>): { out: string; ids: string[] } {
  let out = metin;
  const adlar = [...bilinen.keys()].sort((a, b) => b.length - a.length);
  for (const ad of adlar) {
    const kalip = new RegExp(`(^|[\\s(])@${ad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s.,!?;:)'’])`, 'g');
    out = out.replace(kalip, (_t, on: string) => `${on}<@${bilinen.get(ad) ?? ''}>`);
  }
  return { out, ids: [...new Set([...out.matchAll(/<@([^>\s]+)>/g)].map((x) => x[1] ?? ''))] };
}
// Düzenleme için geri çevirir; çözülen adlar sonraki kodlamada aynı kişiye gitsin diye eşleme de döner.
export function bahisleriAc(metin: string | undefined, ad: (id: string) => string): { metin: string; eslesme: Map<string, string> } {
  const eslesme = new Map<string, string>();
  const acik = String(metin ?? '').replace(/<@([^>\s]+)>/g, (_t, id: string) => { const n = ad(id); eslesme.set(n, id); return `@${n}`; });
  return { metin: acik, eslesme };
}
export const duzMetin = (metin: string | undefined, ad: (id: string) => string): string =>
  String(metin ?? '').replace(/<@([^>\s]+)>/g, (_t, id: string) => `@${ad(id)}`);
const HERKES = /(^|\s)@herkes(?=$|[\s.,!?;:])/i;
export const herkesVar = (metin: string | undefined): boolean => HERKES.test(metin ?? '');
export function yalnizEmoji(metin: string | undefined): boolean {
  const x = String(metin ?? '').trim();
  return x.length > 0 && x.length <= 12 && /^(?:\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}\p{Emoji_Modifier}]*\s*){1,3}$/u.test(x);
}
export function onizleme(m: Ileti, ad: (id: string) => string): string {
  const t = duzMetin(m.text, ad).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (m.kind === 'ann') return `📣 ${t}`;
  if (m.kind === 'approval') return '🖋 Onay isteği';
  if (m.kind === 'task') return `📋 Görev${t ? `: ${t}` : ''}`;
  if (m.kind === 'meeting') return '📅 Toplantı daveti';
  if (m.att && !t) return `📎 ${m.att.name || 'Dosya'}`;
  return t.slice(0, 90);
}

// İleti biçimi (eski ekranın `rich`'i): HTML yerine parça listesi; çizimi ekran yapar, metin hiçbir zaman HTML olarak basılmaz.
export type IletiParcasi =
  | { tur: 'metin'; metin: string; kalin: boolean }
  | { tur: 'kod'; metin: string }
  | { tur: 'kisi'; id: string; kalin: boolean }
  | { tur: 'herkes'; kalin: boolean }
  | { tur: 'baglanti'; adres: string; kalin: boolean };
export interface IletiSatiri { madde: boolean; parcalar: IletiParcasi[] }

const BELIRTEC = /<@([A-Za-z0-9_\-:.+~@]+)>|(^|\s)(@herkes)(?=$|[\s.,!?;:])|\bhttps?:\/\/[^\s"'<>]+/gi;

function belirtecler(metin: string, kalin: boolean, cikti: IletiParcasi[]): void {
  const metinEkle = (m: string) => { if (m) cikti.push({ tur: 'metin', metin: m, kalin }); };
  let son = 0;
  for (const e of metin.matchAll(BELIRTEC)) {
    const bas = e.index;
    const tum = e[0];
    if (e[1] !== undefined) {
      metinEkle(metin.slice(son, bas));
      cikti.push({ tur: 'kisi', id: e[1], kalin });
    } else if (e[3] !== undefined) {
      const on = e[2] ?? '';
      metinEkle(metin.slice(son, bas) + on);
      cikti.push({ tur: 'herkes', kalin });
    } else {
      metinEkle(metin.slice(son, bas));
      const kuyruk = /[.,;:!?)\]]+$/.exec(tum)?.[0] ?? '';
      cikti.push({ tur: 'baglanti', adres: tum.slice(0, tum.length - kuyruk.length), kalin });
      metinEkle(kuyruk);
    }
    son = bas + tum.length;
  }
  metinEkle(metin.slice(son));
}

export function iletiParcalari(kaynak: string | undefined): IletiSatiri[] {
  return String(kaynak ?? '').split('\n').map((ham) => {
    const madde = /^(?:-|•) /.test(ham);
    const satir = madde ? ham.slice(2) : ham;
    const parcalar: IletiParcasi[] = [];
    // Kod parçasının içi biçimlenmez.
    satir.split(/(`[^`\n]+`)/).forEach((dilim) => {
      if (/^`[^`\n]+`$/.test(dilim)) { parcalar.push({ tur: 'kod', metin: dilim.slice(1, -1) }); return; }
      dilim.split(/(\*\*[^*\n]+\*\*)/).forEach((p) => {
        const kalin = /^\*\*[^*\n]+\*\*$/.test(p);
        belirtecler(kalin ? p.slice(2, -2) : p, kalin, parcalar);
      });
    });
    return { madde, parcalar };
  });
}
