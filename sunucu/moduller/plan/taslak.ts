import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, cokBuyuk, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  TASLAK_KOMUTU_EN_COK, taslakKomutu, type DegerlendirmeIstegi, type TaslakCevabi, type TaslakKomutu, type TaslakSatirKomutu, type TaslakUygulaCevabi,
} from '#paylasilan/sozlesme/planlama.ts';
import { degerCokBuyukMu } from '../recete-rota/disari.ts';
import { DEGERLENDIRME_SURESI_MS, degerlendirmeBaslat, degerlendirmeYap } from './degerlendirme.ts';
import { planaAlmaHesabi } from './plana-al.ts';
import { PLANLAMA_ANAHTARI, planlamaCalismasi, planlamaYaz, planlamaYazmaDenetimi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';
import {
  adimEkBitisi, dataVerOf, dizImzasi, eksenOf, imza, kapasiteKomutuMu, kilitKaydi, komutAdi, komutUygula, oynat, uygulaKarari, type DizKomutu, type KilitKaydi, type SatirKomutu, type TaslakHesaplari, type TaslakImzasi, type TaslakSatiri as Satir,
} from './taslak-kurallar.ts';
import { tasimaHesabi } from './tasima.ts';

// 3282 1d: kişinin taslağı. Akış: yetki (plan.yaz, uçta ve burada; satır yalnız çağıranın kimliğiyle okunur ve yazılır), taslak sürümü,
// komutlar güncel ortak çalışmaya sırayla oynatılır (taslak-kurallar.ts; taşıma ve plana alma hesapları burada verilir).
// Uygula ortak çalışmayı kilitler, kararı taslak-kurallar.ts uygulaKarari verir, yazılacak değer kaydın yazma yolundan yazılır.
const SAYFA = 'Kokpit';
const ESKI = 'Taslağınız başka bir sekmede değişti; sayfayı yenileyin.';
const BUYUK = 'Taslak çok büyüdü; bir kısmını uygulayıp yeniden deneyin.';

const HESAPLAR: TaslakHesaplari = { tasima: tasimaHesabi, planaAlma: planaAlmaHesabi };
const kisiOf = (kullanici: Kullanici, simdi: number) => ({ kim: kullanici.ad, sayfa: SAYFA, t: simdi });

// Satırları bu modül yazar; okurken yine de sözleşmeden geçer (dizme satırı kendi biçimiyle), bozuk satır oynatılmaz.
const nesneMi = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
function dizKomutu(x: Record<string, unknown>): DizKomutu | null {
  const { isler, plan, onceki, kilit } = x;
  if (!Array.isArray(isler) || !isler.every((i) => typeof i === 'string') || !(plan === null || nesneMi(plan)) || !nesneMi(onceki)) return null;
  const { imza: i, n, dataVer } = onceki;
  if (typeof i !== 'string' || typeof n !== 'number' || typeof dataVer !== 'number') return null;
  const k: KilitKaydi = {};
  if (nesneMi(kilit)) for (const [id, y] of Object.entries(kilit)) if (nesneMi(y) && typeof y.S === 'number' && typeof y.o === 'number') k[id] = { m: y.m, S: y.S, o: y.o };
  return { tur: 'diz', isler: isler as string[], plan, onceki: { imza: i, n, dataVer }, ...(Object.keys(k).length > 0 ? { kilit: k } : {}) };
}
function satirlar(x: unknown): Satir[] {
  if (!Array.isArray(x)) return [];
  const l: Satir[] = [];
  for (const s of x as unknown[]) {
    if (!nesneMi(s)) continue;
    const k = s.komut;
    const komut: SatirKomutu | null = nesneMi(k) && k.tur === 'diz' ? dizKomutu(k) : ((r) => (r.success ? r.data : null))(taslakKomutu.safeParse(k));
    if (komut === null || typeof s.ne !== 'string' || typeof s.t !== 'number') continue;
    l.push({ komut, ne: s.ne, t: s.t, ...(typeof s.eksen === 'string' || s.eksen === null ? { eksen: s.eksen } : {}), ...(typeof s.bitis0 === 'number' ? { bitis0: s.bitis0 } : {}) });
  }
  return l;
}
// Cevapta dizmenin planı ve tabanı gösterilmez.
const disKomut = (k: SatirKomutu): TaslakSatirKomutu => (k.tur === 'diz' ? { tur: 'diz', isler: k.isler } : k);

async function gorunum(db: Db, kullanici: Kullanici, t: sorgular.TaslakSatiri | null, simdi: number): Promise<TaslakCevabi> {
  const c = await planlamaCalismasi(db, kullanici, simdi);
  if (t === null || c.calisma === null) return { taslak: null, calisma: c.calisma, surum: c.surum };
  const l = satirlar(t.komutlar);
  const o = oynat(c.calisma, l, kisiOf(kullanici, simdi), HESAPLAR);
  return {
    taslak: { surum: t.surum, tabanSurum: t.tabanSurum, satirlar: l.map(({ eksen: _, bitis0: _b, ...s }, i) => ({ ...s, komut: disKomut(s.komut), hata: o.hatalar[i] ?? null })) },
    calisma: o.deger as Record<string, unknown>, surum: c.surum,
  };
}

export async function taslagim(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<TaslakCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  return gorunum(db, kullanici, await sorgular.taslakOku(db, kullanici.id), simdi);
}

const surumDenetle = (t: sorgular.TaslakSatiri | null, beklenen: number | null): void => {
  if ((t?.surum ?? null) !== beklenen) throw cakisma(ESKI);
};

// Komut güncel ortak çalışmaya, taslağın önceki komutlarından sonra uygulanabiliyorsa eklenir; uygulanamıyorsa yazılmaz, nedeni döner.
export async function taslakKomutuEkle(db: Db, kullanici: Kullanici, g: { taslakSurumu: number | null; komut: TaslakKomutu }, simdi: number = Date.now()): Promise<TaslakCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const t = await sorgular.taslakOku(db, kullanici.id, true);
  surumDenetle(t, g.taslakSurumu);
  const c = await planlamaCalismasi(db, kullanici, simdi);
  if (c.calisma === null || c.surum === null) throw cakisma('Planlama çalışması yok; önce planı kurun.');
  const eski = t === null ? [] : satirlar(t.komutlar);
  if (eski.length >= TASLAK_KOMUTU_EN_COK) throw dogrulama(`Taslakta en çok ${String(TASLAK_KOMUTU_EN_COK)} değişiklik durur; önce uygulayın.`, 'komut');
  const o = oynat(c.calisma, eski, kisiOf(kullanici, simdi), HESAPLAR);
  const r = komutUygula(o.deger, g.komut, kisiOf(kullanici, simdi), HESAPLAR);
  if ('hata' in r) throw r.hata.tur === 'dogrulama' ? dogrulama(r.hata.ileti, r.hata.alan) : cakisma(r.hata.ileti);
  if (!r.degisti) return gorunum(db, kullanici, t, simdi);
  // Adım uzadı: bildirildiği andaki planlı bitiş satırda saklanır; taslak sonradan oynatılırken o günkü bitişten yeniden hesaplanmaz.
  const bitis0 = g.komut.tur === 'adim-uzadi' ? adimEkBitisi(r.deger, g.komut.isId) : undefined;
  const komutlar = [...eski, { komut: g.komut, ne: komutAdi(g.komut), t: simdi, ...(kapasiteKomutuMu(g.komut) ? { eksen: eksenOf(c.calisma) } : {}), ...(bitis0 === undefined ? {} : { bitis0 }) }];
  if (degerCokBuyukMu(komutlar)) throw cokBuyuk(BUYUK);
  if (t === null) {
    const tabanImzasi: TaslakImzasi = imza(c.calisma);
    if ((await sorgular.taslakEkle(db, { kisiId: kullanici.id, tabanSurum: c.surum, tabanImzasi, komutlar })) === null) throw cakisma(ESKI);
  } else if ((await sorgular.taslakKomutlariYaz(db, { kisiId: kullanici.id, beklenenSurum: t.surum, komutlar })) === null) throw cakisma(ESKI);
  return gorunum(db, kullanici, await sorgular.taslakOku(db, kullanici.id), simdi);
}

