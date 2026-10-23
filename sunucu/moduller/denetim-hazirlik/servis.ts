import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { AZAMI_EK_BAYT } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import type { BelgeCevabi, BenCevabi, EkCevabi, EkIcerikCevabi, Filtre, KilitCevabi, OdaCevabi, OlcuAletleriCevabi, Sira, SorguCevabi, YazGovdesi } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { aletlerVeKayitlari } from '../kalibrasyon/disari.ts';
import { kisileriListele } from '../kisiler/disari.ts';
import {
  OLCU_ALETI_KAYIT_ADEDI, olcuAletleriKaydi,
  KURULUM_ISARETI, baslangicBelgeleri, canliEsler, degistirebilirMi, derinBirlestir, durumYamala, erisebilirMi, izinliBelgeMi, izinliKoleksiyonMu, kilitAlinirMi, sonParca, sorgula, ustYolu,
  yonetimGerekirMi,
} from './kurallar.ts';
import type { OdaKaydi, Veri } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { KilitliBelge } from './sorgular.ts';

// Akış: yetkiyi uç verir; burada kişiye özel alan, sürüm denetimi ve birleştirme uygulanır.

const ISLEM_YAZ = 'denetim-hazirlik.yaz';
const ISLEM_YONET = 'denetim-hazirlik.yonet';

function erisimDenetle(kullanici: Kullanici, yol: string): void {
  if (!erisebilirMi(yol, kullanici.id)) throw yetkiYok('Bu kayıt başka bir kişiye özeldir.');
}

const DEPO_DISI = 'Bu uç yalnız denetim hazırlığı kaydına açıktır.';
function belgeDenetle(kullanici: Kullanici, yol: string): void {
  if (!izinliBelgeMi(yol)) throw yetkiYok(DEPO_DISI);
  erisimDenetle(kullanici, yol);
}

// Kimlik oturumdan gelir; gövdedeki hiçbir alan sahipliği belirlemez.
function sahiplikDenetle(kullanici: Kullanici, yol: string, mevcut: KilitliBelge | null): void {
  if (mevcut !== null && !degistirebilirMi(yol, kullanici.id, mevcut.olusturanKisiId)) {
    throw yetkiYok('Bu kaydı yalnız oluşturan kişi değiştirebilir ya da silebilir.');
  }
}

// 226 a: uç yazma yetkisini verir; ortak kaydı silen ya da boşaltan sonuç ayrıca yönetim ister (kural `yonetimGerekirMi`).
function yonetimDenetle(kullanici: Kullanici, yol: string, eski: Veri | null, yeni: Veri | null): void {
  if (!kullanici.islemler.includes(ISLEM_YONET) && yonetimGerekirMi(yol, eski, yeni)) {
    throw yetkiYok('Profil silme, sıfırlama ve bütün kaydı silme yalnız yönetici tarafından yapılabilir.');
  }
}

export async function sorgu(
  db: Db, kullanici: Kullanici, k: { koleksiyon: string; filtreler?: Filtre[] | undefined; sira?: Sira | undefined; sinir?: number | undefined },
): Promise<SorguCevabi> {
  if (!izinliKoleksiyonMu(k.koleksiyon)) throw yetkiYok(DEPO_DISI);
  erisimDenetle(kullanici, k.koleksiyon);
  const belgeler = sorgula(await sorgular.koleksiyonBelgeleri(db, k.koleksiyon), {
    ...(k.filtreler === undefined ? {} : { filtreler: k.filtreler }),
    ...(k.sira === undefined ? {} : { sira: k.sira }),
    ...(k.sinir === undefined ? {} : { sinir: k.sinir }),
  });
  return { belgeler, damga: await sorgular.damga(db) };
}

export async function belgeOku(db: Db, kullanici: Kullanici, yol: string): Promise<BelgeCevabi> {
  belgeDenetle(kullanici, yol);
  return { belge: await sorgular.belgeGetir(db, yol), damga: await sorgular.damga(db) };
}

export async function belgeYaz(db: Db, kullanici: Kullanici, g: YazGovdesi): Promise<BelgeCevabi> {
  belgeDenetle(kullanici, g.yol);
  const mevcut = await sorgular.belgeKilitle(db, g.yol);
  sahiplikDenetle(kullanici, g.yol, mevcut);
  if (g.beklenenSurum !== undefined && (mevcut?.surum ?? null) !== g.beklenenSurum) {
    throw cakisma('Kayıt siz açtıktan sonra değişti; sayfayı yenileyip yeniden deneyin.');
  }
  let veri: Veri = g.veri;
  if (g.kip === 'birlestir') {
    if (mevcut === null) throw bulunamadi('Güncellenecek kayıt yok.');
    veri = derinBirlestir(mevcut.veri, g.veri);
  }
  yonetimDenetle(kullanici, g.yol, mevcut?.veri ?? null, veri);
  const belge = await sorgular.belgeYaz(db, { yol: g.yol, ust: ustYolu(g.yol), kimlik: sonParca(g.yol), veri, kisiId: kullanici.id });
  return { belge, damga: belge.surum };
}

export async function belgeSil(db: Db, kullanici: Kullanici, yol: string): Promise<{ silindi: boolean; damga: number }> {
  belgeDenetle(kullanici, yol);
  const mevcut = await sorgular.belgeKilitle(db, yol);
  sahiplikDenetle(kullanici, yol, mevcut);
  yonetimDenetle(kullanici, yol, mevcut?.veri ?? null, null);
  const silindi = await sorgular.belgeSil(db, yol);
  return { silindi, damga: await sorgular.damga(db) };
}

