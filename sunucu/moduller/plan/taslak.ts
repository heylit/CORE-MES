import type { Db } from '#cekirdek/db.ts';
import { cakisma, cokBuyuk, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  TASLAK_KOMUTU_EN_COK, taslakKomutu, type TaslakCevabi, type TaslakKomutu, type TaslakUygulaCevabi,
} from '#paylasilan/sozlesme/planlama.ts';
import { degerCokBuyukMu } from '../recete-rota/disari.ts';
import { planaAlmaHesabi } from './plana-al.ts';
import { PLANLAMA_ANAHTARI, planlamaCalismasi, planlamaYaz, planlamaYazmaDenetimi } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';
import { imza, komutAdi, komutUygula, oynat, uygulaKarari, type TaslakHesaplari, type TaslakImzasi, type TaslakSatiri as Satir } from './taslak-kurallar.ts';
import { tasimaHesabi } from './tasima.ts';

// 3282 1d: kişinin taslağı. Akış: yetki (plan.yaz, uçta ve burada; satır yalnız çağıranın kimliğiyle okunur ve yazılır), taslak sürümü,
// komutlar güncel ortak çalışmaya sırayla oynatılır (taslak-kurallar.ts; taşıma ve plana alma hesapları burada verilir).
// Uygula ortak çalışmayı kilitler, kararı taslak-kurallar.ts uygulaKarari verir, yazılacak değer kaydın yazma yolundan yazılır.
const SAYFA = 'Kokpit';
const ESKI = 'Taslağınız başka bir sekmede değişti; sayfayı yenileyin.';
const BUYUK = 'Taslak çok büyüdü; bir kısmını uygulayıp yeniden deneyin.';

const HESAPLAR: TaslakHesaplari = { tasima: tasimaHesabi, planaAlma: planaAlmaHesabi };
const kisiOf = (kullanici: Kullanici, simdi: number) => ({ kim: kullanici.ad, sayfa: SAYFA, t: simdi });

// Satırları bu modül yazar; okurken yine de sözleşmeden geçer, bozuk satır oynatılmaz.
function satirlar(x: unknown): Satir[] {
  if (!Array.isArray(x)) return [];
  const l: Satir[] = [];
  for (const s of x as unknown[]) {
    if (typeof s !== 'object' || s === null) continue;
    const r = taslakKomutu.safeParse((s as Record<string, unknown>).komut);
    const { ne, t } = s as { ne?: unknown; t?: unknown };
    if (r.success && typeof ne === 'string' && typeof t === 'number') l.push({ komut: r.data, ne, t });
  }
  return l;
}

async function gorunum(db: Db, kullanici: Kullanici, t: sorgular.TaslakSatiri | null, simdi: number): Promise<TaslakCevabi> {
  const c = await planlamaCalismasi(db, kullanici, simdi);
  if (t === null || c.calisma === null) return { taslak: null, calisma: c.calisma, surum: c.surum };
  const l = satirlar(t.komutlar);
  const o = oynat(c.calisma, l, kisiOf(kullanici, simdi), HESAPLAR);
  return {
    taslak: { surum: t.surum, tabanSurum: t.tabanSurum, satirlar: l.map((s, i) => ({ ...s, hata: o.hatalar[i] ?? null })) },
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
  const komutlar = [...eski, { komut: g.komut, ne: komutAdi(g.komut), t: simdi }];
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
