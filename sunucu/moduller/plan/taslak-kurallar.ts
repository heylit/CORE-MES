import type { TaslakAyarlari, TaslakCatismasi, TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { isTasi, isle, planaAl, type GeriYama, type KomutKisisi, type KomutSonucu } from './atolye-komutlari-kurallar.ts';

// 3282 1d: kişinin taslağının saf kuralları. Taslak komut listesidir; görünüm ve Uygula komutları güncel ortak çalışmaya sırayla yeniden
// oynatır (Risk K1: bekleyen satırı yalnız geri yama taşır, ileri farkı yoktur). Çatışma, taslak açıldığında alınan imzayla bugünkü
// imzanın farkıdır: başkasının yerini, kilidini ya da yönünü değiştirdiği emir ve tezgâh, plan ayarı değiştiyse bütün plan ('*').

type Nesne = Record<string, unknown>;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const kopya = <T>(x: T): T => structuredClone(x);

// yon: emir başına yön (w.yonEmir); emir düzeyinde çatışır, plan ayarına girmez. Eski imzada yoksa boş sayılır.
export interface TaslakImzasi { yer: Record<string, string>; kilit: Record<string, string>; ayar: string; yon?: Record<string, string> }
// İmzaya giren plan ayarı alanları: Kokpit'in yazdığı çalışma ayarları ve kapalı kısıtlar (taslakAyarlari ile aynı küme).
const W_ALANLARI = ['dondurma', 'mat', 'yon'] as const;
const PARAM_ALANLARI = ['tampon', 'tamponZ', 'mesaiHafta', 'maxChg', 'geriTamponGun'] as const;

const yerYazisi = (x: unknown): string | null => (nesne(x) && x.m !== undefined && typeof x.S === 'number' ? `${String(x.m)}|${String(x.S)}` : null);

export function imza(c: unknown): TaslakImzasi {
  const d = nesne(c) ? c : {};
  const plan = nesne(d.plan) ? d.plan : {};
  const ops = nesne(plan.ops) ? plan.ops : {};
  const locks = nesne(d.locks) ? d.locks : {};
  const w = nesne(d.w) ? d.w : {}, param = nesne(d.param) ? d.param : {};
  const yer: Record<string, string> = {}, kilit: Record<string, string> = {};
  for (const [id, x] of Object.entries(ops)) { const y = yerYazisi(x); if (y !== null) yer[id] = y; }
  for (const [id, x] of Object.entries(locks)) { const y = yerYazisi(x); if (y !== null) kilit[id] = y; }
  const ayar = JSON.stringify([W_ALANLARI.map((k) => w[k] ?? null), PARAM_ALANLARI.map((k) => param[k] ?? null), Array.isArray(d.kapali) ? [...d.kapali].map(String).sort() : []]);
  const yon = Object.fromEntries(Object.entries(nesne(w.yonEmir) ? w.yonEmir : {}).filter(([, v]) => v === 'ileri' || v === 'geri').map(([id, v]) => [id, String(v)]));
  return { yer, kilit, ayar, yon };
}

// İşlem kimliği 'emir.adım' (motorun kimliği; paralel pay '~n' eki taşır). Emir kimliği son noktadan öncesidir.
export const emirOf = (isId: string): string => { const i = isId.lastIndexOf('.'); return i > 0 ? isId.slice(0, i) : isId; };
const tezgahOf = (y: string | undefined): string | null => (y === undefined ? null : y.slice(0, y.lastIndexOf('|')));

// Komutun dokunduğu anahtarlar. Taşımada işin eski tezgâhı taban imzasından okunur.
export function komutAnahtarlari(k: TaslakKomutu, taban: TaslakImzasi): string[] {
  switch (k.tur) {
    case 'tasi': {
      const eski = tezgahOf(taban.yer[k.isId]);
      return [`emir:${emirOf(k.isId)}`, `tezgah:${k.tezgah}`, ...(eski !== null && eski !== k.tezgah ? [`tezgah:${eski}`] : [])];
    }
    case 'plana-al': return [`emir:${k.emirId}`, `tezgah:${k.tezgah}`, ...(k.adimlar ?? []).map((a) => `tezgah:${a.tezgah}`)];
    case 'yon': return [`emir:${k.emirId}`];
    case 'ayar': return ['*'];
  }
}

// Başkasının taslak açıldığından beri değiştirdikleri: yeri ya da kilidi değişen işlerin emirleri ve eski ile yeni tezgâhları, yönü değişen
// emirler; plan ayarı
// değiştiyse '*'. Kendi taslağı ortak çalışmaya yazılmadığı için bu fark yalnız başkasınındır.
export function digerDegisiklikleri(taban: TaslakImzasi, simdi: TaslakImzasi): { emir: Set<string>; tezgah: Set<string>; hepsi: boolean; bos: boolean } {
  const emir = new Set<string>(), tezgah = new Set<string>();
  for (const [a, b] of [[taban.yer, simdi.yer], [taban.kilit, simdi.kilit]] as const) {
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[id] === b[id]) continue;
      emir.add(emirOf(id));
      for (const t of [tezgahOf(a[id]), tezgahOf(b[id])]) if (t !== null) tezgah.add(t);
    }
  }
  const ty = taban.yon ?? {}, sy = simdi.yon ?? {};
  for (const id of new Set([...Object.keys(ty), ...Object.keys(sy)])) if (ty[id] !== sy[id]) emir.add(id);
  const hepsi = taban.ayar !== simdi.ayar;
  return { emir, tezgah, hepsi, bos: !hepsi && emir.size === 0 && tezgah.size === 0 };
}