// Belge yoksa boş gövdeyle açılır; kilit verisi verildiyse belgeye birleşir.
export async function kilitle(db: Db, kullanici: Kullanici, g: { yol: string; sahip: string; sureMs: number; veri?: Veri | undefined }): Promise<KilitCevabi> {
  belgeDenetle(kullanici, g.yol);
  const mevcut = await sorgular.belgeKilitle(db, g.yol);
  sahiplikDenetle(kullanici, g.yol, mevcut);
  const simdi = await sorgular.simdiMs(db);
  if (mevcut !== null && !kilitAlinirMi({ sahip: mevcut.kilitSahibi, bitis: mevcut.kilitBitis }, g.sahip, simdi)) {
    return { alindi: false, surum: null, bitis: await sorgular.kilitBitisi(db, g.yol) };
  }
  if (mevcut === null || g.veri !== undefined) {
    const veri = derinBirlestir(mevcut?.veri ?? {}, g.veri ?? {});
    yonetimDenetle(kullanici, g.yol, mevcut?.veri ?? null, veri);
    await sorgular.belgeYaz(db, { yol: g.yol, ust: ustYolu(g.yol), kimlik: sonParca(g.yol), veri, kisiId: kullanici.id });
  }
  const kilit = await sorgular.kilitYaz(db, g.yol, g.sahip, g.sureMs);
  return { alindi: true, surum: kilit.surum, bitis: kilit.bitis };
}

// 329 a: prototipin kalibrasyon sekmesindeki cihaz listesi; ölçü aletlerinin tek kaynağı Kalibrasyondur.
export async function olcuAletleri(db: Db): Promise<OlcuAletleriCevabi> {
  return { aletler: olcuAletleriKaydi(await aletlerVeKayitlari(db, OLCU_ALETI_KAYIT_ADEDI)) };
}

export async function damga(db: Db): Promise<{ damga: number }> {
  return { damga: await sorgular.damga(db) };
}

export async function ben(db: Db, kullanici: Kullanici): Promise<BenCevabi> {
  const kurulumGerekli = KURULUM_ISARETI !== null && (await sorgular.varOlanYollar(db, [KURULUM_ISARETI])).length === 0;
  return {
    kisi: { id: kullanici.id, ad: kullanici.ad },
    yazabilir: kullanici.islemler.includes(ISLEM_YAZ),
    yonetici: kullanici.islemler.includes(ISLEM_YONET),
    kurulumGerekli,
  };
}

// Prototiplerin kişi seçimi ve adları için aktif kişiler; adı başka modülün (kisiler) tek kaynağından gelir.
export async function kisiler(db: Db): Promise<{ kisiler: { id: number; ad: string }[] }> {
  return { kisiler: (await kisileriListele(db)).filter((k) => k.aktif).map(({ id, ad }) => ({ id, ad })) };
}

// Yalnız işaret belgesi yokken; var olan belge üzerine yazılmaz.
export async function kurulum(db: Db, kullanici: Kullanici): Promise<{ kurulan: number }> {
  if (KURULUM_ISARETI === null || (await sorgular.varOlanYollar(db, [KURULUM_ISARETI])).length > 0) return { kurulan: 0 };
  const belgeler = baslangicBelgeleri({ id: kullanici.id, ad: kullanici.ad }, await sorgular.simdiMs(db));
  const varOlan = new Set(await sorgular.varOlanYollar(db, belgeler.map((b) => b.yol)));
  let kurulan = 0;
  for (const b of belgeler) {
    if (varOlan.has(b.yol)) continue;
    await sorgular.belgeYaz(db, { yol: b.yol, ust: ustYolu(b.yol), kimlik: sonParca(b.yol), veri: b.veri, kisiId: kullanici.id });
    kurulan += 1;
  }
  return { kurulan };
}

// Oda kalıcı değildir: süreç belleğinde durur (TMI tek sunucudur). Okuma ucunda yazılır; veritabanına dokunmaz.
const oda = new Map<number, OdaKaydi>();

export function odaGuncelle(kullanici: Kullanici, yama: Veri | undefined, simdi = Date.now()): OdaCevabi {
  const eski = oda.get(kullanici.id);
  oda.set(kullanici.id, { durum: durumYamala(eski?.durum ?? {}, yama ?? {}), guncellendi: simdi });
  for (const [kisiId, k] of oda) if (simdi - k.guncellendi > 10 * 60_000) oda.delete(kisiId);
  return { esler: canliEsler(oda, simdi) };
}

export async function ekYukle(db: Db, kullanici: Kullanici, g: { ad: string; tur: string; veri: string }): Promise<EkCevabi> {
  const icerik = Buffer.from(g.veri, 'base64');
  if (icerik.length === 0) throw dogrulama('Dosya boş.', 'veri');
  if (icerik.length > AZAMI_EK_BAYT) throw dogrulama('Dosya bu modülde en çok 700 KB olabilir.', 'veri');
  return sorgular.ekEkle(db, { ad: g.ad, tur: g.tur, icerik, kisiId: kullanici.id });
}

export async function ekOku(db: Db, id: string): Promise<EkIcerikCevabi> {
  const ek = await sorgular.ekGetir(db, id);
  if (ek === null) throw bulunamadi('Dosya bulunamadı.');
  return { id: ek.id, ad: ek.ad, tur: ek.tur, boyut: ek.boyut, veri: ek.icerik.toString('base64') };
}
