import type { TaslakAyarlari, TaslakCatismasi, TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { IZ_SINIRI, isTasi, isle, planaAl, simdiSaati, type GeriYama, type KomutKisisi, type KomutSonucu } from './atolye-komutlari-kurallar.ts';

// 3282 1d: kişinin taslağının saf kuralları. Taslak komut listesidir; görünüm ve Uygula komutları güncel ortak çalışmaya sırayla yeniden
// oynatır (Risk K1: bekleyen satırı yalnız geri yama taşır, ileri farkı yoktur). Çatışma, taslak açıldığında alınan imzayla bugünkü
// imzanın farkıdır: başkasının yerini, kilidini ya da yönünü değiştirdiği emir ve tezgâh, plan ayarı değiştiyse bütün plan ('*').

type Nesne = Record<string, unknown>;

// 3282 1d-2: yeniden dizme komutu. Planı sunucu hesaplar ve yazar (Risk 1d-2 K1); onceki, planın hesaplandığı yerdir: dizme imzası
// (dizImzasi), önceki komut sayısı (K4) ve ortak çalışmanın veri sürümü. İmza ya da sıra tutmuyorsa plan bayattır, uygulanmaz. Yalnız veri
// sürümü tutmuyorsa (saha olayı, başlayan iş) plan yazılır ama güncel sayılmaz (K4a). Yalnız son dizme planı taşır.
export interface DizKomutu { tur: 'diz'; isler: string[]; plan: Nesne | null; onceki: { imza: string; n: number; dataVer: number } }
export type SatirKomutu = TaslakKomutu | DizKomutu;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);
const kopya = <T>(x: T): T => structuredClone(x);

// yon: emir başına yön (w.yonEmir); emir düzeyinde çatışır, plan ayarına girmez. Eski imzada yoksa boş sayılır.
// kapasite (3282 2a-1): tezgâh başına elle girilen duruşlar; eksen: planın başlangıç günü (saatler ona göre). mesai ve mesaiKisi (2a-2):
// tezgâh ve operatör başına ek mesai satırları. Hepsi bu alanlardan önce açılmış taslağın tabanında yoktur; yoksa karşılaştırılmaz (Risk 2a
// S4: boş sayılsa her tezgâh sahte çatışırdı).
export interface TaslakImzasi {
  yer: Record<string, string>; kilit: Record<string, string>; ayar: string; yon?: Record<string, string>; kapasite?: Record<string, string>; eksen?: string | null;
  mesai?: Record<string, string>; mesaiKisi?: Record<string, string>;
}
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
  const D = nesne(d.D) ? d.D : {}, meta = nesne(D.meta) ? D.meta : {};
  return { yer, kilit, ayar, yon, kapasite: kapasiteImzasi(d), eksen: typeof meta.baslangic === 'string' ? meta.baslangic : null, ...mesaiImzasi(d) };
}

// Elle girilen duruş: otomatik olmayan (oto taşımayan) down satırı. Otomatik satırlar arızadan ve bakım planından gelir (motor/girdi.js
// otoArizaUygula, otoBakimUygula); imzaya girmez, silinmez (Risk 2a S3, S5).
type Durus = { m: string; from: number; to: number };
const elleDuruslar = (c: unknown): Durus[] => (nesne(c) && Array.isArray(c.down) ? c.down : [])
  .filter((x): x is Nesne => nesne(x) && !x.oto && typeof x.from === 'number' && typeof x.to === 'number')
  .map((x) => ({ m: String(x.m), from: x.from as number, to: x.to as number }));
function kapasiteImzasi(c: unknown): Record<string, string> {
  const t: Record<string, [number, number][]> = {};
  for (const x of elleDuruslar(c)) (t[x.m] ??= []).push([x.from, x.to]);
  return Object.fromEntries(Object.entries(t).map(([m, l]) => [m, JSON.stringify(l.sort((a, b) => a[0] - b[0] || a[1] - b[1]))]));
}
// Ek mesai (3282 2a-2): tezgâh, gün ve vardiya bir satırdır; operatör (personel) boş olabilir.
type EkMesai = { m: string; gun: number; vardiya: string; personel: string | null };
const ekMesailer = (c: unknown): EkMesai[] => (nesne(c) && Array.isArray(c.ekMesai) ? c.ekMesai : [])
  .filter((x): x is Nesne => nesne(x) && typeof x.gun === 'number')
  .map((x) => ({ m: String(x.m), gun: x.gun as number, vardiya: String(x.vardiya), personel: x.personel == null ? null : String(x.personel) }));