const anahtarAdi = (a: string): string => (a === '*' ? 'Plan ayarı ya da bütün plan' : a.startsWith('emir:') ? `${a.slice(5)} emri` : `${a.slice(7)} tezgâhı`);

type Diger = ReturnType<typeof digerDegisiklikleri>;
// Komutun çatıştığı anahtarlar: '*' komutu başkasının herhangi bir değişikliğiyle, başkasının ayar değişikliği her komutla, öteki komut
// aynı emir ya da tezgâhla çatışır (Risk açık b: emir düzeyi yetmez, kaynak da).
function catisanAnahtarlar(d: Diger, komut: TaslakKomutu, taban: TaslakImzasi): string[] {
  if (d.bos) return [];
  const ak = komutAnahtarlari(komut, taban);
  if (d.hepsi || ak.includes('*')) return ['*'];
  return ak.filter((a) => (a.startsWith('emir:') && d.emir.has(a.slice(5))) || (a.startsWith('tezgah:') && d.tezgah.has(a.slice(7))));
}

// Çatışmalar anahtar başına, komut adları kişinin okuyacağı satırlardır.
export function catismalar(taban: TaslakImzasi, simdi: TaslakImzasi, komutlar: readonly { komut: TaslakKomutu; ne: string }[]): TaslakCatismasi[] {
  const d = digerDegisiklikleri(taban, simdi);
  const m = new Map<string, string[]>();
  for (const { komut, ne } of komutlar) {
    for (const a of catisanAnahtarlar(d, komut, taban)) { const l = m.get(a) ?? []; if (!l.includes(ne)) l.push(ne); m.set(a, l); }
  }
  return [...m].map(([anahtar, l]) => ({ anahtar, ad: anahtarAdi(anahtar), komutlar: l }));
}

// Seçime göre kalan komutlar: çatıştığı anahtarlardan biri 'onun' seçilen komut düşer. Seçilmemiş çatışma varsa null (seçim istenir).
export function secimeGore<T extends { komut: TaslakKomutu }>(taban: TaslakImzasi, simdi: TaslakImzasi, l: readonly T[], secim: Readonly<Record<string, 'benim' | 'onun'>>): T[] | null {
  const d = digerDegisiklikleri(taban, simdi);
  const anahtarlar = l.map(({ komut }) => catisanAnahtarlar(d, komut, taban));
  if (anahtarlar.some((ak) => ak.some((a) => secim[a] === undefined))) return null;
  return l.filter((_, i) => !anahtarlar[i]!.some((a) => secim[a] === 'onun'));
}

// Ayar komutu: çalışmanın w ve param alanları ile kapalı kısıtlar. Değişmeyen alan yazılmaz; hiçbiri değişmezse degisti false.
export function ayarUygula(deger: unknown, a: TaslakAyarlari, ayrinti: string, k: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  const yeni = kopya(deger);
  const w: Nesne = nesne(yeni.w) ? yeni.w : (yeni.w = {}) as Nesne;
  const param: Nesne = nesne(yeni.param) ? yeni.param : (yeni.param = {}) as Nesne;
  const geri: GeriYama[] = [];
  for (const [yer, hedef, alanlar] of [['w', w, a.w], ['param', param, a.param]] as const) {
    for (const [id, v] of Object.entries(alanlar)) {
      if (v === undefined || hedef[id] === v) continue;
      geri.push(hedef[id] === undefined ? { yol: [yer], id } : { yol: [yer], id, once: hedef[id] });
      hedef[id] = v;
    }
  }
  const kapali = Array.isArray(deger.kapali) ? deger.kapali.map(String) : [];
  const yeniKapali = [...kapali.filter((x) => !a.ac.includes(x)), ...a.kapat.filter((x) => !kapali.includes(x))];
  if (yeniKapali.length !== kapali.length || yeniKapali.some((x, i) => x !== kapali[i])) { geri.push({ yol: ['kapali'], once: kapali }); yeni.kapali = yeniKapali; }
  if (geri.length === 0) return { deger, degisti: false };
  return { deger: isle(deger, yeni, { ne: 'Plan ayarı değişti', ayrinti, isler: ['*'], geri }, k), degisti: true };
}

