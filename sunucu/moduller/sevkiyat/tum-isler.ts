// Tüm işler (960): kalem yalnız serbest bırakılır; sevkiyat "Sevk et" ya da "Al" ile tetikler; depo son çıkışı ya da kabulü yapar.
// Kalem sevkiyat_bekleyen satırıdır; aday, başka modülde duran ve henüz kalemi olmayan şeydir (yalnız okunur).
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { ElleKalemGovdesi, SerbestBirakGovdesi, Tasima, TumIsAsamasi, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeAdlari } from '../malzemeler/disari.ts';
import { firmaAdlari, firmaVarMi } from '../musteri-tedarikci/disari.ts';
import { siparisSatirlari } from '../satin-alma/disari.ts';
import { siparisSatiriOzetleri } from '../siparisler/disari.ts';
import { adimliEmirListesi, emirNolari, fasonGonderimleri, fasonIsEmirleri, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import type { FasonGonderimi, FasonIsEmri } from '../uretim-emirleri/disari.ts';
import {
  adayListede, depoIhlali, elleKalemIhlalleri, emirIlerlemesi, fasonAdayiHazir, kabulTamamMi, KALEM_SAHIBI, serbestBirakmaIhlali, tasimaIhlali,
  tetikGeriAlIhlali, tetikIhlali, tumIsAsamasi,
} from './kurallar.ts';
import * as sorgu from './sorgular.ts';
import type { KalemSatiri, SerbestYazisi } from './sorgular.ts';

const varolan = <T>(x: readonly (T | null)[]): T[] => x.filter((y): y is T => y !== null);
const gun = (z: string | null): string | null => (z === null ? null : z.slice(0, 10));

// Kalemin çıkabilirliği: ürün emri bitince (adet dolar), fason gidişi adımın sırası gelip gidecek parça varken (Dış operasyonlardan
// yazılmış gidişin hareketi zaten vardır), dönüş gidişi depodan çıkınca. Alım ve elle gidiş hep hazırdır.
interface Hazirlik { hazir: boolean; gidisCikti: boolean | null }
async function hazirliklar(db: Db, kalemler: readonly KalemSatiri[], fason?: Map<number, FasonGonderimi>): Promise<Map<number, Hazirlik>> {
  const gidisler = new Map((await sorgu.kalemlerGetir(db, varolan(kalemler.map((k) => k.gidisBekleyenId)))).map((g) => [g.id, g]));
  const gonderim = fason ?? await fasonGonderimiOku(db, kalemler.filter((k) => k.kaynak === 'fason' && k.fasonHareketId === null && k.isEmriId !== null).map((k) => k.isEmriId!));
  const sonuc = new Map<number, Hazirlik>();
  for (const k of kalemler) {
    const gidis = k.gidisBekleyenId === null ? null : gidisler.get(k.gidisBekleyenId) ?? null;
    const gidisCikti = k.gidisBekleyenId === null ? null : gidis?.depoZamani != null;
    let hazir = true;
    if (k.kaynak === 'urun') hazir = k.adet !== null;
    else if (k.kaynak === 'fason' && k.fasonHareketId === null) {
      const g = k.isEmriId === null ? undefined : gonderim.get(k.isEmriId);
      hazir = g !== undefined && fasonAdayiHazir(g);
    } else if (gidisCikti !== null) hazir = gidisCikti;
    sonuc.set(k.id, { hazir, gidisCikti });
  }
  return sonuc;
}
async function fasonGonderimiOku(db: Db, isEmriIdleri: readonly number[], hepsi?: readonly FasonIsEmri[]): Promise<Map<number, FasonGonderimi>> {
  if (isEmriIdleri.length === 0) return new Map();
  const istenen = new Set(isEmriIdleri);
  const isler = (hepsi ?? await fasonIsEmirleri(db)).filter((x) => istenen.has(x.isEmriId));
  return fasonGonderimleri(db, isler.map((x) => ({ isEmriId: x.isEmriId, uretimEmriId: x.uretimEmriId, adet: x.adet })));
}

const asamaOf = (k: KalemSatiri, h: Hazirlik): TumIsAsamasi => tumIsAsamasi({
  hazir: h.hazir, serbest: k.serbestZamani !== null, erken: k.erkenZamani !== null, tasima: k.tasima,
  depoTamam: k.depoZamani !== null || k.isDurumu === 'tamamlandi',
  is: k.isId === null || k.isDurumu === null ? null : { durum: k.isDurumu, tetiklendi: k.isTetiklendi !== null },
});

const bosSatir = (s: Pick<TumIsSatiri, 'anahtar' | 'kaynak' | 'yon' | 'asama'> & Partial<TumIsSatiri>): TumIsSatiri => ({
  kalemId: null, hazirTarihi: null, istenenTarih: null, uretimEmriId: null, emirNo: null, isEmriId: null, opNo: null, adim: null, ilerleme: null,
  siparisNo: null, malzemeNo: null, malzemeAd: null, adet: null, firmaId: null, firmaAd: null, noktaId: null, tasima: null, elleTuru: null,
  aciklama: null, is: null, depo: null, erken: null, sonYazan: null, bagliAnahtar: null, ...s,
});

// Satırların adları tek turda okunur; olmayan kimlik boş kalır.
async function adlandir(db: Db, satirlar: TumIsSatiri[]): Promise<TumIsSatiri[]> {
  const firmaIdleri = varolan(satirlar.map((x) => x.firmaId));
  const firmalar = await firmaAdlari(db, firmaIdleri);
  const noktalar = await sorgu.firmaNoktalari(db, firmaIdleri);
  const malzemeler = await malzemeAdlari(db, varolan(satirlar.filter((x) => x.malzemeAd === null).map((x) => x.malzemeNo)));
  const emirler = await emirNolari(db, varolan(satirlar.filter((x) => x.emirNo === null).map((x) => x.uretimEmriId)));
  return satirlar.map((x) => ({
    ...x, firmaAd: x.firmaAd ?? (x.firmaId === null ? null : firmalar.get(x.firmaId) ?? null), noktaId: x.firmaId === null ? null : noktalar.get(x.firmaId) ?? null,
    malzemeAd: x.malzemeAd ?? (x.malzemeNo === null ? null : malzemeler.get(x.malzemeNo) ?? null),
    emirNo: x.emirNo ?? (x.uretimEmriId === null ? null : emirler.get(x.uretimEmriId) ?? null),
  }));
}

// Kalemin satırı; fason adımının numarası ve adı açık fason listesinden.
async function kalemSatirlari(db: Db, kalemler: readonly KalemSatiri[], fasonlar?: readonly FasonIsEmri[]): Promise<TumIsSatiri[]> {
  if (kalemler.length === 0) return [];
  const hazir = await hazirliklar(db, kalemler);
  const donus = new Map((await sorgu.donusleri(db, kalemler.map((k) => k.id))).map((d) => [d.gidisId, d.id]));
  const adimlar = new Map((fasonlar ?? (kalemler.some((k) => k.isEmriId !== null) ? await fasonIsEmirleri(db) : [])).map((f) => [f.isEmriId, f]));
  const kisiIdleri = kalemler.flatMap((k) => [k.sonYazanKisiId, k.erkenKisiId, k.depoKisiId]);
  const kisiler = await kisiAdlari(db, varolan(kisiIdleri));
  const ad = (id: number | null) => (id === null ? null : kisiler.get(id) ?? null);
  const satirlar = kalemler.map((k): TumIsSatiri => {
    const h = hazir.get(k.id)!;
    const adim = k.isEmriId === null ? undefined : adimlar.get(k.isEmriId);
    const bagli = k.gidisBekleyenId ?? donus.get(k.id) ?? null;
    return bosSatir({
      anahtar: `kalem:${String(k.id)}`, kalemId: k.id, kaynak: k.kaynak, yon: k.yon, asama: asamaOf(k, h),
      istenenTarih: k.istenenTarih, uretimEmriId: k.uretimEmriId, isEmriId: k.isEmriId, opNo: adim?.opNo ?? null, adim: adim?.adim ?? null,
      ilerleme: h.gidisCikti === false ? 'Gidiş henüz depodan çıkmadı' : k.kaynak === 'urun' && k.adet === null ? 'Emir bitince düşer' : null,
      malzemeNo: k.malzemeNo, adet: k.adet, firmaId: k.firmaId ?? k.isNoktaFirmaId, tasima: k.tasima, elleTuru: k.elleTuru, aciklama: k.aciklama,
      is: k.isId === null || k.isDurumu === null || k.isTarih === null ? null : { id: k.isId, tarih: k.isTarih, durum: k.isDurumu, tetiklendi: k.isTetiklendi },
      depo: k.depoZamani === null && k.kabulAdet === null ? null : { zaman: k.depoZamani, kisiAd: ad(k.depoKisiId), kabulAdet: k.kabulAdet },
      erken: k.erkenZamani === null || k.erkenGerekce === null ? null : { zaman: k.erkenZamani, kisiAd: ad(k.erkenKisiId), gerekce: k.erkenGerekce },
      sonYazan: k.sonYazanYer === null || k.sonYazanZamani === null ? null : { zaman: k.sonYazanZamani, kisiAd: ad(k.sonYazanKisiId), yer: k.sonYazanYer },
      bagliAnahtar: bagli === null ? null : `kalem:${String(bagli)}`,
    });
  });
  return adlandir(db, satirlar);
}

// Adaylar: kalemi olmayan bitmemiş emir, açık fason adımı, açık satın alma sipariş satırı. Tarihsiz ve günü aralık sonundan önce olan listede.
async function adaylar(db: Db, bitis: string, fasonlar: readonly FasonIsEmri[]): Promise<TumIsSatiri[]> {
  const kalemli = await sorgu.kalemliKaynaklar(db);
  const sonuc: TumIsSatiri[] = [];

  const { emirler } = await adimliEmirListesi(db, false);
  const acik = emirler.filter((e) => (ACIK_EMIR_DURUMLARI as readonly string[]).includes(e.durum) && !kalemli.urun.has(e.id) && adayListede(e.teslim, bitis)
    // Üstüne katılacak kol ayrı sevk edilmez.
    && !(e.parti?.ustEmirId != null && e.parti.birlesmeOpNo != null));
  const siparisler = await siparisSatiriOzetleri(db, varolan(acik.map((e) => e.siparisSatiriId ?? null)));
  for (const e of acik) {
    const sip = e.siparisSatiriId == null ? undefined : siparisler.get(e.siparisSatiriId);
    sonuc.push(bosSatir({
      anahtar: `urun:${String(e.id)}`, kaynak: 'urun', yon: 'gidis', asama: 'hazir-degil', hazirTarihi: e.teslim, istenenTarih: e.teslim,
      uretimEmriId: e.id, emirNo: e.emirNo, malzemeNo: e.urun.id, malzemeAd: e.urun.ad, adet: String(e.adet),
      ilerleme: emirIlerlemesi(e.tamamAdim, e.adimSayisi, e.siradaki?.opNo ?? null), siparisNo: sip?.siparisNo ?? null, firmaId: sip?.firmaId ?? null,
    }));
  }

  const adayFason = fasonlar.filter((f) => f.firmaId !== null && !kalemli.fason.has(f.isEmriId));
  const gonderim = await fasonGonderimiOku(db, adayFason.map((f) => f.isEmriId), fasonlar);
  for (const f of adayFason) {
    const g = gonderim.get(f.isEmriId);
    if (g === undefined || g.gonderilen >= g.gonderilebilir && g.siradaki) continue;
    const hazir = fasonAdayiHazir(g);
    sonuc.push(bosSatir({
      anahtar: `fason:${String(f.isEmriId)}`, kaynak: 'fason', yon: 'gidis', asama: hazir ? 'hazir' : 'hazir-degil', istenenTarih: f.termin ?? null,
      uretimEmriId: f.uretimEmriId, emirNo: f.emirNo, isEmriId: f.isEmriId, opNo: f.opNo, adim: f.adim, malzemeNo: f.malzemeNo,
      adet: String(hazir ? g.gonderilebilir - g.gonderilen : f.adet - g.gonderilen), firmaId: f.firmaId,
      ilerleme: hazir ? `OP ${String(f.opNo)} sırada` : `OP ${String(f.opNo)} sırası gelmedi`,
    }));
  }

  const talepAlimi = await sorgu.talepAlimlari(db);
  for (const s of await siparisSatirlari(db)) {
    if (kalemli.alim.has(s.id) || (s.firmaId !== null && talepAlimi.has(`${s.talepId}:${String(s.firmaId)}`)) || !adayListede(gun(s.beklenenTeslim), bitis)) continue;
    sonuc.push(bosSatir({
      anahtar: `alim:${String(s.id)}`, kaynak: 'alim', yon: 'gelis', asama: 'hazir', hazirTarihi: gun(s.beklenenTeslim), istenenTarih: gun(s.beklenenTeslim),
      siparisNo: s.siparisNo, malzemeNo: s.malzemeNo, malzemeAd: s.kalemAdi, adet: s.kalanMiktar, firmaId: s.firmaId,
    }));
  }
  return adlandir(db, sonuc);
}

export async function tumIsler(db: Db, aralik: { baslangic: string; bitis: string }): Promise<TumIsSatiri[]> {
  if (aralik.bitis < aralik.baslangic) throw dogrulama('Bitiş başlangıçtan önce olamaz.', 'bitis');
  const fasonlar = await fasonIsEmirleri(db);
  return [...await kalemSatirlari(db, await sorgu.tumIsKalemleri(db, aralik), fasonlar), ...await adaylar(db, aralik.bitis, fasonlar)];
}

// Komutun yetki bağlamı: kişi ve işlemi var mı (uç kullanıcıdan kurar).
export interface Yazan { kisiId: number; yetkili: (islem: Islem) => boolean }

function ihlaliAt(ihlal: ReturnType<typeof serbestBirakmaIhlali>): void {
  if (ihlal === null) return;
  throw ihlal.tur === 'yetki' ? yetkiYok(ihlal.ileti) : cakisma(ihlal.ileti);
}

// Serbest bırakma (941 c, 945 a): kalem varsa işaretlenir, aday kalem olarak açılır. Fason gidişi dönüşüyle açılır (dönüş, gidiş depodan
// çıkınca alınır). Hepsi ya da hiçbiri: bir kalemin reddi komutu geri alır.
export async function serbestBirak(db: Db, yazan: Yazan, govde: SerbestBirakGovdesi, yer: SerbestYazisi['yer'] = 'tum-isler'): Promise<number[]> {
  const gerekce = govde.erkenGerekce ?? null;
  const yazi = (hazir: boolean): SerbestYazisi => ({ tasima: govde.tasima, yer, kisiId: yazan.kisiId, erken: !hazir && gerekce !== null ? { kisiId: yazan.kisiId, gerekce } : null });
  const idler: number[] = [];
  for (const anahtar of govde.anahtarlar) {
    const [tur, no] = anahtar.split(':') as ['kalem' | 'urun' | 'fason' | 'alim', string];
    const id = Number(no);
    const kok = tur === 'urun' ? await sorgu.urunKokKalemi(db, id) : null;
    if (tur === 'kalem' || kok !== null) {
      const [k] = await sorgu.kalemleriKilitle(db, [kok?.id ?? id]);
      if (k === undefined || k.kaldirildi !== null) throw bulunamadi('Kalem bulunamadı.');
      const h = (await hazirliklar(db, [k])).get(k.id)!;
      ihlaliAt(serbestBirakmaIhlali({ kaynak: k.kaynak, asama: asamaOf(k, h) }, gerekce, yazan.yetkili));
      await sorgu.serbestYaz(db, k.id, yazi(h.hazir));
      idler.push(k.id);
    } else if (tur === 'urun') idler.push(await urunAdayiniAc(db, id, gerekce, yazan, yazi(false)));
    else if (tur === 'fason') idler.push(await fasonAdayiniAc(db, id, gerekce, yazan, yazi));
    else idler.push(await alimAdayiniAc(db, id, yazan, yazi(true)));
  }
  return idler;
}

async function urunAdayiniAc(db: Db, emirId: number, gerekce: string | null, yazan: Yazan, yazi: SerbestYazisi): Promise<number> {
  const e = await uretimEmriOzeti(db, emirId);
  if (e === null || e.arsiv || !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(e.durum)) throw bulunamadi('Açık üretim emri bulunamadı.');
  ihlaliAt(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'hazir-degil' }, gerekce, yazan.yetkili));
  const k = await sorgu.bekleyenEkle(db, {
    kaynak: 'urun', yon: 'gidis', uretimEmriId: e.id, fasonHareketId: null, talepId: null, firmaId: null, malzemeNo: e.malzemeNo,
    adet: null, istenenTarih: gun(e.teslim), isId: null, serbest: yazi,
  });
  if (k === null) throw cakisma('Bu emrin kalemi bu arada açıldı; listeyi yenileyin.');
  return k.id;
}

