import { type Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, cakisma, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { KisitEslemesi } from '#cekirdek/kisit.ts';
import type { NumaraAnahtari } from '#paylasilan/ayarlar.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { BakiyeSatiri, KaliteDurumu, Hareket } from '#paylasilan/sozlesme/stok.ts';
import { numaraAl } from '../../ayarlar/disari.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { malzemeAdlari, malzemeOzeti } from '../../malzemeler/disari.ts';
import { adimliEmirAyrintisi, emirNolari } from '../../uretim-emirleri/disari.ts';
import { binde, bindenMetin, ilkGirisBirlesik, kalanAmbalajAdedi, partiEtiketi, stoklanirMi } from '../kurallar.ts';
import * as sorgular from '../sorgular.ts';
import type { BakiyeHam, BelgeTablosu, HareketHam, HareketYeni } from '../sorgular.ts';

// Numara kayıtla aynı işlemde alınır: kayıt geri alınırsa sıra da geri alınır.
export const belgeNo = (db: Db, anahtar: NumaraAnahtari, tablo: BelgeTablosu): Promise<string> =>
  numaraAl(db, anahtar, { varMi: (no) => sorgular.belgeNoVarMi(db, tablo, no) });

// 1647: parti açıldığı anda yürürlükteki parça revizyonunu taşır. Revizyonun sahibi değişiklik yönetimidir ve bu modülü okur; bağı
// kablolama.ts kurar. Bağ yoksa ya da parçanın revizyonu yoksa boş kalır.
export type ParcaRevizyonuCozucusu = (db: Db, malzemeIdleri: readonly number[]) => Promise<Map<number, string>>;
let parcaRevizyonuCozucu: ParcaRevizyonuCozucusu = async () => new Map();
export function parcaRevizyonuCozucusuKaydet(cozucu: ParcaRevizyonuCozucusu): void { parcaRevizyonuCozucu = cozucu; }
// Mal kabul (2877): sipariş satırının revizyonu yürürlüktekiyle aynı kaynaktan karşılaştırılır.
export const yururluktekiRevizyonlar = (db: Db, malzemeIdleri: readonly number[]): Promise<Map<number, string>> =>
  malzemeIdleri.length === 0 ? Promise.resolve(new Map()) : parcaRevizyonuCozucu(db, [...new Set(malzemeIdleri)]);
const partiRevizyonu = async (db: Db, malzemeId: number): Promise<string | null> => (await parcaRevizyonuCozucu(db, [malzemeId])).get(malzemeId) ?? null;

// Her mal kabul gelişi ayrı lottur, aynı tedarikçi parti/döküm no gelse de (#124); yalnız üretim girişi emrin partisine eklenir.
// Siparişli mal kabulde revizyon sipariş satırınındır (sipariş verilirken yürürlükte olan); yoksa açılış anında yürürlükteki.
export async function partiBulVeyaAc(db: Db, p: sorgular.PartiAnahtari, siparisRevizyonu: string | null = null): Promise<number> {
  const varOlan = p.uretimEmriId !== null ? await sorgular.emirPartisiBul(db, p.malzemeId, p.uretimEmriId) : null;
  if (varOlan !== null) return varOlan;
  const lotNo = await numaraAl(db, 'stok.lot-no', { varMi: (no) => sorgular.lotNoVarMi(db, no) });
  return (await sorgular.partiAc(db, { ...p, lotNo, parcaRevizyonu: siparisRevizyonu ?? await partiRevizyonu(db, p.malzemeId) })) ?? (await sorgular.emirPartisiBul(db, p.malzemeId, p.uretimEmriId!))!;
}
// 3129: başlangıç stoğunda lot no dosyadan gelir (eski sistemin lotu); boşsa partiBulVeyaAc numarayı verir.
export async function partiyiNoylaAc(db: Db, p: Omit<sorgular.PartiAnahtari, 'uretimEmriId'>, lotNo: string): Promise<number> {
  return (await sorgular.partiAc(db, { ...p, uretimEmriId: null, lotNo, parcaRevizyonu: await partiRevizyonu(db, p.malzemeId) }))!;
}
// 2099-5 a: SKT karşılaştırması tesis günüyle yapılır; gün sunucudan, istemciden alınmaz.
export const sktBugun = (): string => tesisGunu(Date.now());
// Üretim girişinin partisi: refakat kartıyla sayılan parça kartın partisine, kartsız sayım emrin partisine girer (#126).
export async function uretimPartisi(db: Db, p: { malzemeId: number; uretimEmriId: number; refakatPartisiId: number | null; kisiId: number }): Promise<number> {
  if (p.refakatPartisiId === null) {
    return partiBulVeyaAc(db, { malzemeId: p.malzemeId, tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, uretimEmriId: p.uretimEmriId, kisiId: p.kisiId });
  }
  const varOlan = await sorgular.refakatCiktiPartisiBul(db, p.malzemeId, p.refakatPartisiId);
  if (varOlan !== null) return varOlan;
  const lotNo = await numaraAl(db, 'stok.lot-no', { varMi: (no) => sorgular.lotNoVarMi(db, no) });
  return (await sorgular.refakatCiktiPartisiAc(db, { ...p, refakatPartisiId: p.refakatPartisiId, lotNo, parcaRevizyonu: await partiRevizyonu(db, p.malzemeId) }))
    ?? (await sorgular.refakatCiktiPartisiBul(db, p.malzemeId, p.refakatPartisiId))!;
}

// ---- Kısıt → ileti (kisitKorumali); adlar göçtedir ---------------------------------------------------------------
const ESLEME: KisitEslemesi = {
  stok_konum_kod_tek: { ileti: 'Bu konum kodu kullanılıyor.', alan: 'kod' },
  stok_konum_raf_gozu_tek: 'Bu rafta bu bölme ve kat zaten var.',
  stok_bakiye_aktif_konumda: 'Bu konumda stok var ya da konum pasif; önce stoğu taşıyın.',
  stok_bakiye_tek: 'Aynı anda başka bir stok işlemi yazıldı; yeniden deneyin.',
  stok_parti_tanimli: { ileti: 'Parti için tedarikçi parti no ya da döküm no gerekli.', alan: 'parti' },
  stok_parti_emir_tek: 'Bu parti az önce açıldı; yeniden deneyin.',
  stok_parti_lot_tek: 'Bu lot numarası kullanılıyor; yeniden deneyin.',
  stok_bakiye_parti_malzemesi: { ileti: 'Parti bu malzemeye ait değil.', alan: 'partiId' },
  stok_hareketi_parti_malzemesi: { ileti: 'Parti bu malzemeye ait değil.', alan: 'partiId' },
  stok_mal_kabul_satiri_parti_malzemesi: { ileti: 'Parti bu malzemeye ait değil.', alan: 'partiId' },
  stok_hareketi_tek_geri_alma: 'Bu hareket zaten geri alındı.',
  stok_hareketi_sarf_emirli: { ileti: 'Üretime sarf için üretim emri seçin.', alan: 'uretimEmriId' },
  stok_hareketi_emir_yalniz_uretimde: { ileti: 'Üretim emri yalnız üretime sarf çıkışında girilir.', alan: 'uretimEmriId' },
  stok_hareketi_malzeme_var: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeId' },
  stok_bakiye_malzeme_var: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeId' },
  stok_malzeme_ayari_malzeme_var: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeId' },
  stok_mal_kabul_tek_duzeltme: 'Bu belge az önce düzeltildi.',
  stok_raf_zemin_tek_kat: { ileti: 'Zemin istif alanı tek katlıdır.', alan: 'katSayisi' },
  stok_mal_kabul_satiri_siparis_satiri_var: { ileti: 'Sipariş satırı bulunamadı.', alan: 'siparisSatirId' },
};
export const korumali = <T>(is: () => Promise<T>): Promise<T> => kisitKorumali(ESLEME, is, { BAGIMLI_KAYIT: 'Bu kayıt kullanımda; değiştirilemez.' });

// ---- Yardımcılar --------------------------------------------------------------------------------------------------
export async function adlar(db: Db, malzemeIdler: number[]): Promise<Map<number, string>> {
  return malzemeAdlari(db, [...new Set(malzemeIdler)]);
}
type EmirNolari = ReadonlyMap<number, string>;
export const emirNoDe = (nolar: EmirNolari, id: number | null | undefined): string | null => (id === null || id === undefined ? null : nolar.get(id) ?? null);
// Tek sorguyla (N+1 yok); kimlik listesi boşsa sorgu atılmaz.
export const emirNoHaritasi = (db: Db, idler: readonly (number | null | undefined)[]): Promise<EmirNolari> =>
  emirNolari(db, idler.filter((x): x is number => x !== null && x !== undefined));
export function bakiyeSatiri(b: BakiyeHam, ad: Map<number, string>, nolar: EmirNolari): BakiyeSatiri {
  return {
    id: b.id, malzemeId: b.malzemeId, malzemeAd: ad.get(b.malzemeId) ?? null, konumId: b.konumId, konumKod: b.konumKod, partiId: b.partiId,
    partiEtiketi: b.partiId === null ? null : partiEtiketi({ lotNo: b.lotNo, tedarikciPartiNo: b.tedarikciPartiNo, dokumNo: b.dokumNo, uretimEmriId: b.uretimEmriId }, emirNoDe(nolar, b.uretimEmriId)),
    miktar: b.miktar, ilkGiris: b.ilkGiris,
    ambalaj: b.ambalajTur === null ? null : { tur: b.ambalajTur, olcu: b.ambalajOlcu ?? '', adet: b.ambalajAdet }, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu,
    sonKullanma: b.sonKullanma, konumaGelis: b.konumaGelis,
  };
}
export async function hareketleriCevir(db: Db, satirlar: HareketHam[]): Promise<Hareket[]> {
  const ad = await adlar(db, satirlar.map((h) => h.malzemeId));
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.map((h) => h.kisiId))]);
  const nolar = await emirNoHaritasi(db, satirlar.flatMap((h) => [h.partiEmirId, h.uretimEmriId]));
  return satirlar.map((h) => ({
    id: h.id, zaman: h.zaman, tur: h.tur, malzemeId: h.malzemeId, malzemeAd: ad.get(h.malzemeId) ?? null, partiId: h.partiId,
    partiEtiketi: h.partiId === null ? null : partiEtiketi({ lotNo: h.lotNo, tedarikciPartiNo: h.tedarikciPartiNo, dokumNo: h.dokumNo, uretimEmriId: h.partiEmirId }, emirNoDe(nolar, h.partiEmirId)),
    kaynakKonumKod: h.kaynakKonumKod, hedefKonumKod: h.hedefKonumKod, miktar: h.miktar, onayliEksi: h.onayliEksi, girisKaynagi: h.girisKaynagi, baslangicBelgeNo: h.baslangicBelgeNo,
    cikisNedeni: h.cikisNedeni, uretimEmriId: h.uretimEmriId, emirNo: emirNoDe(nolar, h.uretimEmriId), geriAlinanId: h.geriAlinanId, geriAlindi: h.geriAlindi, fisId: h.fisId, fisNo: h.fisNo,
    hareketFisiId: h.hareketFisiId, hareketFisiNo: h.hareketFisiNo, otomatik: h.akis !== null,
    kisiAd: kisiler.get(h.kisiId) ?? null, aciklama: h.aciklama, kaynakStatuId: h.kaynakStatuId, hedefStatuId: h.hedefStatuId,
    kaynakKaliteDurumu: h.kaynakKaliteDurumu, hedefKaliteDurumu: h.hedefKaliteDurumu,
  }));
}
export async function aktifKonum(db: Db, id: number, alan: string) {
  const k = await sorgular.konumBul(db, id);
  if (!k) throw dogrulama('Konum bulunamadı.', alan);
  if (!k.aktif) throw gecersiz('Konum pasif; stok yazılamaz.');
  return k;
}
export async function varsayilanKonum(db: Db, kod: 'KABUL' | 'URETIM'): Promise<number> {
  const k = await sorgular.konumKoduyla(db, kod);
  if (!k) throw new Error(`Sabit konum yok: ${kod}`);
  return k.id;
}

