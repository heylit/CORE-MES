import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { AZAMI_EK_BAYT } from '#paylasilan/sozlesme/mesaj.ts';
import type { BelgeCevabi, BenCevabi, EkCevabi, EkIcerikCevabi, Filtre, KilitCevabi, OdaCevabi, Sira, SorguCevabi, YazGovdesi } from '#paylasilan/sozlesme/mesaj.ts';
import { kisileriListele } from '../kisiler/disari.ts';
import {
  KURULUM_ISARETI, baslangicBelgeleri, canliEsler, derinBirlestir, durumYamala, erisebilirMi, kilitAlinirMi, silmeEngeli, sonParca, sorgula, ustYolu,
  yabanciGonderenVar, yazmaEngeli, zamanliGonderenler,
} from './kurallar.ts';
import type { OdaKaydi, Veri } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Akış: yetkiyi uç verir; burada kişiye özel alan, sürüm denetimi ve birleştirme uygulanır.

const ISLEM_YAZ = 'mesaj.yaz';
const ISLEM_YONET = 'mesaj.yonet';

function erisimDenetle(kullanici: Kullanici, yol: string): void {
  if (!erisebilirMi(yol, kullanici.id)) throw yetkiYok('Bu kayıt başka bir kişiye özeldir.');
}

// Gönderen ve sahiplik oturumdaki kişiden denetlenir; gövdedeki `by` kanıt değildir.
async function yazmaHakkiDenetle(db: Db, kullanici: Kullanici, k: { yol: string; kip: 'tam' | 'birlestir'; veri: Veri; mevcut: Veri | null }): Promise<void> {
  const ben = String(kullanici.id);
  const simdi = await sorgular.simdiMs(db);
  const zamanli = yabanciGonderenVar(k.veri, k.mevcut, ben) ? zamanliGonderenler(await sorgular.koleksiyonBelgeleri(db, 'zamanli'), simdi) : new Set<string>();
  const engel = yazmaEngeli({ ...k, ben, yonetici: kullanici.islemler.includes(ISLEM_YONET), simdi, zamanli });
  if (engel !== null) throw yetkiYok(engel);
}

export async function sorgu(
  db: Db, kullanici: Kullanici, k: { koleksiyon: string; filtreler?: Filtre[] | undefined; sira?: Sira | undefined; sinir?: number | undefined },
): Promise<SorguCevabi> {
  erisimDenetle(kullanici, k.koleksiyon);
  const belgeler = sorgula(await sorgular.koleksiyonBelgeleri(db, k.koleksiyon), {
    ...(k.filtreler === undefined ? {} : { filtreler: k.filtreler }),
    ...(k.sira === undefined ? {} : { sira: k.sira }),
    ...(k.sinir === undefined ? {} : { sinir: k.sinir }),
  });
  return { belgeler, damga: await sorgular.damga(db) };
}

export async function belgeOku(db: Db, kullanici: Kullanici, yol: string): Promise<BelgeCevabi> {
  erisimDenetle(kullanici, yol);
  return { belge: await sorgular.belgeGetir(db, yol), damga: await sorgular.damga(db) };
}

export async function belgeYaz(db: Db, kullanici: Kullanici, g: YazGovdesi): Promise<BelgeCevabi> {
  erisimDenetle(kullanici, g.yol);
  const mevcut = await sorgular.belgeKilitle(db, g.yol);
  if (g.beklenenSurum !== undefined && (mevcut?.surum ?? null) !== g.beklenenSurum) {
    throw cakisma('Kayıt siz açtıktan sonra değişti; sayfayı yenileyip yeniden deneyin.');
  }
  await yazmaHakkiDenetle(db, kullanici, { yol: g.yol, kip: g.kip, veri: g.veri, mevcut: mevcut?.veri ?? null });
  let veri: Veri = g.veri;
  if (g.kip === 'birlestir') {
    if (mevcut === null) throw bulunamadi('Güncellenecek kayıt yok.');
    veri = derinBirlestir(mevcut.veri, g.veri);
  }
  const belge = await sorgular.belgeYaz(db, { yol: g.yol, ust: ustYolu(g.yol), kimlik: sonParca(g.yol), veri, kisiId: kullanici.id });
  return { belge, damga: belge.surum };
}

export async function belgeSil(db: Db, kullanici: Kullanici, yol: string): Promise<{ silindi: boolean; damga: number }> {
  erisimDenetle(kullanici, yol);
  const mevcut = await sorgular.belgeKilitle(db, yol);
  const engel = silmeEngeli(yol, mevcut?.veri ?? null, String(kullanici.id), kullanici.islemler.includes(ISLEM_YONET));
  if (engel !== null) throw yetkiYok(engel);
  const silindi = await sorgular.belgeSil(db, yol);
  return { silindi, damga: await sorgular.damga(db) };
}

// Belge yoksa boş gövdeyle açılır; kilit verisi verildiyse belgeye birleşir.
export async function kilitle(db: Db, kullanici: Kullanici, g: { yol: string; sahip: string; sureMs: number; veri?: Veri | undefined }): Promise<KilitCevabi> {
  erisimDenetle(kullanici, g.yol);
  const mevcut = await sorgular.belgeKilitle(db, g.yol);
  const simdi = await sorgular.simdiMs(db);
  if (mevcut !== null && !kilitAlinirMi({ sahip: mevcut.kilitSahibi, bitis: mevcut.kilitBitis }, g.sahip, simdi)) {
    return { alindi: false, surum: null, bitis: await sorgular.kilitBitisi(db, g.yol) };
  }
  if (mevcut === null || g.veri !== undefined) {
    await yazmaHakkiDenetle(db, kullanici, { yol: g.yol, kip: 'birlestir', veri: g.veri ?? {}, mevcut: mevcut?.veri ?? null });
    const veri = derinBirlestir(mevcut?.veri ?? {}, g.veri ?? {});
    await sorgular.belgeYaz(db, { yol: g.yol, ust: ustYolu(g.yol), kimlik: sonParca(g.yol), veri, kisiId: kullanici.id });
  }
  const kilit = await sorgular.kilitYaz(db, g.yol, g.sahip, g.sureMs);
  return { alindi: true, surum: kilit.surum, bitis: kilit.bitis };
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