async function fasonAdayiniAc(db: Db, isEmriId: number, gerekce: string | null, yazan: Yazan, yazi: (hazir: boolean) => SerbestYazisi): Promise<number> {
  const fasonlar = await fasonIsEmirleri(db);
  const f = fasonlar.find((x) => x.isEmriId === isEmriId);
  if (f === undefined || f.firmaId === null) throw bulunamadi('Açık fason adımı bulunamadı.');
  const g = (await fasonGonderimiOku(db, [isEmriId], fasonlar)).get(isEmriId);
  if (g === undefined) throw bulunamadi('Açık fason adımı bulunamadı.');
  const hazir = fasonAdayiHazir(g);
  ihlaliAt(serbestBirakmaIhlali({ kaynak: 'fason', asama: hazir ? 'hazir' : 'hazir-degil' }, gerekce, yazan.yetkili));
  const adet = String(hazir ? g.gonderilebilir - g.gonderilen : f.adet - g.gonderilen);
  if (Number(adet) <= 0) throw cakisma('Bu fason adımına gidecek parça kalmadı.');
  const ortak = { uretimEmriId: f.uretimEmriId, fasonHareketId: null, talepId: null, firmaId: f.firmaId, malzemeNo: f.malzemeNo, adet, isId: null, isEmriId };
  const gidis = (await sorgu.bekleyenEkle(db, { ...ortak, kaynak: 'fason', yon: 'gidis', istenenTarih: null, serbest: yazi(hazir) }))!;
  await sorgu.bekleyenEkle(db, { ...ortak, kaynak: 'fason-donus', yon: 'gelis', istenenTarih: f.termin, gidisBekleyenId: gidis.id, serbest: yazi(true) });
  return gidis.id;
}

