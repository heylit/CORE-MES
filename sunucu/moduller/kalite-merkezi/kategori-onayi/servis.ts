import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  KmKategoriKarariGovdesi, KmKategoriOnayi, KmKategoriOnaylariCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { kategoriAgaci } from '../../malzemeler/disari.ts';
import { firmaOzeti, tumFirmalar } from '../../musteri-tedarikci/disari.ts';
import { tedarikciFirmasiMi } from '../kurallar.ts';
import { KATEGORI_ILETILERI, askidakiFirmalar, gecerliKararlar, kategoriReddi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

async function kararlariOku(db: Db, firmaIdler: readonly number[]): Promise<Map<number, KmKategoriOnayi[]>> {
  const satirlar = await sorgular.kararlar(db, firmaIdler);
  const adlar = await kisiAdlari(db, [...new Set(satirlar.map((s) => s.kisiId))]);
  const sonuc = new Map<number, KmKategoriOnayi[]>();
  for (const s of satirlar) {
    const liste = sonuc.get(s.firmaId) ?? [];
    liste.push({
      kategoriTuru: s.kategoriTuru, kategoriKodu: s.kategoriKodu, durum: s.durum, kaynak: 'kategori', tarih: s.zaman,
      kisiAd: adlar.get(s.kisiId) ?? null, aciklama: s.aciklama, surum: s.surum,
    });
    sonuc.set(s.firmaId, liste);
  }
  return sonuc;
}

async function askilar(db: Db, firmaIdler: readonly number[]): Promise<Map<number, string>> {
  const istenen = new Set(firmaIdler);
  const firmalar = (await tumFirmalar(db)).filter((f) => istenen.has(f.id));
  return askidakiFirmalar(await sorgular.tedarikciKayitlari(db), firmalar);
}

// disari.ts: satın almanın okuduğu geçerli kararlar (2466-2 a). Kararı olmayan firma da haritada yer alır (boş liste) ki askı görünsün.
export async function kategoriOnaylari(
  db: Db, firmaIdler: readonly number[],
): Promise<Map<number, { firmaAskida: { tarih: string } | null; kategoriler: KmKategoriOnayi[] }>> {
  const idler = [...new Set(firmaIdler)];
  if (idler.length === 0) return new Map();
  const kararlar = await kararlariOku(db, idler);
  const aski = await askilar(db, idler);
  return new Map(idler.map((id) => {
    const tarih = aski.get(id) ?? null;
    return [id, { firmaAskida: tarih === null ? null : { tarih }, kategoriler: gecerliKararlar(kararlar.get(id) ?? [], tarih) }];
  }));
}

// Kalite Merkezi ekranı: kararlar olduğu gibi, firma askısı ayrı, seçici için Malzemeler ağacı.
export async function ekran(db: Db, firmaId: number): Promise<KmKategoriOnaylariCevabi> {
  const kararlar = await kararlariOku(db, [firmaId]);
  const aski = await askilar(db, [firmaId]);
  const agac = await kategoriAgaci(db);
  const tarih = aski.get(firmaId);
  return { firmaAskida: tarih === undefined ? null : { tarih }, onaylar: kararlar.get(firmaId) ?? [], agac };
}

// Kişi ve zaman sunucudan; yeni karar (surum null) var olan kararın üstüne yazmaz, değiştirme okunan sürümü ister.
export async function kararVer(db: Db, kullanici: Kullanici, g: KmKategoriKarariGovdesi): Promise<{ surum: number }> {
  const firma = await firmaOzeti(db, g.firmaId);
  if (firma === null || !tedarikciFirmasiMi(firma)) throw dogrulama(KATEGORI_ILETILERI.firma, 'firmaId');
  const red = kategoriReddi(await kategoriAgaci(db), g.kategoriTuru, g.kategoriKodu, g.surum === null);
  if (red !== null) throw dogrulama(red, 'kategoriKodu');
  const k = { firmaId: g.firmaId, kategoriTuru: g.kategoriTuru, kategoriKodu: g.kategoriKodu, durum: g.durum, aciklama: g.aciklama, kisiId: kullanici.id };
  if (g.surum === null) {
    const s = await sorgular.kararEkle(db, k);
    if (s === null) throw cakisma(KATEGORI_ILETILERI.kararVar);
    await sorgular.gecmisYaz(db, k, null);
    return s;
  }
  const once = await sorgular.kararKilitle(db, g.firmaId, g.kategoriTuru, g.kategoriKodu);
  if (once === null) throw bulunamadi(KATEGORI_ILETILERI.kararYok);
  if (once.surum !== g.surum) throw eskiSurum();
  const s = await sorgular.kararGuncelle(db, k);
  if (s === null) throw bulunamadi(KATEGORI_ILETILERI.kararYok);
  await sorgular.gecmisYaz(db, k, once.durum);
  return s;
}
