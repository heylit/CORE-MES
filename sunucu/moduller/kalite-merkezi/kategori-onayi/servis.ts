import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  KmKategoriKarariGovdesi, KmKategoriOnayi, KmKategoriOnaylariCevabi, KmKategoriTuru, KmOnayliListeOnayi, KmOnayliListeSatiri, KmTedarikciOnayi,
  KmTedarikciOnayiGovdesi, KmTedarikciOnaylariCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { kategoriAgaci } from '../../malzemeler/disari.ts';
import { firmaOzeti, tumFirmalar } from '../../musteri-tedarikci/disari.ts';
import { tedarikciFirmasiMi } from '../kurallar.ts';
import {
  KATEGORI_ILETILERI, ONAY_ILETILERI, askidakiFirmalar, gecerliKararlar, kapsamiDuzenle, kategoriReddi, listeFirmalari, onayGecerliligi,
} from './kurallar.ts';
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

// 3279-2 a: şirket dışı onaylar (müşteri, diğer). Müşteri firması Müşteri-Tedarikçi'deki müşteri ya da ikisi türündeki firmadır.
const musteriFirmasiMi = (f: { aktif: boolean; tur: string }): boolean => f.aktif && (f.tur === 'musteri' || f.tur === 'ikisi');
const kapsamCoz = (a: string): { kategoriTuru: KmKategoriTuru; kategoriKodu: string } => {
  const i = a.indexOf('|');
  return { kategoriTuru: a.slice(0, i) as KmKategoriTuru, kategoriKodu: a.slice(i + 1) };
};

async function digerOnaylariOku(db: Db, firmaIdler: readonly number[] | null): Promise<Map<number, KmTedarikciOnayi[]>> {
  const satirlar = await sorgular.digerOnaylar(db, firmaIdler);
  const adlar = await kisiAdlari(db, [...new Set(satirlar.map((x) => x.kisiId))]);
  const firmaAdi = new Map((await tumFirmalar(db)).map((f) => [f.id, f.ad]));
  const sonuc = new Map<number, KmTedarikciOnayi[]>();
  for (const x of satirlar) {
    const l = sonuc.get(x.firmaId) ?? [];
    l.push({
      id: x.id, tur: x.tur, musteriFirmaId: x.musteriFirmaId, musteriAd: x.musteriFirmaId === null ? null : firmaAdi.get(x.musteriFirmaId) ?? null, ad: x.ad,
      kapsamTumu: x.kapsamTumu, kapsam: x.kapsam.map(kapsamCoz), durum: x.durum, aciklama: x.aciklama, bitis: x.bitis, belgeKimligi: x.belgeKimligi,
      kisiAd: adlar.get(x.kisiId) ?? null, tarih: x.zaman, surum: x.surum,
    });
    sonuc.set(x.firmaId, l);
  }
  return sonuc;
}

