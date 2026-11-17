import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { SiparisAcilisiCevabi, SiparisAcilisiSonucu } from '#paylasilan/sozlesme/siparis-acilisi.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { malzemeOzeti } from '../malzemeler/disari.ts';
import { projeKoduIleBul, siparisinProjeleri, siparistenProjeAc } from '../projeler/disari.ts';
import { siparisAyrintisi, siparisKilitliAyrinti } from '../siparisler/disari.ts';
import type { SiparisDurumOlayi, SiparisOnaylandiOlayi } from '../siparisler/disari.ts';
import { emirIptalBildir } from './emir-olaylari.ts';
import { rotaBekleyenEmirAc } from './is-emri-servis.ts';
import * as s from './sorgular.ts';
import {
  PROJE_KODU_GECERSIZ, PROJE_KODU_KULLANILIYOR, acilacakPartiler, dokunulmamisMi, eksikAcmaIslemleri, projeKoduGecerliMi, projeKoduOnerisi,
  yenidenEsle, yetkiEksikIletisi, type AcilisPartisi,
} from './siparis-acilisi-kurallar.ts';

// 3272: sipariş onaylanınca proje ve her kalem partisi için taslak emir. Rota modülü bu modülün üstündedir (ADR 0006); emrin rotası ve
// rotadan emir açma kablolama.ts'te kaydedilen çözücüden gelir. Emir taşıyan satın alma ve stok bağları da öyle (iki modül de bunu ithal eder).
// 3296: secilenRotaId partide elle seçilen rotadır (elle: kullanıldı mı); revizyonunRotasi bölmede emrin rotasını bulur.
export interface SiparisAcilisiRotasi { rotaId: number; ad: string; harf: string | null; revizyonId: number | null; elle: boolean; seriyeDustu?: boolean }
export interface SiparisAcilisiCozuculeri {
  turunRotasi: (db: Db, malzemeNo: number, emirTuru: EmirTuru, secilenRotaId?: number | null) => Promise<SiparisAcilisiRotasi | null>;
  revizyonunRotasi: (db: Db, revizyonId: number) => Promise<number | null>;
  emreKopyala: (db: Db, kullanici: Kullanici, revizyonId: number, g: {
    adet: number; teslim: string | null; baslangic?: string | null; oncelik: number; taslak: boolean; projeId: number | null; siparisSatiriId: number | null;
    siparisPartiId: number | null; emirTuru: EmirTuru; aciklama?: string | null;
  }) => Promise<{ uretimEmriId: number }>;
  // tedarik: satın alma siparişi aşamasında (kilitler); talep: yalnız talep aşamasında (uyarır, 3272-2); stok: fişi olan (kilitler).
  emirBaglari: (db: Db, emirIdleri: readonly number[]) => Promise<{ tedarik: ReadonlySet<number>; talep: ReadonlySet<number>; stok: ReadonlySet<number> }>;
  // 3296 (Risk K1): emre stoktan ayrılmış malzeme var mı; bölmede ayrı emir açılırken ana emrin rezervesi yeni emre geçmez.
  rezervesiVar?: (db: Db, emirId: number) => Promise<boolean>;
}
let cozucu: SiparisAcilisiCozuculeri | null = null;
export function siparisAcilisiCozuculeriKaydet(c: SiparisAcilisiCozuculeri | null): void { cozucu = c; }
// 3296-2 a: bölme rotası aynı çözücüyü kullanır; kayıtlı değilse (kablolamasız test) bölme rotaya bakmaz.
export const bolmeCozuculeri = (): SiparisAcilisiCozuculeri | undefined => cozucu ?? undefined;
function cozuculer(): SiparisAcilisiCozuculeri {
  if (cozucu === null) throw new Error('Sipariş açılışı için rota ve bağ çözücüsü kayıtlı değil (kablolama.ts).');
  return cozucu;
}

const ayarAcik = (db: Db): Promise<boolean> => sistemAyariOku(db, 'uretim-emirleri.siparis-onayinda-ac');
const URETILEBILIR: readonly string[] = ['mamul', 'yarimamul'];

async function onerilenKod(db: Db, siparisNo: string): Promise<string> {
  const kullanilan = new Set<string>();
  for (let n = 0; n < 50; n++) {
    const aday = projeKoduOnerisi(siparisNo, (k) => kullanilan.has(k));
    if ((await projeKoduIleBul(db, aday)) === null) return aday;
    kullanilan.add(aday);
  }
  throw cakisma(PROJE_KODU_KULLANILIYOR);
}

