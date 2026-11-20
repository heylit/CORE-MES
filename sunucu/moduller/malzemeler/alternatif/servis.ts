import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  AlternatifBaglami, AlternatifKarti, AlternatifKuraliKaydetGovdesi, AlternatifTanimlariCevabi, AlternatifZarfi, KabulSiniriKaydetGovdesi,
  GrupSinirlariCevabi, KartAlternatifleriCevabi, KartZarfiCevabi, MuadilTuru,
} from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { SINIR_NITELIKLERI } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { KAPSAM_DOGRULAMA, sinirHatasi, uyanSinir, zarfaGirenler, zarfDegerlendir, zarfHesapla, type ZarfKarti } from './kurallar.ts';
import * as s from './sorgular.ts';

const KAPSAM_ADI = { aile: 'Aile', sinif: 'Sınıf', kalite: 'Kalite' } as const;

const KISITLAR = {
  malzeme_alternatif_kurali_kapsam_tek: { ileti: 'Bu kapsam için kural zaten var.', alan: 'kapsam' },
  malzeme_alternatif_kurali_kapali_gerekceli: { ileti: 'Alternatifi kapatırken gerekçe yazın.', alan: 'gerekce' },
  malzeme_alternatif_kurali_pay_butun: { ileti: 'Pay türü ve değeri birlikte girilir.', alan: 'payDeger' },
  malzeme_kalite_muadili_pkey: { ileti: 'Bu muadil zaten var.', alan: 'muadil' },
  malzeme_durum_muadili_pkey: { ileti: 'Bu muadil zaten var.', alan: 'muadil' },
  malzeme_kalite_muadili_kendisi: { ileti: 'Kalite kendisinin muadili olamaz.', alan: 'muadil' },
  malzeme_durum_muadili_kendisi: { ileti: 'Durum kendisinin muadili olamaz.', alan: 'muadil' },
  malzeme_kabul_siniri_tek: { ileti: 'Bu nitelik için sınır zaten var.', alan: 'nitelik' },
  malzeme_kabul_siniri_sira: { ileti: 'Alt sınır üst sınırdan büyük olamaz.', alan: 'alt' },
  malzeme_kabul_siniri_bicim: { ileti: 'Liste niteliğine değer, ölçüye alt ya da üst sınır girilir.', alan: 'nitelik' },
  malzeme_esdeger_bagi_pkey: { ileti: 'Kart başka bir eşdeğer grubunda; önce oradan çıkarın.', alan: 'esdegerNo' },
} as const;

export async function alternatifTanimlari(db: Db): Promise<AlternatifTanimlariCevabi> {
  const [kurallar, kaliteMuadilleri, durumMuadilleri] = [await s.kurallar(db), await s.kaliteMuadilleri(db), await s.durumMuadilleri(db)];
  const adlar = await kisiAdlari(db, [...new Set(kurallar.map((k) => k.guncelleyenKisiId))]);
  return {
    kurallar: kurallar.map(({ guncelleyenKisiId, ...k }) => ({ ...k, guncelleyen: adlar.get(guncelleyenKisiId) ?? null })),
    kaliteMuadilleri, durumMuadilleri,
  };
}

