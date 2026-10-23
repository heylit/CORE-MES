import { bahisleriKodla, herkesVar, kisiAnahtari, onizleme } from './kurallar.ts';
import type { MesajYazici } from './veri.ts';
import type { Ileti, Kanal } from './tipler.ts';

// İleti gönderme tek yerdedir (eski ekranın `send` ve `postAnnouncement`'ı): sohbet, zamanlayıcı ve otomatik uyarılar aynı
// yoldan yazar. Gönderen sunucuda da denetlenir (oturumdaki kişi; `__bot` yalnız `kind: auto`).

export interface GonderGirdisi {
  kanal: string;
  metin: string;
  // Ek alanlar; `by` göndereni değiştirir (zamanlı mesajda zamanlayan, otomatik uyarıda `__bot`).
  ek?: Partial<Ileti>;
  bahisler?: readonly string[];
  // Yazma alanında seçilen adlar (ad -> kişi); kişi listesindeki adlara eklenir.
  bilinen?: ReadonlyMap<string, string>;
}

export interface GonderBaglami {
  ben: string;
  yaz: MesajYazici;
  kisiler: ReadonlyMap<string, string>;
  ad: (id: string) => string;
  simdi?: () => number;
}

const bilinenAdlar = (kisiler: ReadonlyMap<string, string>, ek?: ReadonlyMap<string, string>): Map<string, string> => {
  const sonuc = new Map<string, string>(ek ?? []);
  for (const [id, ad] of kisiler) if (ad && !sonuc.has(ad)) sonuc.set(ad, id);
  return sonuc;
};

export async function iletiGonder(b: GonderBaglami, g: GonderGirdisi): Promise<string> {
  const { out, ids } = bahisleriKodla(g.metin || '', bilinenAdlar(b.kisiler, g.bilinen));
  const bahis = [...new Set([...ids, ...(g.bahisler ?? [])])];
  const herkes = herkesVar(g.metin);
  const ileti: Ileti = { by: b.ben, ts: (b.simdi ?? Date.now)(), kind: 'msg', text: out, rx: {}, ...g.ek };
  if (bahis.length > 0) ileti.mentions = bahis;
  if (herkes) ileti.everyone = true;
  const id = await b.yaz.ekle(`channels/${g.kanal}/msgs`, ileti);
  const yama: Partial<Kanal> = { lastAt: ileti.ts, lastBy: ileti.by, lastText: onizleme(ileti, b.ad) };
  const digerleri = bahis.filter((x) => x !== ileti.by);
  if (digerleri.length > 0) yama.mentions = Object.fromEntries(digerleri.map((x) => [kisiAnahtari(x), ileti.ts]));
  if (herkes) { yama.everyone = ileti.ts; yama.everyoneBy = ileti.by; }
  // Kanal özeti yazılamazsa ileti yine gitmiştir; hata gösterilir ama gönderim geri alınmaz (eski ekranla aynı).
  void b.yaz.guncelle(`channels/${g.kanal}`, yama).catch(() => undefined);
  return id;
}

export async function duyuruGonder(b: GonderBaglami, g: Omit<GonderGirdisi, 'bahisler'>): Promise<{ duyuru: string; ileti: string }> {
  const { out } = bahisleriKodla(g.metin, bilinenAdlar(b.kisiler, g.bilinen));
  const ts = (b.simdi ?? Date.now)();
  const by = g.ek?.by ?? b.ben;
  const duyuru = await b.yaz.ekle('duyurular', { by, ts, text: out, cid: g.kanal, mid: null, ack: {} });
  const ileti = await iletiGonder(b, { ...g, ek: { ...g.ek, kind: 'ann', ref: duyuru } });
  void b.yaz.guncelle(`duyurular/${duyuru}`, { mid: ileti }).catch(() => undefined);
  void b.yaz.guncelle(`channels/${g.kanal}`, { everyone: ts, everyoneBy: by }).catch(() => undefined);
  return { duyuru, ileti };
}