interface Durum {
  siparis: Awaited<ReturnType<typeof siparisAyrintisi>>;
  proje: { id: number; kod: string; ad: string } | null;
  partiler: AcilisPartisi[];
  emirler: s.SiparisEmriSatiri[];
}

async function durumOku(db: Db, siparisId: number): Promise<Durum> {
  const siparis = await siparisAyrintisi(db, siparisId);
  const projeler = await siparisinProjeleri(db, siparisId);
  const proje = projeler.find((p) => p.durum === 'aktif') ?? null;
  const uretilir = new Map<number, boolean>();
  for (const no of new Set(siparis.satirlar.map((k) => k.malzemeNo))) {
    const m = await malzemeOzeti(db, no);
    uretilir.set(no, m !== null && m.onayDurumu === 'aktif' && URETILEBILIR.includes(m.tur));
  }
  const partiler = acilacakPartiler(siparis.satirlar, siparis.termin, (no) => uretilir.get(no) === true);
  const emirler = await s.siparisEmirleri(db, siparis.satirlar.map((k) => k.id), projeler.map((p) => p.id));
  return { siparis, proje: proje === null ? null : { id: proje.id, kod: proje.kod, ad: proje.ad }, partiler, emirler };
}

// Partinin emri: aynı kalem ve partideki açık emir; partisiz eski emir (acil sipariş yolu) bütün kalemi karşılar.
function partininEmri(d: Durum, p: AcilisPartisi): s.SiparisEmriSatiri | null {
  const kalemin = d.emirler.filter((e) => e.siparisSatiriId === p.kalemId && e.durum !== 'iptal');
  return kalemin.find((e) => e.siparisPartiId === p.partiId) ?? kalemin.find((e) => e.siparisPartiId === null) ?? null;
}

const projeAdi = (d: Durum): string => `${d.siparis.firmaAd ?? ''} ${d.siparis.no}`.trim().slice(0, 200);

// Onay penceresi ve "Proje ve emirler" kartı: açılacak ya da açılmış proje ve her partinin emri, rotası ve atlama nedeni.
export async function siparisAcilisiDurumu(db: Db, kullanici: Kullanici, siparisId: number): Promise<SiparisAcilisiCevabi> {
  const d = await durumOku(db, siparisId);
  const r = cozuculer();
  const satirlar = [];
  const kalemler = new Map(d.siparis.satirlar.map((k) => [k.id, k]));
  for (const p of d.partiler) {
    const emir = partininEmri(d, p);
    const rota = p.atlama === null ? await r.turunRotasi(db, p.malzemeNo, p.emirTuru, p.rotaId) : null;
    const k = kalemler.get(p.kalemId);
    satirlar.push({
      kalemId: p.kalemId, kalemSira: p.kalemSira, partiId: p.partiId, malzemeNo: p.malzemeNo, malzemeKodu: k?.malzemeKodu ?? null,
      malzemeAdi: k?.malzemeAdi ?? null, emirTuru: p.emirTuru, adet: p.adet, teslim: p.teslim,
      rota: rota?.revizyonId == null ? null : { ad: rota.ad, harf: rota.harf ?? '', elle: rota.elle, elleDustu: p.rotaId !== null && !rota.elle, seriyeDustu: rota.seriyeDustu === true },
      emir: emir === null ? null : { id: emir.id, no: emir.emirNo, durum: emir.durum, rotaBekliyor: emir.rotaBekliyor },
      atlama: p.atlama,
    });
  }
  return {
    acik: await ayarAcik(db),
    proje: d.proje === null
      ? { id: null, kod: await onerilenKod(db, d.siparis.no), ad: projeAdi(d), bitis: d.siparis.termin }
      : { id: d.proje.id, kod: d.proje.kod, ad: d.proje.ad, bitis: null },
    satirlar,
    eksikIslemler: eksikAcmaIslemleri((i) => islemVarMi(kullanici, i as Islem)),
    geriAlmaUyarilari: await geriAlmaUyarilari(db, d.emirler),
  };
}

