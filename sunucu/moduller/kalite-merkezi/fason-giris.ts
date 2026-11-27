import type { Db } from '#cekirdek/db.ts';
import { dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  KmFasonGkkKarari, KmFasonGkkKararCevabi, KmFasonGkkSatiri, KmKaynaktaMuayeneSatiri,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { firmaAdlari } from '../musteri-tedarikci/disari.ts';
import { fasonGkkKarari, fasonGkkKararHareketleri, fasonGkkSatirlari } from '../stok/disari.ts';
import {
  emirNolari, fasonGkkAnahtari, fasonGkkBaglamlari, fasonGkkKarariniIsle, kaynaktaMuayeneGorevleri, kaynaktaMuayeneOnayla,
} from '../uretim-emirleri/disari.ts';

// 3809: fason dönüşünün GKK'sı ve kaynağında muayene Kalite Merkezi'ndedir. Stok parçanın karantinadaki adedini ve kararın hareketini,
// üretim emirleri fason ve kontrol adımlarını tutar; burada ikisi tek satırda birleşir. Yetkiyi uç (kalite-merkezi.onayla) denetler.

export async function fasonGkkBekleyenleri(db: Db): Promise<KmFasonGkkSatiri[]> {
  const satirlar = await fasonGkkSatirlari(db);
  const baglam = await fasonGkkBaglamlari(db, satirlar);
  const firmalar = await firmaAdlari(db, [...baglam.values()].flatMap((b) => (b.firmaId === null ? [] : [b.firmaId])));
  return satirlar.flatMap((s) => {
    const b = baglam.get(fasonGkkAnahtari(s));
    if (b === undefined) return [];
    return [{
      fasonIsEmriId: s.fasonIsEmriId, uretimEmriId: s.uretimEmriId, emirNo: b.emirNo, opNo: s.opNo, parcaNo: b.parcaNo, parcaAd: b.parcaAd,
      firmaAdi: b.firmaId === null ? null : (firmalar.get(b.firmaId) ?? null), malzemeKod: s.malzemeKod, malzemeAd: s.malzemeAd, birim: s.birim,
      gelen: s.gelen, bekleyen: s.bekleyen, gelenAdet: s.gelenAdet, bekleyenAdet: s.bekleyenAdet, sonZaman: s.sonZaman, malKabulNo: s.malKabulNo, gkkAdimi: b.gkkAdimId !== null,
    }];
  });
}

export async function kaynaktaMuayeneBekleyenleri(db: Db): Promise<KmKaynaktaMuayeneSatiri[]> {
  const gorevler = await kaynaktaMuayeneGorevleri(db);
  const firmalar = await firmaAdlari(db, gorevler.flatMap((g) => (g.firmaId === null ? [] : [g.firmaId])));
  return gorevler.map(({ firmaId, ...g }) => ({ ...g, firmaAdi: firmaId === null ? null : (firmalar.get(firmaId) ?? null) }));
}

// Karar stokta yazılır (serbest ve şartlı mal kabul alanına, red karantinada red), ardından aynı işlemde GKK adımı yürür; fason
// adımı tamamsa ve bekleyen kalmadıysa adım kapanır. Üç sonuç sırayla yazılır; toplam bekleyeni aşarsa ilk aşan sonuç reddedilir ve
// bütün işlem geri alınır.
export async function fasonGkkKarariVer(
  db: Db, kullanici: Kullanici, isEmriId: number, g: { serbest: number; sartli: number; red: number; not: string | null },
): Promise<KmFasonGkkKararCevabi> {
  let son: Awaited<ReturnType<typeof fasonGkkKarari>> | null = null;
  for (const sonuc of ['serbest', 'sartli', 'red'] as const) {
    if (g[sonuc] <= 0) continue;
    son = await fasonGkkKarari(db, kullanici.id, { isEmriId, adet: g[sonuc], sonuc, not: g.not });
  }
  if (son === null) throw dogrulama('Karar adedi sıfırdan büyük olmalı.', 'serbest');
  const adim = await fasonGkkKarariniIsle(db, kullanici.id, isEmriId, { saglamToplam: son.kabulAdet, bekleyen: son.bekleyenAdet });
  return { bekleyenAdet: son.bekleyenAdet, adimKapandi: adim.kapandi };
}

export async function kaynaktaMuayeneOnayVer(db: Db, kullanici: Kullanici, isEmriId: number, g: { saglam: number; red: number }): Promise<{ uretimEmriId: number }> {
  const s = await kaynaktaMuayeneOnayla(db, kullanici, isEmriId, g);
  return { uretimEmriId: s.uretimEmriId };
}

export async function fasonGkkYapilanlar(db: Db, a: { baslangic: string; bitis: string; sinir: number }): Promise<KmFasonGkkKarari[]> {
  const satirlar = await fasonGkkKararHareketleri(db, a);
  const nolar = await emirNolari(db, satirlar.map((s) => s.uretimEmriId));
  const kisiler = await kisiAdlari(db, satirlar.map((s) => s.kisiId));
  return satirlar.flatMap((s) => {
    if (s.hedef !== 'serbest' && s.hedef !== 'sartli' && s.hedef !== 'red') return [];
    return [{
      uretimEmriId: s.uretimEmriId, emirNo: nolar.get(s.uretimEmriId) ?? null, opNo: s.opNo, sonuc: s.hedef, miktar: s.miktar,
      kisiAd: kisiler.get(s.kisiId) ?? null, zaman: s.zaman,
    }];
  });
}