function mesaiImzasi(c: unknown): { mesai: Record<string, string>; mesaiKisi: Record<string, string> } {
  const t: Record<string, string[]> = {}, k: Record<string, string[]> = {};
  for (const e of ekMesailer(c)) {
    (t[e.m] ??= []).push(`${String(e.gun)}|${e.vardiya}|${e.personel ?? ''}`);
    if (e.personel !== null) (k[e.personel] ??= []).push(`${String(e.gun)}|${e.vardiya}|${e.m}`);
  }
  const yaz = (x: Record<string, string[]>) => Object.fromEntries(Object.entries(x).map(([a, l]) => [a, JSON.stringify(l.sort())]));
  return { mesai: yaz(t), mesaiKisi: yaz(k) };
}
const DURUS_KOMUTLARI = new Set(['durus', 'durus-sil']);
const MESAI_KOMUTLARI = new Set(['ek-mesai', 'ek-mesai-sil']);
const KAPASITE_KOMUTLARI = new Set([...DURUS_KOMUTLARI, ...MESAI_KOMUTLARI]);

// İşlem kimliği 'emir.adım' (motorun kimliği; paralel pay '~n' eki taşır). Emir kimliği son noktadan öncesidir.
export const emirOf = (isId: string): string => { const i = isId.lastIndexOf('.'); return i > 0 ? isId.slice(0, i) : isId; };
const tezgahOf = (y: string | undefined): string | null => (y === undefined ? null : y.slice(0, y.lastIndexOf('|')));

// Komutun dokunduğu anahtarlar. Taşımada işin eski tezgâhı taban imzasından okunur.
export function komutAnahtarlari(k: SatirKomutu, taban: TaslakImzasi): string[] {
  switch (k.tur) {
    // Dizmenin geçerliliği çatışmayla değil bayatlıkla ölçülür: başkasının değişikliği ya da düşen önceki komut onu bayatlatır.
    case 'diz': return [];
    case 'tasi': {
      const eski = tezgahOf(taban.yer[k.isId]);
      return [`emir:${emirOf(k.isId)}`, `tezgah:${k.tezgah}`, ...(eski !== null && eski !== k.tezgah ? [`tezgah:${eski}`] : [])];
    }
    case 'plana-al': return [`emir:${k.emirId}`, `tezgah:${k.tezgah}`, ...(k.adimlar ?? []).map((a) => `tezgah:${a.tezgah}`)];
    case 'yon': return [`emir:${k.emirId}`];
    case 'yeniden-planla': return k.isler.includes('*') ? ['*'] : [...new Set(k.isler)].map((id) => `emir:${id}`);
    case 'ayar': return ['*'];
    case 'durus': case 'durus-sil': case 'ek-mesai-sil': return [`tezgah:${k.tezgah}`];
    // Risk 2a S10: operatörün başka bir ek mesaisi de çatışır (aynı kişi aynı pencerede iki tezgâhta olamaz).
    case 'ek-mesai': return [`tezgah:${k.tezgah}`, ...(k.personel === null ? [] : [`kisi:${k.personel}`])];
  }
}

// Başkasının taslak açıldığından beri değiştirdikleri: yeri ya da kilidi değişen işlerin emirleri ve eski ile yeni tezgâhları, yönü değişen
// emirler; plan ayarı
// değiştiyse '*'. Kendi taslağı ortak çalışmaya yazılmadığı için bu fark yalnız başkasınındır.
export function digerDegisiklikleri(taban: TaslakImzasi, simdi: TaslakImzasi): {
  emir: Set<string>; tezgah: Set<string>; kisi: Set<string>; hepsi: boolean; bos: boolean; kapasiteBilinmez: boolean; mesaiBilinmez: boolean;
} {
  const emir = new Set<string>(), tezgah = new Set<string>(), kisi = new Set<string>();
  for (const [a, b] of [[taban.yer, simdi.yer], [taban.kilit, simdi.kilit]] as const) {
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[id] === b[id]) continue;
      emir.add(emirOf(id));
      for (const t of [tezgahOf(a[id]), tezgahOf(b[id])]) if (t !== null) tezgah.add(t);
    }
  }
  const ty = taban.yon ?? {}, sy = simdi.yon ?? {};
  for (const id of new Set([...Object.keys(ty), ...Object.keys(sy)])) if (ty[id] !== sy[id]) emir.add(id);
  // Başkasının değiştirdiği kapasite o tezgâhı, eksenin kayması bütün planı etkiler (saatler başka güne düşer; Risk 2a S2).
  const tk = taban.kapasite, sk = simdi.kapasite ?? {};
  if (tk !== undefined) for (const m of new Set([...Object.keys(tk), ...Object.keys(sk)])) if (tk[m] !== sk[m]) tezgah.add(m);
  const fark = (a: Record<string, string> | undefined, b: Record<string, string> | undefined, hedef: Set<string>): void => {
    if (a === undefined) return;
    const bb = b ?? {};
    for (const x of new Set([...Object.keys(a), ...Object.keys(bb)])) if (a[x] !== bb[x]) hedef.add(x);
  };
  fark(taban.mesai, simdi.mesai, tezgah);
  fark(taban.mesaiKisi, simdi.mesaiKisi, kisi);
  const hepsi = taban.ayar !== simdi.ayar || (taban.eksen !== undefined && taban.eksen !== (simdi.eksen ?? null));
  return {
    emir, tezgah, kisi, hepsi, bos: !hepsi && emir.size === 0 && tezgah.size === 0 && kisi.size === 0,
    kapasiteBilinmez: tk === undefined, mesaiBilinmez: taban.mesai === undefined,
  };
}