export async function alternatifKuraliKaydet(db: Db, k: Kullanici, g: AlternatifKuraliKaydetGovdesi): Promise<{ tamam: true }> {
  const hata = KAPSAM_DOGRULAMA.kapsamHatasi(g.kapsamTuru, g.kapsam);
  if (hata) throw dogrulama(hata, 'kapsam');
  const payHatasi = KAPSAM_DOGRULAMA.payHatasi(g.payTuru, g.payDeger, g.payEnAzMm);
  if (payHatasi) throw dogrulama(payHatasi, 'payDeger');
  if (g.kapali === true && g.gerekce === null) throw dogrulama('Alternatifi kapatırken gerekçe yazın.', 'gerekce');
  if (g.kapsamTuru === 'kart' && !(await s.zarfKarti(db, Number(g.kapsam)))) throw bulunamadi('Kart bulunamadı.');
  // Yalnız yeni kuralda: kart silinse de var olan kural düzenlenebilir kalır.
  if (g.kapsamTuru !== 'kart' && g.surum === undefined && !(await s.kapsamKatalogdaMi(db, g.kapsamTuru, g.kapsam))) {
    throw dogrulama(`${KAPSAM_ADI[g.kapsamTuru]} katalogdaki hiçbir kartta yok: ${g.kapsam}`, 'kapsam');
  }
  const yazim: s.KuralYazimi = {
    kapsamTuru: g.kapsamTuru, kapsam: g.kapsam, kaliteAcik: g.kaliteAcik, durumAcik: g.durumAcik, sartliAcik: g.sartliAcik,
    boyUzunKesilir: g.boyUzunKesilir, yuzeySerbest: g.yuzeySerbest, payTuru: g.payTuru, payDeger: g.payDeger, payEnAzMm: g.payEnAzMm,
    kapali: g.kapali, gerekce: g.gerekce,
  };
  await kisitKorumali(KISITLAR, async () => {
    if (g.surum === undefined) { await s.kuralEkle(db, yazim, k.id); return; }
    if ((await s.kuralGuncelle(db, yazim, g.surum, k.id)) !== null) return;
    if (await s.kuralVarMi(db, g.kapsamTuru, g.kapsam)) throw eskiSurum();
    throw bulunamadi('Kural bulunamadı.');
  });
  return { tamam: true };
}

export async function alternatifKuraliKaldir(db: Db, id: number, surum: number): Promise<{ tamam: true }> {
  if (await s.kuralSil(db, id, surum)) return { tamam: true };
  throw (await s.kuralGetir(db, id)) ? eskiSurum() : bulunamadi('Kural bulunamadı.');
}

export async function muadilKaydet(db: Db, k: Kullanici, t: 'kalite' | 'durum',
  g: { deger: string; muadil: string; tur: MuadilTuru; notu: string | null; surum?: number | undefined }): Promise<{ tamam: true }> {
  await kisitKorumali(KISITLAR, async () => {
    if (g.surum === undefined) { await s.muadilEkle(db, t, g.deger, g.muadil, g.tur, g.notu, k.id); return; }
    if (await s.muadilGuncelle(db, t, g.deger, g.muadil, g.tur, g.notu, g.surum, k.id)) return;
    throw (await s.muadilVarMi(db, t, g.deger, g.muadil)) ? eskiSurum() : bulunamadi('Muadil bulunamadı.');
  });
  return { tamam: true };
}

export async function muadilKaldir(db: Db, t: 'kalite' | 'durum', deger: string, muadil: string, surum: number): Promise<{ tamam: true }> {
  if (await s.muadilSil(db, t, deger, muadil, surum)) return { tamam: true };
  throw (await s.muadilVarMi(db, t, deger, muadil)) ? eskiSurum() : bulunamadi('Muadil bulunamadı.');
}

const sayiNesnesi = (o: Record<string, unknown> | null): Record<string, number> =>
  Object.fromEntries(Object.entries(o ?? {}).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] > 0));
const zarfKartina = (r: s.ZarfKartSatiri): ZarfKarti => ({
  no: r.no, aile: r.aile, sinif: r.sinif, kalite: r.kalite, durum: r.durum, yuzey: r.yuzey, form: r.form, olcu: sayiNesnesi(r.olcu),
});

async function zarfOku(db: Db, r: s.ZarfKartSatiri): Promise<AlternatifZarfi | null> {
  if (r.tur !== 'hammadde' || r.kalite === null) return null;
  return zarfHesapla(zarfKartina(r), await s.kurallar(db), await s.kaliteMuadilleri(db), await s.durumMuadilleri(db), await s.siniri(db));
}

export async function kartZarfi(db: Db, no: number): Promise<KartZarfiCevabi> {
  const r = await s.zarfKarti(db, no);
  if (!r) throw bulunamadi('Kart bulunamadı.');
  const zarf = await zarfOku(db, r);
  const kartlar = zarf === null || r.form === null ? [] : zarfaGirenler(zarf, zarfKartina(r), (await s.zarfAdaylari(db, r.form)).map((a) => ({ ...zarfKartina(a), kod: a.kod, ad: a.ad })));
  return {
    kart: { no: r.no, kod: r.kod, ad: r.ad, aile: r.aile, sinif: r.sinif },
    zarf,
    kartlar: kartlar.map((a) => ({ no: a.no, kod: a.kod, ad: a.ad, kalite: a.kalite, durum: a.durum, form: a.form, olcu: { ...a.olcu }, sonuc: a.sonuc, nedenler: a.nedenler })),
  };
}