async function alimAdayiniAc(db: Db, satirId: number, yazan: Yazan, yazi: SerbestYazisi): Promise<number> {
  const [s] = await siparisSatirlari(db, [satirId]);
  if (s === undefined || s.firmaId === null) throw bulunamadi('Açık satın alma sipariş satırı bulunamadı.');
  ihlaliAt(serbestBirakmaIhlali({ kaynak: 'alim', asama: 'hazir' }, null, yazan.yetkili));
  return (await sorgu.bekleyenEkle(db, {
    kaynak: 'alim', yon: 'gelis', uretimEmriId: null, fasonHareketId: null, talepId: s.talepId, firmaId: s.firmaId, malzemeNo: s.malzemeNo,
    adet: Number(s.kalanMiktar) > 0 ? s.kalanMiktar : null, istenenTarih: gun(s.beklenenTeslim), isId: null, siparisSatiriId: s.id, serbest: yazi,
  }))!.id;
}

// Elle iş (958 a): numune, tamir, kalibrasyon gibi; dönüş günü verilirse bağlı geliş kalemi de açılır.
export async function elleKalemAc(db: Db, yazan: Yazan, g: ElleKalemGovdesi): Promise<number[]> {
  const ihlal = elleKalemIhlalleri(g);
  if (ihlal.length) throw dogrulama(ihlal[0]!.ileti, ihlal[0]!.alan, ihlal);
  if (!(await firmaVarMi(db, g.firmaId))) throw dogrulama('Firma bulunamadı.', 'firmaId');
  const serbest: SerbestYazisi = { tasima: g.tasima, yer: 'tum-isler', kisiId: yazan.kisiId, erken: null };
  const ortak = {
    kaynak: 'elle', uretimEmriId: null, fasonHareketId: null, talepId: null, firmaId: g.firmaId, malzemeNo: g.malzemeNo, adet: g.adet,
    isId: null, elleTuru: g.tur, aciklama: g.aciklama, serbest,
  } as const;
  const ilk = (await sorgu.bekleyenEkle(db, { ...ortak, yon: g.yon, istenenTarih: g.istenenTarih }))!;
  if (g.donusTarihi === null) return [ilk.id];
  const donus = (await sorgu.bekleyenEkle(db, { ...ortak, yon: 'gelis', istenenTarih: g.donusTarihi, gidisBekleyenId: ilk.id }))!;
  return [ilk.id, donus.id];
}