const anahtarAdi = (a: string): string => (a === '*' ? 'Plan ayarı ya da bütün plan' : a.startsWith('emir:') ? `${a.slice(5)} emri`
  : a.startsWith('kisi:') ? `${a.slice(5)} numaralı operatör` : `${a.slice(7)} tezgâhı`);

type Diger = ReturnType<typeof digerDegisiklikleri>;
// Komutun çatıştığı anahtarlar: '*' komutu başkasının herhangi bir değişikliğiyle, başkasının ayar değişikliği her komutla, öteki komut
// aynı emir ya da tezgâhla çatışır (Risk açık b: emir düzeyi yetmez, kaynak da).
function catisanAnahtarlar(d: Diger, komut: SatirKomutu, taban: TaslakImzasi): string[] {
  const ak = komutAnahtarlari(komut, taban);
  // Tabanında kapasite olmayan taslakta başkasının o tezgâhın kapasitesine dokunup dokunmadığı bilinmez: kapasite komutu hep sorulur.
  if ((d.kapasiteBilinmez && DURUS_KOMUTLARI.has(komut.tur)) || (d.mesaiBilinmez && MESAI_KOMUTLARI.has(komut.tur))) return d.hepsi ? ['*'] : ak;
  if (d.bos) return [];
  if (ak.length === 0) return [];
  if (d.hepsi || ak.includes('*')) return ['*'];
  return ak.filter((a) => (a.startsWith('emir:') && d.emir.has(a.slice(5))) || (a.startsWith('tezgah:') && d.tezgah.has(a.slice(7)))
    || (a.startsWith('kisi:') && d.kisi.has(a.slice(5))));
}

// Çatışmalar anahtar başına, komut adları kişinin okuyacağı satırlardır.
export function catismalar(taban: TaslakImzasi, simdi: TaslakImzasi, komutlar: readonly { komut: SatirKomutu; ne: string }[]): TaslakCatismasi[] {
  const d = digerDegisiklikleri(taban, simdi);
  const m = new Map<string, string[]>();
  for (const { komut, ne } of komutlar) {
    for (const a of catisanAnahtarlar(d, komut, taban)) { const l = m.get(a) ?? []; if (!l.includes(ne)) l.push(ne); m.set(a, l); }
  }
  return [...m].map(([anahtar, l]) => ({ anahtar, ad: anahtarAdi(anahtar), komutlar: l }));
}