// Emrin yönü (3282 1c): w.yonEmir; 'plan' emrin satırını siler. Emir çalışmada olmalı.
export function yonUygula(deger: unknown, emirId: string, yon: 'plan' | 'ileri' | 'geri', k: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  const D = nesne(deger.D) ? deger.D : {};
  if (!(Array.isArray(D.siparisler) && D.siparisler.some((s) => nesne(s) && String(s.id) === emirId))) {
    return { hata: { tur: 'dogrulama', ileti: 'Emir çalışmada yok.', alan: 'emirId' } };
  }
  const w = nesne(deger.w) ? deger.w : {};
  const eski = nesne(w.yonEmir) ? w.yonEmir : {};
  const simdi = eski[emirId] === 'geri' || eski[emirId] === 'ileri' ? eski[emirId] : 'plan';
  if (simdi === yon) return { deger, degisti: false };
  const { [emirId]: _, ...kalan } = eski;
  const yeni = kopya(deger);
  (yeni.w as Nesne | undefined) ??= {};
  (yeni.w as Nesne).yonEmir = yon === 'plan' ? kalan : { ...kalan, [emirId]: yon };
  const geri: GeriYama[] = [w.yonEmir === undefined ? { yol: ['w'], id: 'yonEmir' } : { yol: ['w'], id: 'yonEmir', once: w.yonEmir }];
  const ad = (y: string) => (y === 'plan' ? 'planınki' : y === 'geri' ? 'teslimden geriye' : 'ileriye');
  return { deger: isle(deger, yeni, { ne: 'Emrin yönü değişti', ayrinti: `${emirId}: ${ad(simdi)} → ${ad(yon)}`, isler: [emirId], geri }, k), degisti: true };
}

// Komutun kişinin okuyacağı adı (taslak listesi ve çatışma satırı).
export function komutAdi(k: TaslakKomutu): string {
  switch (k.tur) {
    case 'tasi': return `${k.isId} → ${k.tezgah}`;
    case 'plana-al': return `${k.emirId} plana alındı (${k.tezgah})`;
    case 'yon': return `${k.emirId} yönü: ${k.yon === 'plan' ? 'planınki' : k.yon === 'geri' ? 'teslimden geriye' : 'ileriye'}`;
    case 'ayar': return k.ayrinti === '' ? 'Plan ayarı' : `Plan ayarı: ${k.ayrinti}`;
  }
}

// Taşıma ve plana alma hesapları motorun takvimiyle dışarıda yapılır (tasima.ts, plana-al.ts); kural saf kalsın diye verilir.
export interface TaslakHesaplari { tasima: Parameters<typeof isTasi>[3]; planaAlma: Parameters<typeof planaAl>[3] }
export interface TaslakSatiri { komut: TaslakKomutu; ne: string; t: number }

export function komutUygula(deger: unknown, k: TaslakKomutu, kisi: KomutKisisi, h: TaslakHesaplari): KomutSonucu {
  switch (k.tur) {
    case 'tasi': { const { tur: _, ...g } = k; return isTasi(deger, g, kisi, h.tasima); }
    case 'plana-al': { const { tur: _, ...g } = k; return planaAl(deger, g, kisi, h.planaAlma); }
    case 'ayar': return ayarUygula(deger, k.ayar, k.ayrinti, kisi);
    case 'yon': return yonUygula(deger, k.emirId, k.yon, kisi);
  }
}

// Komutlar sırayla oynatılır; uygulanamayan komut atlanır, nedeni satırın sırasında döner (görünüm onu "artık uygulanamıyor" diye gösterir).
export function oynat(c: unknown, l: readonly { komut: TaslakKomutu }[], kisi: KomutKisisi, h: TaslakHesaplari): { deger: unknown; hatalar: (string | null)[] } {
  let deger = c;
  const hatalar = l.map((s) => {
    const r = komutUygula(deger, s.komut, kisi, h);
    if ('hata' in r) return r.hata.ileti;
    deger = r.deger;
    return null;
  });
  return { deger, hatalar };
}

// Uygula'nın kararı (Risk K2): seçim eksikse çatışmalar; seçimden kalan komutlardan biri uygulanamıyorsa hiçbiri yazılmaz (bozuk);
// yoksa yazılacak değer. Değer girdinin kendisiyse yazılacak bir şey yoktur.
export type UygulaKarari =
  | { durum: 'secim'; catismalar: TaslakCatismasi[] }
  | { durum: 'bozuk'; ileti: string }
  | { durum: 'yaz'; deger: unknown; uygulanan: number; dusen: number };
export function uygulaKarari(c: unknown, taban: TaslakImzasi, l: readonly TaslakSatiri[], secim: Readonly<Record<string, 'benim' | 'onun'>>, kisi: KomutKisisi, h: TaslakHesaplari): UygulaKarari {
  const simdi = imza(c);
  const kalan = secimeGore(taban, simdi, l, secim);
  if (kalan === null) return { durum: 'secim', catismalar: catismalar(taban, simdi, l) };
  const o = oynat(c, kalan, kisi, h);
  const bozuk = kalan.flatMap((s, i) => (o.hatalar[i] == null ? [] : [`${s.ne}: ${o.hatalar[i]!}`]));
  if (bozuk.length > 0) return { durum: 'bozuk', ileti: `Taslaktaki şu değişiklikler artık uygulanamıyor: ${bozuk.join('; ')}` };
  return { durum: 'yaz', deger: o.deger, uygulanan: kalan.length, dusen: l.length - kalan.length };
}