// Başka modüller için (talep, satın alma, stok kontrol sonraki dilimlerde): kartın zarfı; hammadde dışı ya da olmayan kartta null.
export async function alternatifZarfiOku(db: Db, no: number): Promise<AlternatifZarfi | null> {
  const r = await s.zarfKarti(db, no);
  return r ? zarfOku(db, r) : null;
}

// Aday nitelikleri (kalite, durum, yüzey, form, ölçü) zarfa göre; kart yoksa ya da zarf hesaplanamıyorsa null.
export async function alternatifDegerlendir(db: Db, no: number, aday: Omit<ZarfKarti, 'no' | 'aile' | 'sinif'>) {
  const zarf = await alternatifZarfiOku(db, no);
  if (zarf === null) return null;
  return zarfDegerlendir(zarf, { ...aday, no: 0, aile: null, sinif: null });
}



// 3463: kartın yerine kabul edilen kartlar; eşdeğerler önce, sonra sınır içindekiler (aynı, içinde, şartlı). Bağlam koşullar için
// (3463-2); bugün kullanılmaz. Kart yoksa ya da sınır hesaplanamıyorsa boş liste. Yetki denetlemez.
export async function kartinAlternatifKartlari(db: Db, no: number, _baglam: AlternatifBaglami): Promise<AlternatifKarti[]> {
  const r = await s.zarfKarti(db, no);
  if (!r) return [];
  const esdeger = (await s.esdegerler(db, no)).map((e) => ({ ...e, tur: 'esdeger' as const, sonuc: 'ayni' as const, nedenler: ['Aynı malzeme'] }));
  const zarf = await zarfOku(db, r);
  if (zarf === null || r.form === null) return esdeger;
  const esdegerNo = new Set(esdeger.map((e) => e.no));
  const adaylar = (await s.zarfAdaylari(db, r.form)).filter((a) => !esdegerNo.has(a.no)).map((a) => ({ ...zarfKartina(a), kod: a.kod, ad: a.ad }));
  return [...esdeger, ...zarfaGirenler(zarf, zarfKartina(r), adaylar).flatMap((a) => (a.sonuc === 'disi' ? [] : [{
    no: a.no, kod: a.kod, ad: a.ad, tur: 'alternatif' as const, sonuc: a.sonuc, nedenler: a.nedenler,
  }]))];
}

// 3463: kartın Alternatifler bölümü: karta uyan sınırlar (her nitelik için en dar kapsam) ve eşdeğer kartlar.
export async function kartAlternatifleri(db: Db, no: number): Promise<KartAlternatifleriCevabi> {
  const r = await s.zarfKarti(db, no);
  if (!r) throw bulunamadi('Kart bulunamadı.');
  const tum = await s.siniri(db);
  const kart = zarfKartina(r);
  const uyan = SINIR_NITELIKLERI.flatMap((n) => { const x = uyanSinir(kart, tum, n); return x ? [x as s.SinirKaydi] : []; });
  return { siniri: uyan.map((x) => ({ ...x, degerler: x.degerler === null ? null : [...x.degerler] })), esdegerler: await s.esdegerler(db, no) };
}