async function kilitliKalem(db: Db, id: number): Promise<{ k: KalemSatiri; asama: TumIsAsamasi; h: Hazirlik }> {
  const [k] = await sorgu.kalemleriKilitle(db, [id]);
  if (k === undefined || k.kaldirildi !== null) throw bulunamadi('Kalem bulunamadı.');
  const h = (await hazirliklar(db, [k])).get(k.id)!;
  return { k, asama: asamaOf(k, h), h };
}

// Sevkiyatçının taşıma değişimi; yazan ve yer izlenir (959 b). Satın almanın teslim yöntemi aynı kaydı `satin-alma` yeriyle yazar.
export async function tasimaDegistir(db: Db, kisiId: number | null, id: number, tasima: Tasima, yer: SerbestYazisi['yer'] = 'sevkiyat'): Promise<TumIsSatiri> {
  const { k, asama } = await kilitliKalem(db, id);
  const ihlal = tasimaIhlali({ asama, tasima: k.tasima }, tasima);
  if (ihlal) throw gecersiz(ihlal);
  if (k.tasima !== tasima) await sorgu.tasimaYaz(db, id, tasima, yer, kisiId);
  return (await kalemSatirlari(db, await sorgu.kalemlerGetir(db, [id])))[0]!;
}

// Tetik (Sevk et / Al): işin kalemleri depoya düşer. Geri alma depo yapmadıysa olur.
export async function isTetikle(db: Db, kisiId: number, isId: number): Promise<TumIsSatiri[]> {
  const is = await sorgu.isTetigi(db, isId);
  if (is === null || is.iptal) throw bulunamadi('İş bulunamadı ya da iptal edilmiş.');
  const kalemler = await sorgu.isinKalemleri(db, isId);
  const h = await hazirliklar(db, kalemler);
  const ihlal = tetikIhlali({ durum: is.durum, tetiklendi: is.tetiklendi !== null },
    kalemler.map((k) => ({ hazir: h.get(k.id)!.hazir, erken: k.erkenZamani !== null, gidisCikti: h.get(k.id)!.gidisCikti })));
  if (ihlal) throw gecersiz(ihlal);
  await sorgu.tetikYaz(db, isId, kisiId);
  return kalemSatirlari(db, await sorgu.kalemlerGetir(db, kalemler.map((k) => k.id)));
}
export async function isTetiginiGeriAl(db: Db, isId: number): Promise<TumIsSatiri[]> {
  const is = await sorgu.isTetigi(db, isId);
  if (is === null || is.iptal) throw bulunamadi('İş bulunamadı ya da iptal edilmiş.');
  const kalemler = await sorgu.isinKalemleri(db, isId);
  const ihlal = tetikGeriAlIhlali({ tetiklendi: is.tetiklendi !== null }, kalemler.some((k) => k.depoZamani !== null || k.kabulAdet !== null));
  if (ihlal) throw gecersiz(ihlal);
  await sorgu.tetikYaz(db, isId, null);
  return kalemSatirlari(db, await sorgu.kalemlerGetir(db, kalemler.map((k) => k.id)));
}