// Son komut taslaktan çıkar; taslak boşalırsa silinir.
export async function taslakGeriAl(db: Db, kullanici: Kullanici, g: { taslakSurumu: number }, simdi: number = Date.now()): Promise<TaslakCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const t = await sorgular.taslakOku(db, kullanici.id, true);
  surumDenetle(t, g.taslakSurumu);
  const l = satirlar(t!.komutlar).slice(0, -1);
  if (l.length === 0) await sorgular.taslakSil(db, kullanici.id, t!.surum);
  else if ((await sorgular.taslakKomutlariYaz(db, { kisiId: kullanici.id, beklenenSurum: t!.surum, komutlar: l })) === null) throw cakisma(ESKI);
  return gorunum(db, kullanici, await sorgular.taslakOku(db, kullanici.id), simdi);
}

export async function taslaktanVazgec(db: Db, kullanici: Kullanici, g: { taslakSurumu: number }, simdi: number = Date.now()): Promise<TaslakCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  if (!(await sorgular.taslakSil(db, kullanici.id, g.taslakSurumu))) throw cakisma(ESKI);
  return gorunum(db, kullanici, null, simdi);
}

// Uygula (Risk K2): ortak çalışma bugünkü yazma işlemiyle (plan.yaz) ve kilitle yazılır. Çatışmanın seçimi eksikse yazılmaz, çatışmalar
// döner. Seçimden kalan komutlardan biri artık uygulanamıyorsa hiçbiri yazılmaz; kişi o komutu geri alır ya da taslaktan vazgeçer.
export async function taslagiUygula(db: Db, kullanici: Kullanici, g: { taslakSurumu: number; secimler?: Record<string, 'benim' | 'onun'> | undefined }, simdi: number = Date.now()): Promise<TaslakUygulaCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  const t = await sorgular.taslakOku(db, kullanici.id, true);
  surumDenetle(t, g.taslakSurumu);
  const surum = await sorgular.planlamaSurumKilitle(db, PLANLAMA_ANAHTARI);
  const c = await planlamaCalismasi(db, kullanici, simdi);
  if (surum === null || c.calisma === null || c.surum !== surum) throw eskiSurum();
  const k = uygulaKarari(c.calisma, t!.tabanImzasi as TaslakImzasi, satirlar(t!.komutlar), g.secimler ?? {}, kisiOf(kullanici, simdi), HESAPLAR);
  if (k.durum === 'secim') return k;
  if (k.durum === 'bozuk') throw cakisma(k.ileti);
  let calismaSurumu = surum;
  if (k.deger !== c.calisma) {
    const y = await planlamaYaz(db, kullanici, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: k.deger as Record<string, unknown>, beklenenSurum: surum });
    calismaSurumu = y.kayit.surum;
  }
  await sorgular.taslakSil(db, kullanici.id, t!.surum);
  return { durum: 'uygulandi', calismaSurumu, uygulanan: k.uygulanan, dusen: k.dusen };
}