interface BakiyeDegisimi {
  malzemeId: number; konumId: number; partiId: number | null; statuId?: number | null; kaliteDurumu?: KaliteDurumu; fark: bigint; ilkGiris?: string | null;
  ambalaj?: { tur: string; olcu: string; uzunluk: string | null; genislik: string | null; yukseklik: string | null; adet: number | null } | null;
}
// Bakiye (malzeme, konum, parti, statü, kalite) satırı kilitlenir; sıfıra inen satır silinir (DEP-01). Önceki miktar döner.
export async function bakiyeDegistir(db: Db, d: BakiyeDegisimi): Promise<BakiyeHam | null> {
  let b = await sorgular.bakiyeKilitle(db, d.malzemeId, d.konumId, d.partiId, d.statuId ?? null, d.kaliteDurumu ?? 'serbest');
  if (!b) {
    if (d.fark === 0n) return null;
    // Hizmet kartı hiçbir komutla (sayım fazlası, eksiye onaylı çıkış dahil) bakiye açmaz; hizmetten çıkan malzeme kendi kartıyla girer.
    const o = await malzemeOzeti(db, d.malzemeId);
    if (o && !stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoklanmaz; hizmetten çıkan malzeme kendi kartıyla girer.`, 'malzemeId');
    const a = d.ambalaj ?? null;
    const acilan = await sorgular.bakiyeEkle(db, {
      malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId ?? null, kaliteDurumu: d.kaliteDurumu ?? 'serbest', miktar: bindenMetin(d.fark), ilkGiris: d.ilkGiris ?? null,
      ambalajTur: a?.tur ?? null, ambalajOlcu: a?.olcu ?? null, uzunluk: a?.uzunluk ?? null, genislik: a?.genislik ?? null, yukseklik: a?.yukseklik ?? null, ambalajAdet: a?.adet ?? null,
    });
    const yeniSatir = (acilan as { id: number }[])[0];
    if (yeniSatir) { await sorgular.konumaGelisYenile(db, yeniSatir.id); return null; }
    // Aynı satırı eşzamanlı başka komut açtı (ON CONFLICT bekleyip boş döndü): onun satırı kilitlenip üstüne yazılır.
    b = await sorgular.bakiyeKilitle(db, d.malzemeId, d.konumId, d.partiId, d.statuId ?? null, d.kaliteDurumu ?? 'serbest');
    if (!b) throw cakisma('Stok bu sırada değişti; yeniden deneyin.');
  }
  const yeni = binde(b.miktar) + d.fark;
  if (yeni === 0n) { await sorgular.bakiyeSil(db, b.id); return b; }
  const ilk = d.fark > 0n && d.ilkGiris ? ilkGirisBirlesik(b.ilkGiris, d.ilkGiris) : b.ilkGiris;
  const adet = d.fark < 0n ? kalanAmbalajAdedi(b.ambalajAdet, b.miktar, bindenMetin(yeni))
    : b.ambalajAdet !== null && d.ambalaj?.adet ? b.ambalajAdet + d.ambalaj.adet : b.ambalajAdet;
  await sorgular.bakiyeGuncelle(db, b.id, bindenMetin(yeni), ilk, adet);
  // 2224-2 b: miktar değişince eldeki miktarın konuma gelişi de değişir (eklenen yeni geliş, düşülen en eski geliş).
  await sorgular.konumaGelisYenile(db, b.id);
  return b;
}
export const siraliKilitle = async (db: Db, ...a: { malzemeId: number; konumId: number | null; partiId: number | null; statuId?: number | null; kaliteDurumu?: KaliteDurumu }[]): Promise<void> => {
  await sorgular.bakiyeleriKilitle(db, a.flatMap((x) => (x.konumId === null ? []
    : [{ malzemeId: x.malzemeId, konumId: x.konumId, partiId: x.partiId, statuId: x.statuId ?? null, kaliteDurumu: x.kaliteDurumu ?? 'serbest' }])));
};
type BakiyeAnahtari = { malzemeId: number; konumId: number; partiId: number | null; statuId?: number | null; kaliteDurumu?: KaliteDurumu };
// 1059 a: seçim kilitsiz okunur. Kilitten sonra satırda istenenden az kaldıysa başka lota geçilmez, seçilen lot bu konumda eksiye düşer
// (sonraki giriş tamamlar); eksiye düşen miktar döner, hareket onaylı eksi işaretlenir.
export async function kilitliEksik(db: Db, a: BakiyeAnahtari, miktar: bigint): Promise<bigint> {
  const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId, a.statuId ?? null, a.kaliteDurumu ?? 'serbest');
  const olan = b === null ? 0n : binde(b.miktar);
  const eksik = miktar - (olan > 0n ? olan : 0n);
  return eksik > 0n ? eksik : 0n;
}
// Olan kadar taşınan yollar (fason) için: kilitsiz okunan satır kilit beklerken azaldıysa azalan kadar az alınır, satır eksiye inmez.
export async function kilitliOlan(db: Db, a: BakiyeAnahtari, okunan: string, secilen: bigint): Promise<bigint> {
  const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId, a.statuId ?? null, a.kaliteDurumu ?? 'serbest');
  const azalan = binde(okunan) - (b === null ? 0n : binde(b.miktar));
  const alinan = azalan > 0n ? secilen - azalan : secilen;
  return alinan > 0n ? alinan : 0n;
}
export const eksiUyarisi = (eksik: bigint): string => `Stok bu sırada başka kayıtla düştü; ${bindenMetin(eksik)} eksiye yazıldı, sonraki giriş tamamlar.`;
export const hareket = (h: Partial<HareketYeni> & Pick<HareketYeni, 'tur' | 'malzemeId' | 'miktar' | 'kisiId'>): HareketYeni => ({
  partiId: null, partiSecimi: null, kaynakKonumId: null, hedefKonumId: null, onayliEksi: false, girisKaynagi: null, cikisNedeni: null,
  uretimEmriId: null, geriAlinanId: null, aciklama: null, kaynakStatuId: null, hedefStatuId: null, kaynakKaliteDurumu: null, hedefKaliteDurumu: null, isEmriId: null, ...h,
});
// 142 a: emre yapılan teslim, emrin hedef istasyondaki bitmemiş ilk adımına bağlanır; istasyon dışı hedefte ya da adım yoksa yalnız emre.
async function teslimAdimi(db: Db, uretimEmriId: number | null, hedefKonumId: number): Promise<number | null> {
  if (uretimEmriId === null) return null;
  const istasyonId = await sorgular.konumIstasyonu(db, hedefKonumId);
  if (istasyonId === null) return null;
  const e = await adimliEmirAyrintisi(db, uretimEmriId).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
  return e?.isEmirleri.filter((i) => i.istasyon?.id === istasyonId && i.durum !== 'tamam').sort((a, b) => a.sira - b.sira)[0]?.id ?? null;
}
type TeslimYenisi = Omit<Parameters<typeof sorgular.teslimAc>[1], 'isEmriId'> & { isEmriId?: number | null };
export const teslimYaz = async (db: Db, t: TeslimYenisi): Promise<number | null> =>
  sorgular.teslimAc(db, { ...t, isEmriId: t.isEmriId !== undefined ? t.isEmriId : await teslimAdimi(db, t.uretimEmriId, t.hedefKonumId) });