// ---------- depo (stok çağırır) ----------
export interface DepoKalemi {
  kalemId: number; is: 'cikis' | 'kabul'; kaynak: KalemSatiri['kaynak']; uretimEmriId: number | null; isEmriId: number | null; malzemeNo: number | null;
  adet: string | null; kabulAdet: string | null; firmaId: number | null; tasima: Tasima; tetiklendi: string; erken: boolean; siparisSatiriId: number | null;
  fasonHareketId: number | null;
}
const depoKalemi = (k: KalemSatiri): DepoKalemi => ({
  kalemId: k.id, is: k.yon === 'gidis' ? 'cikis' : 'kabul', kaynak: k.kaynak, uretimEmriId: k.uretimEmriId, isEmriId: k.isEmriId, malzemeNo: k.malzemeNo,
  adet: k.adet, kabulAdet: k.kabulAdet, firmaId: k.firmaId ?? k.isNoktaFirmaId, tasima: k.tasima ?? 'biz', tetiklendi: k.isTetiklendi ?? k.serbestZamani!,
  erken: k.erkenZamani !== null, siparisSatiriId: k.siparisSatiriId, fasonHareketId: k.fasonHareketId,
});
// Firma taşımasında kalem çıkabilir olunca depoya düşer; araçla taşımada tetik yeter (tetik çıkabilirliği zaten aradı).
export async function depoBekleyenleri(db: Db): Promise<DepoKalemi[]> {
  const kalemler = await sorgu.depodakiKalemler(db);
  const h = await hazirliklar(db, kalemler);
  return kalemler.filter((k) => asamaOf(k, h.get(k.id)!) === 'depoda').map(depoKalemi);
}
// Depo komutunun kalemi: kilitli, yönü ve aşaması denetlenmiş.
export async function depoKalemiAl(db: Db, id: number, is: 'cikis' | 'kabul'): Promise<DepoKalemi> {
  const { k, asama } = await kilitliKalem(db, id);
  const ihlal = depoIhlali({ yon: k.yon, asama }, is);
  if (ihlal) throw cakisma(ihlal);
  return depoKalemi(k);
}
export async function depoCikisiYaz(db: Db, kisiId: number, id: number): Promise<void> {
  await depoKalemiAl(db, id, 'cikis');
  await sorgu.depoYaz(db, id, kisiId, null, true);
}
// Kabul (mal kabul satırı): gelen adet eklenir; kalemin adedine ulaşınca kalem kapanır. Döner: kalem kapandı mı.
export async function depoKabuluYaz(db: Db, kisiId: number, id: number, gelen: string): Promise<boolean> {
  const k = await depoKalemiAl(db, id, 'kabul');
  const tamam = kabulTamamMi(k.adet, k.kabulAdet, gelen);
  await sorgu.depoYaz(db, id, kisiId, gelen, tamam);
  return tamam;
}
export { KALEM_SAHIBI };