export async function kabulSiniriKaydet(db: Db, k: Kullanici, g: KabulSiniriKaydetGovdesi): Promise<{ tamam: true }> {
  const kapsamHatasi = KAPSAM_DOGRULAMA.kapsamHatasi(g.kapsamTuru, g.kapsam);
  if (kapsamHatasi) throw dogrulama(kapsamHatasi, 'kapsam');
  const hata = sinirHatasi(g.nitelik, g.degerler, g.alt, g.ust);
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  if (g.kapsamTuru === 'kart' && !(await s.zarfKarti(db, Number(g.kapsam)))) throw bulunamadi('Kart bulunamadı.');
  if (g.kapsamTuru !== 'kart' && g.surum === undefined && !(await s.kapsamKatalogdaMi(db, g.kapsamTuru, g.kapsam))) {
    throw dogrulama(`${KAPSAM_ADI[g.kapsamTuru]} katalogdaki hiçbir kartta yok: ${g.kapsam}`, 'kapsam');
  }
  const yazim: s.SinirYazimi = { kapsamTuru: g.kapsamTuru, kapsam: g.kapsam, nitelik: g.nitelik, degerler: g.degerler, alt: g.alt, ust: g.ust };
  await kisitKorumali(KISITLAR, async () => {
    if (g.surum === undefined) { await s.sinirEkle(db, yazim, k.id); return; }
    if (await s.sinirGuncelle(db, yazim, g.surum, k.id)) return;
    throw (await s.sinirVarMi(db, g.kapsamTuru, g.kapsam, g.nitelik)) ? eskiSurum() : bulunamadi('Sınır bulunamadı.');
  });
  return { tamam: true };
}

export async function kabulSiniriKaldir(db: Db, id: number, surum: number): Promise<{ tamam: true }> {
  if (await s.sinirSil(db, id, surum)) return { tamam: true };
  throw (await s.sinirGetir(db, id)) ? eskiSurum() : bulunamadi('Sınır bulunamadı.');
}

const kartAnahtari = (x: { tur: string; form: string | null; anahtarlar: string[]; birim: string | null }) =>
  JSON.stringify([x.tur, x.form, x.anahtarlar, x.birim]);

// Eşdeğer bağ yalnız aynı tür, form, ölçü anahtarı ve stok biriminde kurulur (Risk K1): stok bu kartlar arasında birlikte sayılacak.
export async function esdegerBagla(db: Db, k: Kullanici, kartNo: number, esdegerNo: number): Promise<{ tamam: true }> {
  if (kartNo === esdegerNo) throw dogrulama('Kart kendisine eşdeğer bağlanamaz.', 'esdegerNo');
  const [a, b] = [await s.esdegerKarti(db, kartNo), await s.esdegerKarti(db, esdegerNo)];
  if (!a || !b) throw bulunamadi('Kart bulunamadı.');
  if (a.birim === null || kartAnahtari(a) !== kartAnahtari(b)) {
    throw dogrulama('Eşdeğer kart aynı tür, form, ölçü alanları ve stok biriminde olmalı.', 'esdegerNo');
  }
  await s.esdegerKilidi(db);
  const [ga, gb] = [await s.esdegerGrubu(db, kartNo, true), await s.esdegerGrubu(db, esdegerNo, true)];
  if (ga !== null && ga === gb) throw dogrulama('Kartlar zaten eşdeğer.', 'esdegerNo');
  if (gb !== null) throw dogrulama('Kart başka bir eşdeğer grubunda; önce oradan çıkarın.', 'esdegerNo');
  await kisitKorumali(KISITLAR, async () => {
    const grup = ga ?? kartNo;
    if (ga === null) await s.esdegerEkle(db, kartNo, grup, k.id);
    await s.esdegerEkle(db, esdegerNo, grup, k.id);
  });
  return { tamam: true };
}

export async function esdegerKaldir(db: Db, kartNo: number): Promise<{ tamam: true }> {
  await s.esdegerKilidi(db);
  const grup = await s.esdegerGrubu(db, kartNo, true);
  if (grup === null) throw bulunamadi('Kart bir eşdeğer grubunda değil.');
  await s.esdegerCikar(db, kartNo, grup);
  return { tamam: true };
}

// 3463-1b (Risk K1): stok ve plan, eşdeğer kartların stoğunu birlikte sayar. Yetki denetlemez.
export const esdegerGruplari = (db: Db, nolar: readonly number[]): Promise<Map<number, number[]>> => s.esdegerUyeleri(db, nolar);

// 3463-1b: grup şablonu (aile, sınıf, kalite kapsamındaki sınırlar), geniş kapsamdan dara.
export async function grupSinirlari(db: Db): Promise<GrupSinirlariCevabi> {
  return { siniri: (await s.siniri(db)).filter((x) => x.kapsamTuru !== 'kart').map((x) => ({ ...x, degerler: x.degerler === null ? null : [...x.degerler] })) };
}