// Kalite Merkezi ekranı: firmanın şirket dışı onayları ve müşteri seçicisi (aktif müşteri firmaları, firmanın kendisi hariç).
export async function digerOnaylariEkran(db: Db, firmaId: number): Promise<KmTedarikciOnaylariCevabi> {
  const onaylar = (await digerOnaylariOku(db, [firmaId])).get(firmaId) ?? [];
  const musteriler = (await tumFirmalar(db)).filter((f) => musteriFirmasiMi(f) && f.id !== firmaId).map((f) => ({ id: f.id, ad: f.ad }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr-TR') || a.id - b.id);
  return { onaylar, musteriler };
}

// Yeni onay (id null) ya da okunan sürümle değiştirme; firma ve tür değişmez. Kişi ve zaman sunucudan; her yazma geçmişe düşer.
export async function digerOnayKaydet(db: Db, kullanici: Kullanici, g: KmTedarikciOnayiGovdesi): Promise<{ id: number; surum: number }> {
  const firma = await firmaOzeti(db, g.firmaId);
  if (firma === null || !tedarikciFirmasiMi(firma)) throw dogrulama(ONAY_ILETILERI.firma, 'firmaId');
  if (g.musteriFirmaId !== null) {
    if (g.musteriFirmaId === g.firmaId) throw dogrulama(ONAY_ILETILERI.kendisi, 'musteriFirmaId');
    const m = await firmaOzeti(db, g.musteriFirmaId);
    if (m === null || !musteriFirmasiMi(m)) throw dogrulama(ONAY_ILETILERI.musteri, 'musteriFirmaId');
  }
  if (g.belgeKimligi !== null && !(await sorgular.firmaBelgesiMi(db, g.belgeKimligi, g.firmaId))) throw dogrulama(ONAY_ILETILERI.belge, 'belgeKimligi');
  const once = g.id === null ? null : await sorgular.digerOnayKilitle(db, g.id);
  if (g.id !== null) {
    if (once === null) throw bulunamadi(ONAY_ILETILERI.onayYok);
    if (once.firmaId !== g.firmaId || once.tur !== g.tur) throw dogrulama(ONAY_ILETILERI.degismez, 'tur');
    if (once.surum !== g.surum) throw eskiSurum();
  }
  const onceki = g.id === null ? [] : ((await sorgular.digerOnaylar(db, [g.firmaId])).find((x) => x.id === g.id)?.kapsam ?? []);
  const k = kapsamiDuzenle(await kategoriAgaci(db), g.kapsamTumu, g.kapsam, onceki);
  if (k.red !== null) throw dogrulama(k.red, 'kapsam');
  const y = {
    firmaId: g.firmaId, tur: g.tur, musteriFirmaId: g.tur === 'musteri' ? g.musteriFirmaId : null, ad: g.ad, kapsamTumu: g.kapsamTumu, durum: g.durum,
    aciklama: g.aciklama, bitis: g.bitis, belgeKimligi: g.belgeKimligi, kisiId: kullanici.id,
  };
  const s = g.id === null ? await sorgular.digerOnayEkle(db, y) : await sorgular.digerOnayGuncelle(db, g.id, y);
  if (s === null) throw bulunamadi(ONAY_ILETILERI.onayYok);
  await sorgular.kapsamYaz(db, s.id, k.kapsam);
  await sorgular.digerOnayGecmisiYaz(db, s.id, once?.durum ?? null, y, k.kapsam.map((x) => `${x.kategoriTuru}|${x.kategoriKodu}`));
  return s;
}

// disari.ts (3279 a): onaylı tedarikçi listesinin Kalite parçası. Kaydı ya da kategori kararı olan her firma haritadadır; kararlar
// geçerli hâliyle (askıda firmada onaysız). Yetkiyi çağıranın ucu denetler.
export async function onayliListe(db: Db): Promise<Map<number, KmOnayliListeSatiri>> {
  const firmalar = await tumFirmalar(db);
  const kayitlar = listeFirmalari(await sorgular.listeKayitlari(db), firmalar);
  const bilinen = new Set(firmalar.map((f) => f.id));
  const kararli = [...(await sorgular.kararliFirmalar(db)), ...(await sorgular.digerOnayliFirmalar(db))].filter((id) => bilinen.has(id));
  const idler = [...new Set([...kayitlar.keys(), ...kararli])].sort((a, b) => a - b);
  if (idler.length === 0) return new Map();
  const kararlar = await kategoriOnaylari(db, idler);
  const digerleri = await digerOnaylariOku(db, idler);
  const bugun = tesisGunu(Date.now());
  // Risk K3 (3279-2): belge açılmaz, yalnız var mı; kişi adı dönmez.
  const okunan = (o: KmTedarikciOnayi): KmOnayliListeOnayi => ({
    tur: o.tur, musteriFirmaId: o.musteriFirmaId, musteriAd: o.musteriAd, ad: o.ad, kapsamTumu: o.kapsamTumu, kapsam: o.kapsam,
    ...onayGecerliligi(o.durum, o.bitis, bugun), aciklama: o.aciklama, bitis: o.bitis, belgeVar: o.belgeKimligi !== null,
  });
  return new Map(idler.map((id) => {
    const k = kayitlar.get(id);
    return [id, {
      durum: k?.durum ?? null, firmaAskida: kararlar.get(id)?.firmaAskida?.tarih ?? null, adIleEslendi: k?.adIleEslendi ?? false, kritiklik: k?.kritiklik ?? null, sertifikalar: k?.sertifikalar ?? [],
      sertifikaBitisi: k?.sertifikaBitisi ?? null, sonDenetim: k?.sonDenetim ?? null,
      kategoriler: (kararlar.get(id)?.kategoriler ?? []).map((x) => ({ kategoriTuru: x.kategoriTuru, kategoriKodu: x.kategoriKodu, durum: x.durum, aciklama: x.aciklama, tarih: x.tarih, kisiAd: x.kisiAd })),
      onaylar: (digerleri.get(id) ?? []).map(okunan),
    }];
  }));
}