// 3272-2: kalemden çözülecek ya da iptal olacak (dokunulmamış) emirlerin talep ve hazırlık uyarısı; kilitleyen bağı olan emir burada yoktur.
async function geriAlmaUyarilari(db: Db, emirler: readonly s.SiparisEmriSatiri[]): Promise<SiparisAcilisiCevabi['geriAlmaUyarilari']> {
  const dokunulmamis = await dokunulmamisEmirler(db, emirler);
  if (dokunulmamis.length === 0) return [];
  const idler = dokunulmamis.map((e) => e.id);
  const { talep } = await cozuculer().emirBaglari(db, idler);
  const hazirlik = await s.hazirligiTamamlananEmirler(db, idler);
  return dokunulmamis.flatMap((e) => {
    const nedenler = [...(talep.has(e.id) ? ['talep' as const] : []), ...(hazirlik.has(e.id) ? ['hazirlik' as const] : [])];
    return nedenler.length === 0 ? [] : [{ emirId: e.id, emirNo: e.emirNo, nedenler }];
  });
}

// UE-SA-02, UE-SA-05, UE-SA-06: projesi yoksa açılır, eksik partilerin emri açılır ya da çözülmüş emir yeniden bağlanır. Onayla aynı
// işlemdedir: bir emir açılamazsa onay da yazılmaz. Var olan proje ve emir ikinci kez açılmaz.
async function ac(db: Db, kullanici: Kullanici, siparisId: number, projeKodu: string | undefined): Promise<SiparisAcilisiSonucu> {
  const d = await durumOku(db, siparisId);
  const eksikler = d.partiler.filter((p): p is AcilisPartisi & { adet: number } => p.atlama === null && p.adet !== null && partininEmri(d, p) === null);
  if (d.proje !== null && eksikler.length === 0) return { projeId: d.proje.id, acilan: 0, baglanan: 0 };
  const eksik = eksikAcmaIslemleri((i) => islemVarMi(kullanici, i as Islem));
  if (eksik.length > 0) throw yetkiYok(yetkiEksikIletisi(eksik));
  const r = cozuculer();
  let projeId = d.proje?.id ?? null;
  if (projeId === null) {
    const kod = projeKodu === undefined ? await onerilenKod(db, d.siparis.no) : projeKodu.toLocaleUpperCase('tr').replaceAll('İ', 'I');
    if (!projeKoduGecerliMi(kod)) throw dogrulama(PROJE_KODU_GECERSIZ, 'projeKodu');
    if ((await projeKoduIleBul(db, kod)) !== null) throw cakisma(PROJE_KODU_KULLANILIYOR);
    projeId = (await siparistenProjeAc(db, kullanici, siparisId, {
      kod, ad: projeAdi(d), baslangic: null, bitis: null, aciklama: 'Sipariş onayıyla açıldı.', butceTutari: null, butceParaBirimi: null,
    })).projeId;
  }
  const cozulmus = d.emirler.filter((e) => e.siparisSatiriId === null && e.durum === 'taslak' && !e.arsiv && e.projeId === projeId);
  const esle = yenidenEsle(eksikler, cozulmus);
  for (const b of esle.bagla) {
    await s.kalemeBagla(db, b.emirId, { satirId: b.parti.kalemId, partiId: b.parti.partiId, adet: b.parti.adet, teslim: b.parti.teslim });
  }
  for (const id of esle.iptal) await iptalEt(db, kullanici, id);
  for (const p of esle.ac) {
    const rota = await r.turunRotasi(db, p.malzemeNo, p.emirTuru, p.rotaId);
    const baslik = { adet: p.adet, teslim: null, oncelik: 3, taslak: true as const, projeId, siparisSatiriId: p.kalemId, siparisPartiId: p.partiId, emirTuru: p.emirTuru };
    if (rota?.revizyonId == null) {
      await rotaBekleyenEmirAc(db, kullanici, { ...baslik, malzemeNo: p.malzemeNo });
    } else {
      const { uretimEmriId } = await r.emreKopyala(db, kullanici, rota.revizyonId, baslik);
      await s.acilisKaynagiYaz(db, uretimEmriId);
    }
  }
  return { projeId, acilan: esle.ac.length, baglanan: esle.bagla.length };
}

// Sipariş onaylandı olayı (kablolama.ts bağlar). Ayar kapalıysa hiçbir şey açılmaz.
export async function siparisOnaylandiAc(db: Db, olay: SiparisOnaylandiOlayi): Promise<void> {
  if (!(await ayarAcik(db))) return;
  await ac(db, olay.kullanici, olay.siparisId, olay.projeKodu);
}