// Seçime göre kalan komutlar: çatıştığı anahtarlardan biri 'onun' seçilen komut düşer. Seçilmemiş çatışma varsa null (seçim istenir).
export function secimeGore<T extends { komut: SatirKomutu }>(taban: TaslakImzasi, simdi: TaslakImzasi, l: readonly T[], secim: Readonly<Record<string, 'benim' | 'onun'>>): T[] | null {
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

// Yeniden planlama isteği (3335-2): veri değişmez; istek bekleyen değişiklik olarak yazılır, dizme o emirlerin işlerini yeniden dizer
// ('*': bütün plan). Planda yeri olmayan emirlere her dizmede yer bulunur. Emirler çalışmada olmalı; plan kurulmuş olmalı.
const yenidenPlanlaAdi = (isler: readonly string[]): string => (isler.includes('*') ? 'Bütün plan baştan kurulacak' : isler.length === 1 ? `${isler[0]!} yeniden planlanacak` : `${String(isler.length)} emir yeniden planlanacak`);
export function yenidenPlanlaUygula(deger: unknown, isler: readonly string[], k: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  if (!nesne(deger.plan)) return { hata: { tur: 'cakisma', ileti: 'Henüz plan yok; önce planı kurun.' } };
  const hepsi = isler.includes('*');
  const D = nesne(deger.D) ? deger.D : {};
  const var_ = new Set(Array.isArray(D.siparisler) ? D.siparisler.flatMap((s) => (nesne(s) ? [String(s.id)] : [])) : []);
  const tekil = hepsi ? ['*'] : [...new Set(isler)];
  if (!hepsi && tekil.some((id) => !var_.has(id))) return { hata: { tur: 'dogrulama', ileti: 'Emir çalışmada yok.', alan: 'isler' } };
  return { deger: isle(deger, kopya(deger), { ne: 'Yeniden planlama istendi', ayrinti: yenidenPlanlaAdi(tekil), isler: tekil, geri: [] }, k), degisti: true };
}

// Duruş (3282 2a-1): elle girilen arıza ya da bakım. Aynı tezgâh ve aralık ikinci kez eklenmez; tezgâh çalışmada olmalı; aralık ufukta ve
// şimdiden sonra bitmeli (Risk 2a S1, S6). Silme tek satırı siler; eşleşen elle satır yoksa komut uygulanamaz.
const ufukSaati = (c: Nesne): number => {
  const u = nesne(c.w) ? Math.round(Number(c.w.ufukGun)) : NaN;
  return (u >= 28 && u <= 182 ? u : 120) * 24;
};
const saatYazisi = (h: number): string => `${String(Math.floor(h / 24) + 1)}. gün ${String(Math.floor(h % 24)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const durusAyrintisi = (m: string, bas: number, bit: number): string => `${m} · ${saatYazisi(bas)} → ${saatYazisi(bit)}`;
export function durusUygula(deger: unknown, k: { tezgah: string; bas: number; bit: number; neden: 'arıza' | 'bakım' }, kisi: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  const D = nesne(deger.D) ? deger.D : {};
  if (!(Array.isArray(D.tezgahlar) && D.tezgahlar.some((t) => nesne(t) && String(t.id) === k.tezgah))) return { hata: { tur: 'dogrulama', ileti: 'Tezgâh çalışmada yok.', alan: 'tezgah' } };
  if (!(k.bas < k.bit)) return { hata: { tur: 'dogrulama', ileti: 'Bitiş başlangıçtan sonra olmalı.', alan: 'bit' } };
  if (k.bit > ufukSaati(deger)) return { hata: { tur: 'dogrulama', ileti: 'Duruş planın ufkunun dışında bitiyor.', alan: 'bit' } };
  const simdi = simdiSaati(deger, kisi.t);
  if (simdi === null) return { hata: { tur: 'cakisma', ileti: 'Çalışmada başlangıç günü yok; sayfada planı kurup kaydedin.' } };
  if (k.bit <= simdi) return { hata: { tur: 'dogrulama', ileti: 'Duruş geçmişte bitiyor; planı etkilemez.', alan: 'bit' } };
  if (elleDuruslar(deger).some((x) => x.m === k.tezgah && x.from === k.bas && x.to === k.bit)) return { hata: { tur: 'dogrulama', ileti: 'Bu duruş zaten var.', alan: 'bas' } };
  const eski = Array.isArray(deger.down) ? deger.down : [];
  const yeni = kopya(deger);
  yeni.down = [...kopya(eski), { m: k.tezgah, from: k.bas, to: k.bit, neden: k.neden }].sort((a, b) => Number((a as Nesne).from) - Number((b as Nesne).from));
  const ne = k.neden === 'bakım' ? 'Bakım eklendi' : 'Arıza eklendi';
  return { deger: isle(deger, yeni, { ne, ayrinti: durusAyrintisi(k.tezgah, k.bas, k.bit), isler: ['*'], geri: [{ yol: ['down'], once: eski }] }, kisi), degisti: true };
}
export function durusSilUygula(deger: unknown, k: { tezgah: string; bas: number; bit: number }, kisi: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  const eski = Array.isArray(deger.down) ? deger.down : [];
  const ayni = (x: unknown): boolean => nesne(x) && String(x.m) === k.tezgah && x.from === k.bas && x.to === k.bit;
  const i = eski.findIndex((x) => ayni(x) && !(x as Nesne).oto);
  if (i < 0) {
    const ileti = eski.some(ayni) ? 'Otomatik duruş (arıza ya da bakım planından) burada silinmez.' : 'Duruş artık yok.';
    return { hata: { tur: 'cakisma', ileti } };
  }
  const yeni = kopya(deger);
  yeni.down = kopya(eski).filter((_, j) => j !== i);
  return { deger: isle(deger, yeni, { ne: 'Duruş silindi', ayrinti: durusAyrintisi(k.tezgah, k.bas, k.bit), isler: ['*'], geri: [{ yol: ['down'], once: eski }] }, kisi), degisti: true };
}

// Ek mesai (3282 2a-2, 3282-7 b): tezgâha gün ve vardiya açılır, operatör seçilir. Denetim ortak çalışmanın verisiyle, uygulama anında
// (oynatmada da) yeniden yapılır (Risk 2a S2): tezgâh ve vardiya çalışmada, gün geçmişte değil, aynı satır yok, haftalık bütçe aşılmıyor (S6).
// Operatör (S9): çalışmanın personelinde, tezgâhı çalıştırabilir (makineleri ya da grubu), o gün devamsız değil, ek vardiya kendi vardiyasıyla
// kesişmiyor, aynı gün ve vardiyada başka ek mesaide değil. Motor da aynı kuralla operatörü kapasiteye katar (motor/engine.js compile).
const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'] as const;
const saatOf = (x: unknown): number => { const [h, m] = String(x).split(':').map(Number); return (h ?? 0) + (m ?? 0) / 60; };
const gunMsOf = (b: string): number => { const [y, a, g] = b.split('-').map(Number); return Date.UTC(y ?? 0, (a ?? 1) - 1, g ?? 1); };
function takvim(D: Nesne) {
  const b = nesne(D.meta) && typeof D.meta.baslangic === 'string' ? D.meta.baslangic : '1970-01-01';
  const taban = gunMsOf(b);
  // motor parseT: sayı saattir, tarih (YYYY-MM-DD) başlangıçtan saat.
  const saatiOf = (x: unknown): number | null => typeof x === 'number' ? x : typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) ? (gunMsOf(x.slice(0, 10)) - taban) / 3_600_000 : null;
  const gunOf = (x: unknown): number | null => { const h = saatiOf(x); return h === null ? null : Math.floor(h / 24); };
  const tatil = new Set((Array.isArray(D.tatiller) ? D.tatiller : []).map(gunOf));
  const cg = nesne(D.calismaGunleri) ? D.calismaGunleri : {};
  const vardiyalari = (d: number): string[] => {
    if (tatil.has(d)) return [];
    const wd = GUNLER[(new Date(taban + d * 86_400_000).getUTCDay() + 6) % 7]!;
    return Array.isArray(cg[wd]) ? (cg[wd] as unknown[]).map(String) : [];
  };
  const vardiya = (id: string): Nesne | null => (Array.isArray(D.vardiyalar) ? D.vardiyalar : []).find((v): v is Nesne => nesne(v) && String(v.id) === id) ?? null;
  const pencere = (d: number, id: string): [number, number] | null => {
    const v = vardiya(id);
    if (v === null) return null;
    const a = d * 24 + saatOf(v.bas);
    let z = d * 24 + saatOf(v.bit);
    if (z <= a) z += 24;
    return [a, z];
  };
  // motor vardiyaNetSaat: molalar düşülür.
  const netSaat = (id: string): number => {
    const v = vardiya(id);
    if (v === null) return 0;
    const a = saatOf(v.bas);
    let z = saatOf(v.bit);
    if (z <= a) z += 24;
    let h = z - a;
    for (const m of Array.isArray(v.molalar) ? v.molalar : []) {
      if (!nesne(m)) continue;
      let x = saatOf(m.bas), y = saatOf(m.bit);
      if (x < a) x += 24;
      if (y <= x) y += 24;
      h -= Math.max(0, Math.min(y, z) - Math.max(x, a));
    }
    return Math.max(0, h);
  };
  // motor haftaNo: hafta pazartesi başlar.
  const haftaNo = (gun: number): number => Math.floor((gun + (new Date(taban).getUTCDay() + 6) % 7) / 7);
  const devamsiz = new Set((Array.isArray(D.devamsizlik) ? D.devamsizlik : []).flatMap((x) => (nesne(x) ? [`${String(x.personel)}@${String(gunOf(x.gun))}`] : [])));
  return { vardiyalari, pencere, netSaat, haftaNo, devamsiz };
}
// Operatörün o ek mesaide çalışamama nedeni; çalışabiliyorsa null. İstemci Kokpit aynı kuralı seçenek listesinde uygular (kokpit/kurallar.ts).
export function operatorSorunu(deger: unknown, e: { tezgah: string; gun: number; vardiya: string; personel: string }): string | null {
  const D = nesne(deger) && nesne(deger.D) ? deger.D : {};
  const p = (Array.isArray(D.personel) ? D.personel : []).find((x): x is Nesne => nesne(x) && String(x.id) === e.personel);
  if (!p) return 'Operatör çalışmanın personelinde yok.';
  const t = (Array.isArray(D.tezgahlar) ? D.tezgahlar : []).find((x): x is Nesne => nesne(x) && String(x.id) === e.tezgah);
  const makineler = Array.isArray(p.makineler) ? p.makineler.map(String) : [], gruplar = Array.isArray(p.gruplar) ? p.gruplar.map(String) : [];
  if (!makineler.includes(e.tezgah) && !(t && t.grup !== undefined && gruplar.includes(String(t.grup)))) return 'Operatör bu tezgâhı çalıştırmıyor.';
  const k = takvim(D);
  if (k.devamsiz.has(`${e.personel}@${String(e.gun)}`)) return 'Operatör o gün devamsız.';
  const w = k.pencere(e.gun, e.vardiya);
  const kendi = p.vardiya == null ? '' : String(p.vardiya);
  if (w !== null && kendi !== '') {
    for (const d of [e.gun - 1, e.gun]) {
      if (!k.vardiyalari(d).includes(kendi) || k.devamsiz.has(`${e.personel}@${String(d)}`)) continue;
      const o = k.pencere(d, kendi);
      if (o !== null && o[0] < w[1] && w[0] < o[1]) return 'Ek vardiya operatörün kendi vardiyasıyla çakışıyor.';
    }
  }
  if (ekMesailer(deger).some((x) => x.personel === e.personel && x.gun === e.gun && x.vardiya === e.vardiya)) return 'Operatör o gün ve vardiyada başka bir ek mesaide.';
  return null;
}
const MOTOR_MESAI_HAFTA = 8;
const ekMesaiAyrintisi = (m: string, gun: number, vardiya: string, personel: string | null): string =>
  `${m} · ${String(gun + 1)}. gün · ${vardiya}${personel === null ? '' : ` · operatör ${personel}`}`;
export function ekMesaiUygula(deger: unknown, k: { tezgah: string; gun: number; vardiya: string; personel: string | null }, kisi: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  const D = nesne(deger.D) ? deger.D : {};
  const varMi = (l: unknown, id: string) => Array.isArray(l) && l.some((x) => nesne(x) && String(x.id) === id);
  if (!varMi(D.tezgahlar, k.tezgah)) return { hata: { tur: 'dogrulama', ileti: 'Tezgâh çalışmada yok.', alan: 'tezgah' } };
  if (!varMi(D.vardiyalar, k.vardiya)) return { hata: { tur: 'dogrulama', ileti: 'Vardiya çalışmada yok.', alan: 'vardiya' } };
  const simdi = simdiSaati(deger, kisi.t);
  if (simdi === null) return { hata: { tur: 'cakisma', ileti: 'Çalışmada başlangıç günü yok; sayfada planı kurup kaydedin.' } };
  if (k.gun < Math.floor(simdi / 24)) return { hata: { tur: 'dogrulama', ileti: 'Geçmiş güne ek mesai eklenemez.', alan: 'gun' } };
  if (k.gun * 24 >= ufukSaati(deger)) return { hata: { tur: 'dogrulama', ileti: 'Gün planın ufkunun dışında.', alan: 'gun' } };
  const l = ekMesailer(deger);
  if (l.some((x) => x.m === k.tezgah && x.gun === k.gun && x.vardiya === k.vardiya)) return { hata: { tur: 'dogrulama', ileti: 'Bu tezgâhta o gün ve vardiyada ek mesai zaten var.', alan: 'vardiya' } };
  const t = takvim(D);
  const param = nesne(deger.param) ? deger.param : {};
  // motorla aynı okuma (girdi.js stKur): girilmemişse 8 saat, 0 sınırsız.
  const sinir = param.mesaiHafta === undefined || param.mesaiHafta === null ? MOTOR_MESAI_HAFTA : Number(param.mesaiHafta);
  if (Number.isFinite(sinir) && sinir > 0) {
    const h = t.haftaNo(k.gun);
    const kullanilan = l.filter((x) => t.haftaNo(x.gun) === h).reduce((a, x) => a + t.netSaat(x.vardiya), 0);
    if (kullanilan + t.netSaat(k.vardiya) > sinir + 1e-9) {
      return { hata: { tur: 'dogrulama', ileti: `Haftalık ek mesai bütçesi doldu (${String(Math.round(kullanilan * 10) / 10)} / ${String(sinir)} saat).`, alan: 'gun' } };
    }
  }
  if (k.personel !== null) {
    const sorun = operatorSorunu(deger, { tezgah: k.tezgah, gun: k.gun, vardiya: k.vardiya, personel: k.personel });
    if (sorun !== null) return { hata: { tur: 'dogrulama', ileti: sorun, alan: 'personel' } };
  }
  const eski = Array.isArray(deger.ekMesai) ? deger.ekMesai : [];
  const yeni = kopya(deger);
  yeni.ekMesai = [...kopya(eski), { m: k.tezgah, gun: k.gun, vardiya: k.vardiya, ...(k.personel === null ? {} : { personel: k.personel }) }];
  return { deger: isle(deger, yeni, { ne: 'Ek mesai eklendi', ayrinti: ekMesaiAyrintisi(k.tezgah, k.gun, k.vardiya, k.personel), isler: ['*'], geri: [{ yol: ['ekMesai'], once: eski }] }, kisi), degisti: true };
}
export function ekMesaiSilUygula(deger: unknown, k: { tezgah: string; gun: number; vardiya: string }, kisi: KomutKisisi): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  const eski = Array.isArray(deger.ekMesai) ? deger.ekMesai : [];
  const i = eski.findIndex((x) => nesne(x) && String(x.m) === k.tezgah && x.gun === k.gun && String(x.vardiya) === k.vardiya);
  if (i < 0) return { hata: { tur: 'cakisma', ileti: 'Ek mesai artık yok.' } };
  const yeni = kopya(deger);
  yeni.ekMesai = kopya(eski).filter((_, j) => j !== i);
  return { deger: isle(deger, yeni, { ne: 'Ek mesai silindi', ayrinti: ekMesaiAyrintisi(k.tezgah, k.gun, k.vardiya, null), isler: ['*'], geri: [{ yol: ['ekMesai'], once: eski }] }, kisi), degisti: true };
}

// Komutun kişinin okuyacağı adı (taslak listesi ve çatışma satırı).
export function komutAdi(k: SatirKomutu): string {
  switch (k.tur) {
    case 'diz': return 'Plan yeniden dizildi';
    case 'tasi': return `${k.isId} → ${k.tezgah}`;
    case 'plana-al': return `${k.emirId} plana alındı (${k.tezgah})`;
    case 'yon': return `${k.emirId} yönü: ${k.yon === 'plan' ? 'planınki' : k.yon === 'geri' ? 'teslimden geriye' : 'ileriye'}`;
    case 'yeniden-planla': return yenidenPlanlaAdi([...new Set(k.isler)]);
    case 'ayar': return k.ayrinti === '' ? 'Plan ayarı' : `Plan ayarı: ${k.ayrinti}`;
    case 'durus': return `${k.tezgah} ${k.neden === 'bakım' ? 'bakım' : 'arıza'}: ${saatYazisi(k.bas)} → ${saatYazisi(k.bit)}`;
    case 'durus-sil': return `${k.tezgah} duruşu silindi: ${saatYazisi(k.bas)} → ${saatYazisi(k.bit)}`;
    case 'ek-mesai': return `${k.tezgah} ek mesai: ${String(k.gun + 1)}. gün ${k.vardiya}${k.personel === null ? '' : `, operatör ${k.personel}`}`;
    case 'ek-mesai-sil': return `${k.tezgah} ek mesaisi silindi: ${String(k.gun + 1)}. gün ${k.vardiya}`;
  }
}

// Taşıma ve plana alma hesapları motorun takvimiyle dışarıda yapılır (tasima.ts, plana-al.ts); kural saf kalsın diye verilir.
export interface TaslakHesaplari { tasima: Parameters<typeof isTasi>[3]; planaAlma: Parameters<typeof planaAl>[3] }
// eksen: kapasite komutunun girildiği andaki planın başlangıç günü; saatleri ona göredir (Risk 2a-1 K1).
export interface TaslakSatiri { komut: SatirKomutu; ne: string; t: number; eksen?: string | null }
export const kapasiteKomutuMu = (k: SatirKomutu): boolean => KAPASITE_KOMUTLARI.has(k.tur);
export const eksenOf = (c: unknown): string | null => imza(c).eksen ?? null;
export const EKSEN_DEGISTI = 'Planın başlangıç günü değişti; saat ve günler başka güne düşer. Değişikliği geri alıp yeniden girin.';

export function komutUygula(deger: unknown, k: TaslakKomutu, kisi: KomutKisisi, h: TaslakHesaplari): KomutSonucu {
  switch (k.tur) {
    case 'tasi': { const { tur: _, ...g } = k; return isTasi(deger, g, kisi, h.tasima); }
    case 'plana-al': { const { tur: _, ...g } = k; return planaAl(deger, g, kisi, h.planaAlma); }
    case 'ayar': return ayarUygula(deger, k.ayar, k.ayrinti, kisi);
    case 'yon': return yonUygula(deger, k.emirId, k.yon, kisi);
    case 'yeniden-planla': return yenidenPlanlaUygula(deger, k.isler, kisi);
    case 'durus': return durusUygula(deger, k, kisi);
    case 'durus-sil': return durusSilUygula(deger, k, kisi);
    case 'ek-mesai': return ekMesaiUygula(deger, k, kisi);
    case 'ek-mesai-sil': return ekMesaiSilUygula(deger, k, kisi);
  }
}

export const DIZ_BAYAT = 'Plan bu arada değişti; taslağı yeniden dizin.';
export const DIZ_ESKI_VERI = 'dizmeden sonra veri değişti, plan güncel sayılmadı';
// Komutlar sırayla oynatılır; uygulanamayan komut atlanır, nedeni satırın sırasında döner (görünüm onu "artık uygulanamıyor" diye gösterir).
// Dizme yalnız hesaplandığı yerde (aynı imza, aynı sıra) uygulanır.
// Kapasite komutu girildiği eksenden başka bir eksene oynatılmaz: göreli saat başka güne düşerdi (Risk 2a-1 K1). Ekseni yazılmamış satır
// denetlenmez.
export function oynat(c: unknown, l: readonly { komut: SatirKomutu; eksen?: string | null }[], kisi: KomutKisisi, h: TaslakHesaplari): { deger: unknown; hatalar: (string | null)[] } {
  let deger = c;
  const tabanDataVer = dataVerOf(c);
  const eksen = eksenOf(c);
  const hatalar = l.map((s, i) => {
    const k = s.komut;
    const r = kapasiteKomutuMu(k) && s.eksen !== undefined && s.eksen !== eksen ? { hata: { tur: 'cakisma' as const, ileti: EKSEN_DEGISTI } }
      : k.tur !== 'diz' ? komutUygula(deger, k, kisi, h)
      // Planı düşmüş (sonraki dizmenin örttüğü) dizme hiçbir şey yazmaz; bayatlığı da sorulmaz.
      : k.plan === null ? { deger, degisti: false }
      : k.onceki.n !== i || k.onceki.imza !== dizImzasi(deger, c) ? { hata: { tur: 'cakisma' as const, ileti: DIZ_BAYAT } }
        : dizUygula(deger, k, kisi, tabanDataVer);
    if ('hata' in r) return r.hata.ileti;
    deger = r.deger;
    return null;
  });
  return { deger, hatalar };
}

// Dizme imzası: işlerin yeri ortak çalışmadan (başkasının yeniden dizmesi), kilit, yön, plan ayarı ve elle girilen kapasite görünümden
// (kişinin ve başkasının kararları; Risk 2a S5). Yer görünümden alınmaz: kişinin önceki dizmesinin planı düştüğünde (yalnız son dizme plan taşır) sonraki bayatlamasın.
export const dizImzasi = (gorunum: unknown, taban: unknown): string => {
  const g = imza(gorunum);
  return JSON.stringify([imza(taban).yer, g.kilit, g.ayar, g.yon ?? {}, g.kapasite ?? {}, g.mesai ?? {}]);
};
export const dataVerOf = (c: unknown): number => (nesne(c) && typeof c.dataVer === 'number' ? c.dataVer : 0);

// Dizilen planı görünüme işler (istemci motor/coz.ts uygulananiAl ve kayit.ts degistir planKoru'nun sunucudaki karşılığı): plan yerine
// yazılır, kapsadığı bekleyen satırları düşer, veri sürümü artar; kalan bekleyen yoksa plan güncel sayılır. Bekleyen satırı yazılmaz, iz yazılır.
// tabanDataVer: ortak çalışmanın şimdiki veri sürümü; dizme başka bir sürümde hesaplandıysa plan güncel sayılmaz.
export function dizUygula(deger: unknown, k: DizKomutu, kisi: KomutKisisi, tabanDataVer: number): KomutSonucu {
  if (!nesne(deger)) return { hata: { tur: 'cakisma', ileti: 'Çalışma kaydı okunamadı; sayfayı yenileyin.' } };
  if (k.plan === null) return { deger, degisti: false };
  const eski = nesne(deger.plan) ? deger.plan : null;
  if (eski === null) return { hata: { tur: 'cakisma', ileti: 'Önce plan kurulmalı.' } };
  const hepsi = k.isler.includes('*');
  const kalan = (Array.isArray(deger.bekleyen) ? deger.bekleyen : []).filter((b) => !(hepsi || (nesne(b) && Array.isArray(b.isler) && b.isler.every((x) => k.isler.includes(String(x))))));
  const onceki = typeof deger.dataVer === 'number' ? deger.dataVer : 0;
  const dataVer = onceki + 1;
  // Dizmeden sonra giren veri (imzaya girmeyen saha yazmaları) planda yoktur: plan güncel işaretlenmez, sayfa yeniden dizmeyi önerir.
  const eskiVeri = tabanDataVer !== k.onceki.dataVer;
  const yeni = kopya(deger);
  yeni.plan = { ...kopya(k.plan), dataVer: kalan.length === 0 && !eskiVeri ? dataVer : eski.dataVer, kim: kisi.kim, zaman: kisi.t, kaynak: 'uygula', oncekiOzet: eski.ozet ?? null,
    kapali: Array.isArray(deger.kapali) ? [...deger.kapali] : [] };
  yeni.bekleyen = kalan;
  yeni.dataVer = dataVer;
  const ayrinti = `${hepsi ? 'Bütün işler' : k.isler.join(', ')}${eskiVeri ? `; ${DIZ_ESKI_VERI}` : ''}`;
  yeni.iz = [{ t: kisi.t, kim: kisi.kim, rol: '', sayfa: kisi.sayfa, ne: 'Plan yeniden dizildi', ayrinti }, ...(Array.isArray(deger.iz) ? deger.iz : [])].slice(0, IZ_SINIRI);
  return { deger: yeni, degisti: true };
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