// 3282 1d-2 dizme (Risk 1d-2 K1-K4). Değerlendirme taslağın görünümünde, uç transaction'ının dışında işçide koşar (degerlendirme.ts, kişi
// başına tek iş). Plan-uygula sonucu yalnız bellekte, başlatan kişi ve taslağın o sürümü için tutulur; diz onu yeni bir istekte, taslak
// kilitliyken ve sürümü hâlâ aynıysa taslağa komut olarak yazar. Sonuç okunmazsa değerlendirme sonucu gibi silinir.
const DIZ_OMRU_MS = 5 * 60_000;
interface DizIsi { kisi: number; basla: number; taslakSurumu: number; isler: string[]; onceki: DizKomutu['onceki']; plan: Record<string, unknown> | null; bitis: number | null }
const dizler = new Map<string, DizIsi>();
// Hatayla biten değerlendirmenin dizmesi bitişsiz kalır; değerlendirme süresinden sonra o da silinir.
const dizTemizle = (simdi: number): void => { for (const [k, d] of dizler) if (simdi - (d.bitis ?? d.basla + DEGERLENDIRME_SURESI_MS) > DIZ_OMRU_MS) dizler.delete(k); };
export function taslakDizleriniSifirla(): void { dizler.clear(); }

export async function taslakDegerlendirmesi(
  db: Db, kullanici: Kullanici, g: { taslakSurumu: number; istek: DegerlendirmeIstegi }, simdi: number = Date.now(), yap: typeof degerlendirmeYap = degerlendirmeYap,
): Promise<{ is: string }> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  dizTemizle(simdi);
  const t = await sorgular.taslakOku(db, kullanici.id);
  surumDenetle(t, g.taslakSurumu);
  const c = await planlamaCalismasi(db, kullanici, simdi);
  if (c.calisma === null || c.surum === null) throw cakisma('Planlama çalışması yok; önce planı kurun.');
  const l = satirlar(t!.komutlar);
  const o = oynat(c.calisma, l, kisiOf(kullanici, simdi), HESAPLAR);
  const d: DizIsi | null = g.istek.tur === 'plan-uygula'
    ? { kisi: kullanici.id, basla: simdi, taslakSurumu: t!.surum, isler: g.istek.isler.map(String), onceki: { imza: dizImzasi(o.deger, c.calisma), n: l.length, dataVer: dataVerOf(c.calisma) }, plan: null, bitis: null } : null;
  const r = await degerlendirmeBaslat(db, kullanici, { surum: c.surum, istek: g.istek }, simdi, yap, {
    calisma: o.deger,
    bitince: (s) => { if (d !== null && s.tur === 'plan-uygula') { d.plan = s.plan as Record<string, unknown>; d.bitis = Date.now(); } },
  });
  if (d !== null) dizler.set(r.is, d);
  return r;
}