// Ayar kapalıyken ya da ayar açılmadan önce onaylanmış sipariş için aynı açılış; yalnız onaylı siparişte.
export const SIPARIS_ONAYLI_DEGIL = 'Proje ve emirler yalnız onaylı siparişte açılır.';
export async function siparisAcilisiYap(db: Db, kullanici: Kullanici, siparisId: number, projeKodu: string | undefined): Promise<SiparisAcilisiSonucu> {
  // Sipariş satırı işlem sonuna dek kilitli: eşzamanlı iki açma ya da açmayla yarışan "onayı geri al" sırayla yürür, emir çiftlenmez
  // (uretim_emri.siparis_parti_id tekil değildir; tekrar engeli bu kilit ve partininEmri okumasıdır).
  const sp = await siparisKilitliAyrinti(db, siparisId).catch(() => null);
  if (sp === null) throw bulunamadi('Sipariş bulunamadı.');
  if (sp.durum !== 'onayli') throw cakisma(SIPARIS_ONAYLI_DEGIL);
  return ac(db, kullanici, siparisId, projeKodu);
}

// Satın alma ve stok bağı çözücüden; dokunulmamış (UE-SA-03) olanlar döner.
export async function dokunulmamisEmirler(db: Db, emirler: readonly s.SiparisEmriSatiri[]): Promise<s.SiparisEmriSatiri[]> {
  const adaylar = emirler.filter((e) => e.acilisKaynagi === 'siparis_onayi' && e.durum === 'taslak' && !e.arsiv);
  if (adaylar.length === 0) return [];
  const bag = await cozuculer().emirBaglari(db, adaylar.map((e) => e.id));
  return adaylar.filter((e) => dokunulmamisMi({ ...e, tedarikVar: bag.tedarik.has(e.id), stokVar: bag.stok.has(e.id) }));
}

async function siparisinDokunulmamislari(db: Db, siparisId: number): Promise<s.SiparisEmriSatiri[]> {
  const sp = await siparisAyrintisi(db, siparisId);
  const projeler = await siparisinProjeleri(db, siparisId);
  const emirler = await s.siparisEmirleri(db, sp.satirlar.map((k) => k.id), projeler.map((p) => p.id));
  const kilitli = await s.siparisEmirleriKilitle(db, emirler.map((e) => e.id));
  return dokunulmamisEmirler(db, kilitli);
}

async function iptalEt(db: Db, kullanici: Kullanici, id: number): Promise<void> {
  const [e] = await s.siparisEmirleriKilitle(db, [id]);
  if (e === undefined || e.durum !== 'taslak') return;
  await s.ustIptalYaz(db, id, e.surum);
  await emirIptalBildir(db, { uretimEmriId: id, kisiId: kullanici.id });
}

// 3272-3 a: onayı geri alınan siparişin dokunulmamış emirleri kalemden çözülür; kalem değişebilir, yeniden onayda eşine bağlanır.
export async function siparisOnayiGeriAlindiCoz(db: Db, olay: SiparisDurumOlayi): Promise<void> {
  const emirler = (await siparisinDokunulmamislari(db, olay.siparisId)).filter((e) => e.siparisSatiriId !== null);
  if (emirler.length > 0) await s.kalemdenCoz(db, emirler.map((e) => e.id));
}

// 3272-3 a: iptal edilen siparişin dokunulmamış emirleri iptal olur (silinmez).
export async function siparisIptalEdildiIptal(db: Db, olay: SiparisDurumOlayi): Promise<void> {
  for (const e of await siparisinDokunulmamislari(db, olay.siparisId)) await iptalEt(db, olay.kullanici, e.id);
}

// Sipariş iptal reddi (2103 a) dokunulmamış emri saymaz; kablolama.ts bağlı emir çözücüsünde bunu süzer.
export async function dokunulmamisEmirIdleri(db: Db, emirIdleri: readonly number[]): Promise<ReadonlySet<number>> {
  if (emirIdleri.length === 0) return new Set();
  return new Set((await dokunulmamisEmirler(db, await s.siparisEmirleriKilitle(db, emirIdleri))).map((e) => e.id));
}

// Rota yürürlüğe girince bekleyen emirler (UE-SA-04): taslak, arşivsiz, rota bekleyen; rota modülü kendi kuralıyla uygular.
export { rotaBekleyenEmirler } from './sorgular.ts';
