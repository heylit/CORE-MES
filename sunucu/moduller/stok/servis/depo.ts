import { type Db, kayitNoktasi } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  DepolarCevabi, Konum, KonumAyrintiCevabi, KonumlarListesi, Raf, RafAcKomutu, RafDuzenleKomutu, RafDuzenleCevabi, KonumDuzenleCevabi, RafMatrisiCevabi, RaflarListesi, YerlesimCevabi,
  YerlesimKaydetKomutu, HaritaEslemeCevabi, HaritaOzetiCevabi, TopluBolumDeposuCevabi, GozStoklariCevabi, GozOzetleriCevabi, KonumMalzemesi, KonumMalzemeleriListesi,
} from '#paylasilan/sozlesme/stok.ts';
import type { GozKalemi, GozKalemiKaydi, KayitCevabi, RafKaydi, RafKodlamaOnizlemeCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { AMBALAJ_TURLERI, type AmbalajTuru, type ElleKonumTuru, type RafKodGecisiListesiCevabi, type RafKodlamaDurumuCevabi, type ZeminCevabi, rafKodGecisiListesiCevabi } from '#paylasilan/sozlesme/stok.ts';
import {
  alanlar as haritaAlanlari, gozAdresi as haritaGozAdresi, harfOlmayanRafKodlari, rafKodlamasi, rafKodlamasiDegistir as haritaRafKodlamasiDegistir,
  rafYenidenNumarala as haritaRafYenidenNumarala, type RafKodlamasi, gozKaleminBolumu, gozKalemiSil as haritaGozKalemiSil, gozKalemiYaz as haritaGozKalemiYaz, gozler as haritaGozleri, rafYerlesimiKaydet,
  zemin as haritaZemini,
} from '../../atolye/disari.ts';
import { bolmeNo, rafGozleri, haritaPlani, haritaAlaniMi, depoKoduOner, deposuzBolumler, konumTurDegisimEngeli, koduDegisenler, karantinaEksigi, type KarantinaEksigi } from '../kurallar.ts';
import { aktifIstasyonlar } from '../../istasyonlar/disari.ts';
import { malzemeOzetleri } from '../../malzemeler/disari.ts';
import * as sorgular from '../sorgular.ts';
import { istasyonKonumunuSil } from '../sorgular/depo/sorgular.ts';
import { korumali, adlar, emirNoHaritasi, bakiyeSatiri } from './ortak.ts';

// ---- Depo ve konum -----------------------------------------------------------------------------------------------------
export async function depoListesi(db: Db): Promise<DepolarCevabi> { return { depolar: await sorgular.depolar(db) }; }

export function konumListesi(db: Db, s: KonumlarListesi): Promise<SayfaliListe<Konum>> {
  const suzgec = { tur: s.tur, rafId: s.rafId, metin: s.metin };
  return sayfaliListe(s, { say: () => sorgular.konumSay(db, suzgec), satirlar: (d) => sorgular.konumlar(db, suzgec, s, d) });
}
// Zemin ızgarası (kart #1304): konumun karesi bağlı olduğu öğenin (gözün rafı, alan, istasyon) karesidir; bölüm kodu ve kare
// adıyla yazılır ("DEPO1 C4"). Öğesi haritada olmayan konumun karesi yoktur, uydurulmaz.
export async function zeminDurumu(db: Db) {
  const z = await haritaZemini(db);
  const konumlar = await sorgular.zeminKonumlari(db);
  const gozRafi = new Map((await haritaGozleri(db)).map((g) => [g.id, g.rafId]));
  const kareler = new Map<string, { salonId: number; bolumKod: string; hucre: string }>();
  for (const b of z.bolumler) for (const n of b.nesneler) kareler.set(`${n.tur}:${n.id}`, { salonId: b.salonId, bolumKod: b.kod, hucre: n.hucre });
  const kare = (k: { gozId: number | null; alanId: number | null; istasyonId: number | null }) =>
    (k.gozId !== null ? kareler.get(`raf:${gozRafi.get(k.gozId)}`) : k.alanId !== null ? kareler.get(`alan:${k.alanId}`)
      : k.istasyonId !== null ? kareler.get(`istasyon:${k.istasyonId}`) : undefined) ?? null;
  const konumKaresi = new Map(konumlar.flatMap((k) => { const y = kare(k); return y ? [[k.id, y] as const] : []; }));
  return { z, konumlar, konumKaresi, zeminMetni: (konumId: number) => { const y = konumKaresi.get(konumId); return y ? `${y.bolumKod} ${y.hucre}` : null; } };
}

export async function zeminIzgarasi(db: Db): Promise<ZeminCevabi> {
  const { z, konumlar, konumKaresi } = await zeminDurumu(db);
  const depo = new Map((await sorgular.haritaDepolari(db)).flatMap((d) => (d.salonId !== null && d.aktif ? [[d.salonId, d.kod] as const] : [])));
  return {
    bolumler: z.bolumler.map((b) => ({
      ...b, depoKod: depo.get(b.salonId) ?? null,
      konumlar: konumlar.flatMap((k) => { const y = konumKaresi.get(k.id); return y && y.salonId === b.salonId ? [{ id: k.id, kod: k.kod, tur: k.tur, hucre: y.hucre, satirSayisi: k.satirSayisi }] : []; }),
    })),
    istasyonlar: z.istasyonlar,
  };
}

export async function konumAyrintisi(db: Db, id: number): Promise<KonumAyrintiCevabi> {
  const konum = await sorgular.konumBul(db, id);
  if (!konum) throw bulunamadi('Konum bulunamadı.');
  const b = await sorgular.konumBakiyeleri(db, id);
  const ad = await adlar(db, b.map((x) => x.malzemeId));
  const zemin = (await zeminDurumu(db)).zeminMetni(id);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return {
    konum, raf: konum.rafId === null ? null : await sorgular.konumunRafOlcusu(db, id), bakiyeler: b.map((x) => ({ ...bakiyeSatiri(x, ad, nolar), zemin })), zemin,
    haritaYeri: konum.haritaGozId !== null ? (await haritaGozAdresi(db, konum.haritaGozId))?.adres ?? null
      : konum.haritaAlanId !== null ? (await haritaAlanlari(db)).find((a) => a.id === konum.haritaAlanId)?.ad ?? null : null,
  };
}
export async function konumMalzemeleri(db: Db, s: KonumMalzemeleriListesi): Promise<SayfaliListe<KonumMalzemesi>> {
  const suzgec = { tur: s.tur, metin: s.metin, malzemeId: s.malzemeId };
  return sayfaliListe(s, {
    say: () => sorgular.konumMalzemesiSay(db, suzgec),
    satirlar: async (d) => {
      const b = await sorgular.konumMalzemeleri(db, suzgec, s, d);
      const ad = await adlar(db, b.map((x) => x.malzemeId));
      const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
      return b.map((x) => ({ ...bakiyeSatiri(x, ad, nolar), konumTur: x.konumTur as KonumMalzemesi['konumTur'], konumAd: x.konumAd }));
    },
  });
}
export async function konumAc(db: Db, g: { tur: ElleKonumTuru; kod: string; ad?: string | null | undefined; depoId?: number | undefined }): Promise<{ konum: Konum }> {
  const depoId = g.depoId ?? (await sorgular.depoKimligi(db, 'ANA'));
  if (depoId === null || !(await sorgular.depoVarMi(db, depoId))) throw dogrulama('Depo bulunamadı.', 'depoId');
  const id = await korumali(() => sorgular.konumAc(db, { depoId, kod: g.kod, tur: g.tur, ad: g.ad ?? null }));
  return { konum: (await sorgular.konumBul(db, id))! };
}
export async function konumDuzenle(db: Db, id: number, g: { surum: number; kod: string; ad?: string | null | undefined; tur?: ElleKonumTuru | undefined }): Promise<KonumDuzenleCevabi> {
  const k = await sorgular.konumBul(db, id);
  if (k && k.tur === 'raf_gozu' && k.kod !== g.kod) throw dogrulama('Raf gözünün kodu raftan gelir; rafı düzenleyin.', 'kod');
  if (k && ['KABUL', 'URETIM'].includes(k.kod) && k.kod !== g.kod) throw dogrulama('Sabit konumun kodu değişmez.', 'kod');
  const turEngeli = k && g.tur !== undefined ? konumTurDegisimEngeli(k, g.tur) : null;
  if (turEngeli !== null) throw dogrulama(turEngeli, 'tur');
  await korumali(() => surumluGuncelle({ guncelle: () => sorgular.konumGuncelle(db, id, g.surum, { kod: g.kod, ad: g.ad ?? null, tur: g.tur ?? null }), varMi: () => sorgular.konumVarMi(db, id), bulunamadiIletisi: 'Konum bulunamadı.' }));
  return { konum: (await sorgular.konumBul(db, id))!, koduDegisenler: koduDegisenler(k ? [k] : [], await sorgular.kodDurumlari(db, { idler: [id] })) };
}
export async function konumPasif(db: Db, id: number, surum: number): Promise<{ konum: Konum }> {
  const k = await sorgular.konumBul(db, id);
  if (k && ['KABUL', 'URETIM'].includes(k.kod)) throw gecersiz('Sabit konum pasife alınamaz.');
  if (k && k.tur === 'raf_gozu') throw gecersiz('Raf gözü raftan kapatılır; rafı düzenleyin.');
  await korumali(() => surumluGuncelle({ guncelle: () => sorgular.konumPasifYap(db, id, surum), varMi: () => sorgular.konumVarMi(db, id), bulunamadiIletisi: 'Konum bulunamadı.' }));
  return { konum: (await sorgular.konumBul(db, id))! };
}

// Fabrika Haritası raf, göz ve alanın tek kaynağıdır (#686); eşleme depo seçilmiş bölümün yeni yerini stok konumu yapar (#711).
async function haritaDurumu(db: Db, kodlama?: RafKodlamasi) {
  const gozler = await haritaGozleri(db, null, kodlama), alanlar = await haritaAlanlari(db), depolar = await sorgular.haritaDepolari(db);
  const plan = haritaPlani({ gozler, alanlar, depolar, konumlar: await sorgular.haritaKonumlari(db), kodlar: new Set(await sorgular.tumKonumKodlari(db)) });
  return { gozler, alanlar, depolar, plan };
}
// 2902 (madde 5, karar 2903 a): aktif istasyonun stok konumu (IST-<no>, ANA depoda, adı istasyonun adı) ilk teslimi beklemez; istasyon
// açılınca ve eşlemede açılır, açan kişinin stok yetkisine bakılmaz (konum sabit kodludur, kişi bir şey seçmez). Kodu elle başka
// konuma verilmişse açılmaz; istasyon ilk teslimde yine aynı kuralla dener.
async function istasyonKonumuAc(db: Db, ist: { id: number; ad: string }, kodlar: Set<string>): Promise<boolean> {
  const kod = `IST-${ist.id}`;
  if (kodlar.has(kod)) return false;
  kodlar.add(kod);
  return (await sorgular.istasyonKonumuAc(db, { depoId: await anaDepo(db), kod, ad: ist.ad.slice(0, 60), istasyonId: ist.id })) !== null;
}
export async function istasyonAcildiYansit(db: Db, olay: { istasyonId: number; ad: string; aktif: boolean }): Promise<void> {
  if (!olay.aktif || (await sorgular.istasyonKonumu(db, olay.istasyonId)) !== null) return;
  await istasyonKonumuAc(db, { id: olay.istasyonId, ad: olay.ad }, new Set(await sorgular.tumKonumKodlari(db)));
}
// Silinecek istasyonun konumu hiç kullanılmadıysa (hareket, bakiye, teslim yok) kalkar; kullanıldıysa bağımlı kayıt silmeyi durdurur ve
// konum kalır, istasyon silinmez ("kullanımda").
export async function istasyonSilinecekYansit(db: Db, olay: { istasyonId: number }): Promise<void> {
  await kayitNoktasi(db, () => istasyonKonumunuSil(db, olay.istasyonId));
}
async function eksikIstasyonKonumlariniAc(db: Db): Promise<void> {
  const istasyonlar = await aktifIstasyonlar(db);
  if (istasyonlar.length === 0) return;
  const olan = new Set((await sorgular.istasyonKonumlari(db, istasyonlar.map((i) => i.id))).map((k) => k.istasyonId));
  const eksik = istasyonlar.filter((i) => !olan.has(i.id));
  if (eksik.length === 0) return;
  const kodlar = new Set(await sorgular.tumKonumKodlari(db));
  for (const i of eksik) await istasyonKonumuAc(db, i, kodlar);
}

export async function haritadanEsle(db: Db): Promise<HaritaEslemeCevabi> {
  await eksikIstasyonKonumlariniAc(db);
  const { plan } = await haritaDurumu(db);
  const idler = plan.guncelle.map((k) => k.id);
  const onceki = idler.length === 0 ? [] : await sorgular.kodDurumlari(db, { idler });
  if (plan.guncelle.length > 0) await sorgular.konumKodTekliginiErtele(db);
  for (const k of plan.ekle) await korumali(() => sorgular.haritaKonumuAc(db, k));
  for (const k of plan.guncelle) await korumali(() => sorgular.haritaKonumuGuncelle(db, k));
  for (const k of plan.turDegisimi) await sorgular.haritaKonumuTuru(db, k);
  const kapatilan = plan.kapat.length === 0 ? 0 : (await sorgular.haritaKonumlariniKapat(db, plan.kapat)).length;
  const e: HaritaEslemeCevabi = {
    eklenen: plan.ekle.length, guncellenen: plan.guncelle.length + plan.turDegisimi.length, kapatilan, atlanan: plan.atlanan,
    koduDegisenler: idler.length === 0 ? [] : koduDegisenler(onceki, await sorgular.kodDurumlari(db, { idler })),
  };
  // 3177 b: bu sürümden sonraki ilk eşleme (açılış işi ya da ondan önce gelen bir harita kaydı) kod değişimlerini bir kez saklar.
  if (!(await sorgular.rafKodGecisiVarMi(db))) {
    const kodlama = await rafKodlamasi(db);
    await sorgular.rafKodGecisiYaz(db, { kodlama, degisenler: e.koduDegisenler, eskiKodluRaflar: kodlama === 'duz-sayi' ? await harfOlmayanRafKodlari(db) : [], atlanan: plan.koduGecemeyen, pasifStoklu: plan.pasifStoklu });
  }
  return e;
}

// 3177 b: güncellemeden sonra stok konumları sıra numaralı koda kendiliğinden geçer. Açılıştan sonraki ilk turda eşleme bir kez
// koşar (tek transaction; kodlar zincir ve takasla değişir); kayıt yazıldıktan sonra iş bir şey yapmaz. Kilit ve tek satır ikinci
// sunucunun ikinci kez geçirmesini önler.
export async function rafKodGecisiIsi(db: Db): Promise<void> {
  if (await sorgular.rafKodGecisiVarMi(db)) return;
  await haritadanEsle(db);
}

// 2884: aktif karantina konumu bulunamayınca nedeni (mal kabul iletisi için); yeni sorgu yok, eşlemenin okuduklarıyla.
export async function karantinaEksigiNedeni(db: Db): Promise<KarantinaEksigi> {
  return karantinaEksigi({ alanlar: await haritaAlanlari(db), depolar: await sorgular.haritaDepolari(db), konumlar: await sorgular.haritaKonumlari(db) });
}

export async function haritaOzeti(db: Db): Promise<HaritaOzetiCevabi> {
  const { gozler, alanlar, depolar, plan } = await haritaDurumu(db);
  const bolumler = new Map<number, { salonId: number; kod: string; gozSayisi: number }>();
  for (const z of gozler) {
    const b = bolumler.get(z.salonId) ?? { salonId: z.salonId, kod: z.salonKodu, gozSayisi: 0 };
    b.gozSayisi += 1;
    bolumler.set(z.salonId, b);
  }
  for (const a of alanlar) if (haritaAlaniMi(a.tur) && !bolumler.has(a.salonId)) bolumler.set(a.salonId, { salonId: a.salonId, kod: `Bölüm ${a.salonId}`, gozSayisi: 0 });
  const depo = new Map(depolar.flatMap((d) => (d.salonId !== null && d.aktif ? [[d.salonId, d.kod] as const] : [])));
  return {
    ...(await sorgular.haritaBagSayilari(db)), eslenmemis: plan.ekle.length + plan.atlanan.length,
    // Elle depodan çıkarılmış bölüm sayılmaz: bilerek kapatılmıştır ve toplu komut onu açmaz.
    deposuzYer: deposuzBolumler({ gozler, alanlar, depolar }).filter((b) => b.depoId === null).reduce((t, b) => t + b.yer, 0), bagsizKonumlar: await sorgular.haritasizKonumlar(db),
    bolumler: [...bolumler.values()].sort((x, y) => x.kod.localeCompare(y.kod, 'tr')).map((b) => ({ ...b, depoKod: depo.get(b.salonId) ?? null })),
  };
}

export async function gozStoklari(db: Db, gozIdler: number[]): Promise<GozStoklariCevabi> {
  const satirlar = await sorgular.gozStoklari(db, gozIdler);
  const ad = await adlar(db, satirlar.flatMap((s) => (s.ilkMalzemeId === null ? [] : [s.ilkMalzemeId])));
  return { gozler: satirlar.map(({ ilkMalzemeId, ...s }) => ({ ...s, ilkMalzemeAd: ilkMalzemeId === null ? null : ad.get(ilkMalzemeId) ?? null })) };
}

// Bölümü stok deposu yapar (varsa pasif depoyu açar, yoksa bölüm kodundan açar) ya da depodan çıkarır. Çıkarmada bölümde stok ya da
// sabit konum (KABUL, URETIM) varsa reddedilir; boş konumlar kapanır. Ardından eşleme koşar.
// DEP-61 (kart #1304): Stok Merkezi'nden raf ve göz kalemi yalnız stok deposu yapılmış (etkin) bölümde yazılır; öbür bölümler
// ve makineler Fabrika Haritası'nın düzenleme yetkisini ister. Raf kaydında bölümün öbür öğeleri kayıtlı haliyle kalır.
const DEPO_DEGIL = 'Bu bölüm stok deposu değil; rafını Fabrika Haritası yetkisi olan kişi düzenler.';
async function depoBolumuOlmali(db: Db, salonId: number | null): Promise<void> {
  if (salonId === null) throw bulunamadi('Göz bulunamadı.');
  if (!(await sorgular.haritaDepolari(db)).some((d) => d.aktif && d.salonId === salonId)) throw yetkiYok(DEPO_DEGIL);
}
export async function depoRaflariKaydet(db: Db, salonId: number, g: { surum: number; raflar: RafKaydi[] }, kisiId: number): Promise<KayitCevabi> {
  await depoBolumuOlmali(db, salonId);
  return rafYerlesimiKaydet(db, salonId, g, kisiId);
}
export async function depoGozKalemiYaz(db: Db, g: GozKalemiKaydi, kisiId: number): Promise<GozKalemi> {
  await depoBolumuOlmali(db, (await haritaGozAdresi(db, g.gozId))?.salonId ?? null);
  return haritaGozKalemiYaz(db, g, kisiId);
}
export async function depoGozKalemiSil(db: Db, id: number): Promise<void> {
  const salonId = await gozKaleminBolumu(db, id);
  if (salonId === null) throw bulunamadi('Göz kalemi bulunamadı.');
  await depoBolumuOlmali(db, salonId);
  await haritaGozKalemiSil(db, id);
}

export async function bolumDeposu(db: Db, salonId: number, depoOlsun: boolean): Promise<HaritaOzetiCevabi> {
  const { gozler, alanlar, depolar } = await haritaDurumu(db);
  const salonKodu = gozler.find((z) => z.salonId === salonId)?.salonKodu ?? (alanlar.some((a) => a.salonId === salonId) ? `BOLUM${salonId}` : null);
  if (salonKodu === null) throw bulunamadi('Bölüm Fabrika Haritası\'nda bulunamadı ya da rafı yok.');
  const mevcut = depolar.find((d) => d.salonId === salonId) ?? null;
  if (depoOlsun) {
    if (mevcut) await sorgular.depoAktifligi(db, mevcut.id, true);
    else await korumali(() => sorgular.haritaDeposuAc(db, { salonId, kod: depoKoduOner(salonKodu, new Set(depolar.map((d) => d.kod))), ad: salonKodu }));
  } else if (mevcut?.aktif) {
    const dolu = await sorgular.depoDoluMu(db, mevcut.id);
    if (dolu.sabit > 0) throw gecersiz('Bu bölümde mal kabul ve üretim çıkışı konumları var; ana depo depodan çıkarılamaz.');
    if (dolu.bakiye > 0) throw cakisma(`Bölümde ${dolu.bakiye} stok satırı var; önce taşıyın.`);
    await sorgular.depoKonumlariniKapat(db, mevcut.id);
    await sorgular.depoAktifligi(db, mevcut.id, false);
  }
  await haritadanEsle(db);
  return haritaOzeti(db);
}

// 2902: depo kaydı hiç olmayan bütün bölümler depo olur, sonra eşleme koşar. Elle depodan çıkarılmış bölüm (pasif depo) bilerek
// kapatılmıştır; açılmaz, cevapta ayrı listelenir. Uç tek transaction'dır: bir bölümde kod çakışması ya da eşleme hatası olursa hiçbir
// depo ve konum yazılmaz.
export async function topluBolumDeposu(db: Db): Promise<TopluBolumDeposuCevabi> {
  const { gozler, alanlar, depolar } = await haritaDurumu(db);
  const kodlar = new Set(depolar.map((d) => d.kod));
  const depoKodu = new Map(depolar.map((d) => [d.id, d.kod]));
  const hepsi = deposuzBolumler({ gozler, alanlar, depolar });
  const bolumler = hepsi.filter((b) => b.depoId === null);
  const atlananPasifDepolar = hepsi.flatMap((b) => (b.depoId === null ? [] : [depoKodu.get(b.depoId) ?? b.kod]));
  for (const b of bolumler) {
    const kod = depoKoduOner(b.kod, kodlar);
    kodlar.add(kod);
    await korumali(() => sorgular.haritaDeposuAc(db, { salonId: b.salonId, kod, ad: b.kod }));
  }
  const e = await haritadanEsle(db);
  return { acilanDepo: bolumler.length, eklenen: e.eklenen, atlanan: e.atlanan, koduDegisenler: e.koduDegisenler, ozet: await haritaOzeti(db), atlananPasifDepolar };
}

// 2902 (madde 1): her bölüm varsayılan olarak stok deposudur. Yeni bölüm, açan kişide depo haritası eylemi (stok.harita-yaz) varsa deposuyla açılır; yoksa
// depo "Bütün bölümleri depo yap" ya da tek tek "Depo yap" ile açılır. Yeni bölümün gözü ve alanı yoktur, eşleme gerekmez.
export async function bolumAcildiYansit(db: Db, olay: { salonId: number; kod: string; islemler: readonly string[] }): Promise<void> {
  if (!olay.islemler.includes('stok.harita-yaz')) return;
  const depolar = await sorgular.haritaDepolari(db);
  if (depolar.some((d) => d.salonId === olay.salonId)) return;
  await korumali(() => sorgular.haritaDeposuAc(db, { salonId: olay.salonId, kod: depoKoduOner(olay.kod, new Set(depolar.map((d) => d.kod))), ad: olay.kod }));
}

// ---- Raf -------------------------------------------------------------------------------------------------------------------
export function rafListesi(db: Db, s: RaflarListesi): Promise<SayfaliListe<Raf>> {
  const suzgec = { tur: s.tur, metin: s.metin };
  return sayfaliListe(s, { say: () => sorgular.rafSay(db, suzgec), satirlar: (d) => sorgular.raflar(db, suzgec, s, d) });
}
export async function rafMatrisi(db: Db, id: number): Promise<RafMatrisiCevabi> {
  const raf = await sorgular.rafBul(db, id);
  if (!raf) throw bulunamadi('Raf bulunamadı.');
  const gozler = await sorgular.rafinGozleri(db, id);
  const ad = await adlar(db, gozler.flatMap((g) => (g.ilkMalzemeId === null ? [] : [g.ilkMalzemeId])));
  return { raf, gozler: gozler.map(({ ilkMalzemeId, ...g }) => ({ ...g, ilkMalzemeAd: ilkMalzemeId === null ? null : ad.get(ilkMalzemeId) ?? null })) };
}
type RafGirdisi = Omit<RafAcKomutu, 'depoId'>;
async function gozleriKur(db: Db, rafId: number, depoId: number, r: RafGirdisi): Promise<void> {
  const gozler = rafGozleri({ kod: r.kod, numaralama: r.numaralama, ilkBolme: r.ilkBolme, bolmeSayisi: r.bolmeSayisi, katSayisi: r.katSayisi });
  await korumali(async () => {
    await sorgular.kodDenetiminiErtele(db);
    await sorgular.gozKodlariniYenile(db, rafId, r.kod);
    await sorgular.fazlaGozleriKapat(db, rafId, gozler);
    await sorgular.gozleriYaz(db, rafId, depoId, gozler);
    await sorgular.kodDenetiminiAc(db);
  });
}
export async function rafAc(db: Db, g: RafAcKomutu): Promise<{ raf: Raf }> {
  const depoId = g.depoId ?? (await sorgular.depoKimligi(db, 'ANA'));
  if (depoId === null || !(await sorgular.depoVarMi(db, depoId))) throw dogrulama('Depo bulunamadı.', 'depoId');
  const id = await korumali(() => sorgular.rafAc(db, { ...g, depoId }));
  await gozleriKur(db, id, depoId, g);
  return { raf: (await sorgular.rafBul(db, id))! };
}
const bolmeleri = (r: { numaralama: 'sirali' | 'tek' | 'cift'; ilkBolme: number; bolmeSayisi: number }): number[] =>
  Array.from({ length: r.bolmeSayisi }, (_, k) => bolmeNo(r.numaralama, r.ilkBolme, k));
export async function rafDuzenle(db: Db, id: number, g: RafDuzenleKomutu): Promise<RafDuzenleCevabi> {
  const { surum, ...alanlar } = g;
  const eski = await sorgular.rafBul(db, id, true);
  const onceki = await sorgular.kodDurumlari(db, { rafId: id });
  if (eski) await korumali(() => sorgular.gozleriYenidenNumarala(db, id, bolmeleri(eski), bolmeleri(alanlar)));
  await korumali(() => surumluGuncelle({ guncelle: () => sorgular.rafGuncelle(db, id, surum, alanlar), varMi: () => sorgular.rafVarMi(db, id), bulunamadiIletisi: 'Raf bulunamadı.' }));
  const raf = (await sorgular.rafBul(db, id))!;
  await gozleriKur(db, id, raf.depoId, alanlar);
  return { raf: (await sorgular.rafBul(db, id))!, koduDegisenler: koduDegisenler(onceki, await sorgular.kodDurumlari(db, { rafId: id })) };
}
export async function rafPasif(db: Db, id: number, surum: number): Promise<{ raf: Raf }> {
  await korumali(async () => {
    await surumluGuncelle({ guncelle: () => sorgular.rafPasifYap(db, id, surum), varMi: () => sorgular.rafVarMi(db, id), bulunamadiIletisi: 'Raf bulunamadı.' });
    await sorgular.rafGozleriniKapat(db, id);
  });
  return { raf: (await sorgular.rafBul(db, id))! };
}

// ---- Depo yerleşimi (2B düzenleyici) ---------------------------------------------------------------------------------------
export const say = (m: string): number => Number(m);
export async function anaDepo(db: Db): Promise<number> {
  const id = await sorgular.depoKimligi(db, 'ANA');
  if (id === null) throw new Error('Ana depo yok');
  return id;
}
export async function yerlesimOku(db: Db): Promise<YerlesimCevabi> {
  const depoId = await anaDepo(db);
  const y = (await sorgular.yerlesim(db, depoId))!;
  const raflar = await sorgular.yerlesimRaflari(db, depoId);
  return {
    depo: (await sorgular.depoBul(db, depoId))!,
    yerlesim: {
      bina: { x0: say(y.bina_x0), x1: say(y.bina_x1), z0: say(y.bina_z0), z1: say(y.bina_z1) },
      kabul: { x: say(y.kabul_x), z: say(y.kabul_z), genislik: say(y.kabul_genislik), derinlik: say(y.kabul_derinlik) },
      kareBoyu: say(y.kare_boyu), sayimSuresiGun: y.sayim_suresi_gun, fason: { x: say(y.fason_x), z: say(y.fason_z), aci: y.fason_aci }, surum: y.surum,
    },
    raflar: raflar.map((r) => ({ ...r, bolmeGenislikM: say(r.bolmeGenislikM), derinlikM: say(r.derinlikM), katAraligiM: say(r.katAraligiM), xM: say(r.xM), zM: say(r.zM) })),
  };
}
const metin2 = (n: number): string => n.toFixed(2);
// Tek işlemde kaydeder: önce kaldırılanlar (stoklu göz kaldırılamaz), sonra değişenler (sürümlü), sonra yeniler.
// Göz adresi tekil kalmalı: iki raf aynı adresi üretirse `stok_konum_kod_tek` 409 döner.
export async function yerlesimKaydet(db: Db, g: YerlesimKaydetKomutu): Promise<YerlesimCevabi> {
  const depoId = await anaDepo(db);
  await korumali(async () => {
    await surumluGuncelle({ guncelle: () => sorgular.yerlesimGuncelle(db, depoId, g.surum, g), varMi: () => sorgular.yerlesimVarMi(db, depoId), bulunamadiIletisi: 'Yerleşim bulunamadı.' });
    await sorgular.depoAdiYaz(db, depoId, g.depoAdi);
    for (const x of g.silinenler) {
      await surumluGuncelle({ guncelle: () => sorgular.rafPasifYap(db, x.id, x.surum), varMi: () => sorgular.rafVarMi(db, x.id), bulunamadiIletisi: 'Raf bulunamadı.' });
      await sorgular.rafGozleriniKapat(db, x.id);
    }
    for (const r of g.raflar) {
      const alanlar = { kod: r.kod, tur: r.tur, numaralama: r.numaralama, ilkBolme: r.ilkBolme, bolmeSayisi: r.bolmeSayisi, katSayisi: r.tur === 'zemin' ? 1 : r.katSayisi,
        bolmeGenislikM: metin2(r.bolmeGenislikM), derinlikM: metin2(r.derinlikM), katAraligiM: metin2(r.katAraligiM) };
      let id: number;
      if (r.id !== null) {
        const eski = await sorgular.rafBul(db, r.id, true);
        if (!eski) throw bulunamadi(`Raf ${r.kod} bulunamadı.`);
        await sorgular.gozleriYenidenNumarala(db, r.id, bolmeleri(eski), bolmeleri(alanlar));
        const rid = r.id, rs = r.surum ?? 0;
        await surumluGuncelle({ guncelle: () => sorgular.rafGuncelle(db, rid, rs, alanlar), varMi: () => sorgular.rafVarMi(db, rid), bulunamadiIletisi: 'Raf bulunamadı.' });
        id = r.id;
      } else id = await sorgular.rafAc(db, { ...alanlar, depoId });
      await sorgular.rafYeriYaz(db, id, r);
      await gozleriKur(db, id, depoId, alanlar);
    }
  });
  return yerlesimOku(db);
}

const AMBALAJ_TURU = new Set<string>(AMBALAJ_TURLERI);
// 3202 B: raf sahnesi göz başına malzemeleri (miktarı büyükten küçüğe) ve birimi okur; ad ve birim tek sorguda toplu alınır.
export async function gozOzetleri(db: Db, gozIdler: number[]): Promise<GozOzetleriCevabi> {
  const satirlar = await sorgular.gozMalzemeleri(db, gozIdler);
  const idler = satirlar.map((s) => s.malzemeId);
  const ad = await adlar(db, idler);
  const ozet = await malzemeOzetleri(db, idler);
  const gozler = new Map<number, GozOzetleriCevabi['gozler'][number]>();
  for (const s of satirlar) {
    const g = gozler.get(s.gozId) ?? { gozId: s.gozId, konumId: s.konumId, malzemeler: [] };
    g.malzemeler.push({
      malzemeId: s.malzemeId, ad: ad.get(s.malzemeId) ?? null, birim: ozet.get(s.malzemeId)?.birim ?? null, miktar: s.miktar,
      ambalaj: AMBALAJ_TURU.has(s.ambalaj ?? '') ? (s.ambalaj as AmbalajTuru) : null,
    });
    gozler.set(s.gozId, g);
  }
  return { gozler: [...gozler.values()] };
}

// ---- 3168: raf kodlama (Stok > Ayarlar) ve rafın yeniden numaralanması --------------------------------------------------
export async function rafKodlamaOku(db: Db): Promise<RafKodlamaDurumuCevabi> {
  const g = await sorgular.rafKodGecisi(db);
  return { kodlama: await rafKodlamasi(db), gecis: g === null ? null : { ...g, zaman: g.zaman.toISOString() } };
}

export async function rafKodGecisiListesi(db: Db): Promise<RafKodGecisiListesiCevabi> {
  return rafKodGecisiListesiCevabi.parse({ degisenler: await sorgular.rafKodGecisiDegisenleri(db) });
}

// Etiketler basıldı: uyarı kalkar, liste kalır (denetim için).
export async function rafKodGecisiBasildi(db: Db, kisiId: number): Promise<RafKodlamaDurumuCevabi> {
  await sorgular.rafKodGecisiBasildi(db, kisiId);
  return rafKodlamaOku(db);
}

// Kuru deneme (3171 R3): kodlama değişse kaç konumun kodu değişir, kaçında stok var, bir örnek; yalnız harf olmayan raf kodu
// varsa sıra numaralı kodlamaya geçilmez. Hiçbir şey yazılmaz.
export async function rafKodlamaOnizleme(db: Db, kodlama: RafKodlamasi): Promise<RafKodlamaOnizlemeCevabi> {
  const { gozler, plan } = await haritaDurumu(db, kodlama);
  const raflar = new Set(gozler.map((g) => g.rafId));
  const konumlar = new Map((await sorgular.haritaKonumlari(db)).map((k) => [k.id, k]));
  const degisen = plan.guncelle.flatMap((d) => { const k = konumlar.get(d.id); return k && k.kod !== d.kod ? [{ eski: k.kod, yeni: d.kod, stoklu: k.satirSayisi > 0 }] : []; });
  return {
    kodlama, rafSayisi: raflar.size, gozSayisi: gozler.length, degisenKonum: degisen.length, stokluKonum: degisen.filter((d) => d.stoklu).length,
    ornek: degisen[0] ? { eski: degisen[0].eski, yeni: degisen[0].yeni } : null,
    engelliRaflar: kodlama === 'duz-sayi' ? await harfOlmayanRafKodlari(db) : [],
  };
}

// Kodlama değişir ve konum kodları aynı kayıtta eşlenir (3171 R1, R6): ya hepsi ya hiçbiri. Değişen kodlar cevapta döner (etiket
// penceresi) ve denetim kaydına eklenir (özet ve ilk satırlar).
export async function rafKodlamaDegistir(
  db: Db, govde: { kodlama: RafKodlamasi; beklenen: RafKodlamasi }, kisiId: number, denetimEki: (satirlar: readonly Record<string, string | number | boolean | null>[]) => void,
): Promise<HaritaEslemeCevabi> {
  const eski = await rafKodlamasi(db);
  await haritaRafKodlamasiDegistir(db, govde.kodlama, govde.beklenen, kisiId, { yol: '/stok/raf-kodlama/degistir', yetki: 'stok.raf-yaz' });
  const e = await haritadanEsle(db);
  denetimEki(kodDegisimDenetimi({ islem: 'raf-kodlama', eski, yeni: govde.kodlama }, e));
  return e;
}

// Rafın sıra numaraları bugünkü düzenle yeniden verilir ve konum kodları aynı kayıtta eşlenir. Yalnız sıra numaralı kodlamada.
export async function rafYenidenNumarala(
  db: Db, rafId: number, denetimEki: (satirlar: readonly Record<string, string | number | boolean | null>[]) => void,
): Promise<HaritaEslemeCevabi> {
  if (await rafKodlamasi(db) !== 'duz-sayi') throw gecersiz('Yeniden numaralama yalnız sıra numaralı raf kodlamasında yapılır.');
  const r = await haritaRafYenidenNumarala(db, rafId);
  const e = await haritadanEsle(db);
  denetimEki(kodDegisimDenetimi({ islem: 'yeniden-numarala', raf: r.rafKodu, degisenGoz: r.degisen }, e));
  return e;
}

// Denetim eki satır sınırı 100: ilk satır özet, sonra en çok 99 kod değişimi (eski, yeni). Liste uzunsa özet bunu söyler.
const DENETIM_KOD_SATIRI = 99;
function kodDegisimDenetimi(ozet: Record<string, string | number>, e: HaritaEslemeCevabi): Record<string, string | number | boolean | null>[] {
  return [
    { ...ozet, degisenKonum: e.koduDegisenler.length, stokluKonum: e.koduDegisenler.filter((d) => d.satirSayisi > 0).length, listeTam: e.koduDegisenler.length <= DENETIM_KOD_SATIRI },
    ...e.koduDegisenler.slice(0, DENETIM_KOD_SATIRI).map((d) => ({ konumId: d.konumId, eskiKod: d.eskiKod, yeniKod: d.yeniKod })),
  ];
}