export async function taslakDiz(db: Db, kullanici: Kullanici, g: { taslakSurumu: number; is: string }, simdi: number = Date.now()): Promise<TaslakCevabi> {
  planlamaYazmaDenetimi(kullanici, PLANLAMA_ANAHTARI);
  dizTemizle(simdi);
  const d = dizler.get(g.is);
  if (d === undefined || d.kisi !== kullanici.id) throw bulunamadi('Dizme bulunamadı; yeniden dizin.');
  if (d.plan === null) throw cakisma('Plan hâlâ diziliyor; bitince yeniden deneyin.');
  const t = await sorgular.taslakOku(db, kullanici.id, true);
  surumDenetle(t, g.taslakSurumu);
  // Dizme başladıktan sonra taslağa komut eklendiyse ya da geri alındıysa sonuç o taslağın değildir (K2).
  if (t!.surum !== d.taslakSurumu) { dizler.delete(g.is); throw cakisma('Taslak dizme sürerken değişti; yeniden dizin.'); }
  // Yalnız son dizme planı taşır (boyut); öncekilerin planı düşer, satırları kalır.
  const eski = satirlar(t!.komutlar).map((s) => (s.komut.tur === 'diz' ? { ...s, komut: { ...s.komut, plan: null } } : s));
  if (eski.length >= TASLAK_KOMUTU_EN_COK) throw dogrulama(`Taslakta en çok ${String(TASLAK_KOMUTU_EN_COK)} değişiklik durur; önce uygulayın.`, 'komut');
  const kilit = kilitKaydi(d.plan.ops);
  const komut: DizKomutu = { tur: 'diz', isler: d.isler, plan: d.plan, onceki: d.onceki, ...(Object.keys(kilit).length > 0 ? { kilit } : {}) };
  const komutlar = [...eski, { komut, ne: komutAdi(komut), t: simdi }];
  if (degerCokBuyukMu(komutlar)) throw cokBuyuk(BUYUK);
  if ((await sorgular.taslakKomutlariYaz(db, { kisiId: kullanici.id, beklenenSurum: t!.surum, komutlar })) === null) throw cakisma(ESKI);
  dizler.delete(g.is);
  return gorunum(db, kullanici, await sorgular.taslakOku(db, kullanici.id), simdi);
}
