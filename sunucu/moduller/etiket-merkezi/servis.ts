import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, UygulamaHatasi } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  COZUNURLUKLER, DOSYA_UZANTILARI, EN_COK_ADET, SABLON_TURU_ADLARI, YAZICI_DILLERI, YAZICI_DILI_ADLARI, type BasCevabi, type BasGovdesi, type BaskilarCevabi, type CiktiCevabi, type CiktiSecenekleri, type DogrudanBaski, type IndirCevabi,
  type KayitCiktiCevabi, type KayitSecimi,
  type Sablon, type SablonlarCevabi, type Yazici, type YaziciAcGovdesi, type YaziciGuncelleGovdesi, type YazicilarCevabi,
} from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { istasyonKonumlari, konumAdlari, lotEtiketleri } from '../stok/disari.ts';
import { refakatKarti } from '../uretim-emirleri/disari.ts';
import { yaziciAgiOku } from './ag.ts';
import { tcpGonder, type Gonderici } from './gonderici.ts';
import {
  baskiEngeli, dogrudanBaskiDurumu, indirmeEngeli, istasyonDegerleri, kayitSablonTuru, kayitUyumHatasi, konumDegerleri, lotDegerleri, malzemeDegerleri, refakatDegerleri, sablonHatalari, toplamEtiketHatasi, yaziciAdresHatasi, yerlesim, type AlanDegerleri,
} from './kurallar.ts';
import { ALANLAR, HAZIR_SABLONLAR, ORNEK_DEGERLER } from './sablonlar.ts';
import {
  baskiEkle, sonBaskilar, yaziciEkle, yaziciGuncelle, yaziciOku, yaziciVarMi, yazicilariOku, type YaziciYazimi,
} from './sorgular.ts';
import { KOMUT_URETICILERI } from './yazici-dili.ts';

export const sablonlar = (): SablonlarCevabi => ({
  sablonlar: [...HAZIR_SABLONLAR],
  alanlar: ALANLAR,
  secenekler: {
    diller: YAZICI_DILLERI.map((deger) => ({ deger, ad: YAZICI_DILI_ADLARI[deger] })),
    cozunurlukler: [...COZUNURLUKLER],
    enCokAdet: EN_COK_ADET,
    turAdlari: SABLON_TURU_ADLARI,
  },
});

function sablonBul(anahtar: string): Sablon {
  const sablon = HAZIR_SABLONLAR.find((s) => s.anahtar === anahtar);
  if (!sablon) throw bulunamadi('Şablon bulunamadı.');
  const hatalar = sablonHatalari(sablon);
  if (hatalar.length > 0) throw dogrulama(hatalar.join(' '));
  return sablon;
}

// Her değer kümesi için bir etiket; komutlar art arda gider, önizleme ilk etikettir.
function cikti(sablon: Sablon, degerlerListesi: readonly AlanDegerleri[], secenek: CiktiSecenekleri): CiktiCevabi {
  const uret = KOMUT_URETICILERI[secenek.dil];
  const yerlesimler = degerlerListesi.map((d) => yerlesim(sablon, d, secenek.sade));
  const komut = yerlesimler
    .map((ogeler) => uret({ genislik: sablon.genislik, yukseklik: sablon.yukseklik, ogeler, dpi: secenek.dpi, adet: secenek.adet }))
    .join('');
  return {
    sablon: { anahtar: sablon.anahtar, ad: sablon.ad, genislik: sablon.genislik, yukseklik: sablon.yukseklik },
    dil: secenek.dil, dpi: secenek.dpi, adet: secenek.adet,
    dosyaAdi: `${sablon.anahtar}-${secenek.dpi}.${DOSYA_UZANTILARI[secenek.dil]}`,
    komut, onizleme: yerlesimler[0] ?? [],
  };
}

// Örnek değerli çıktı yazıcı ve şablon denemesi içindir; gerçek kayıt `kayitCiktisi` ile basılır.
export function ornekCikti(anahtar: string, secenek: CiktiSecenekleri): CiktiCevabi {
  const sablon = sablonBul(anahtar);
  const degerler = sablon.tur === 'deneme'
    ? { ...ORNEK_DEGERLER.deneme, yazici: `${YAZICI_DILI_ADLARI[secenek.dil]} · ${secenek.dpi} dpi${secenek.sade ? ' · sade' : ''}` }
    : ORNEK_DEGERLER[sablon.tur];
  return cikti(sablon, [degerler], secenek);
}

// Mal kabul seçiminde `id` basılan lotun parti kimliğidir; deftere de o yazılır.
type KayitDegeri = { id: number; baslik: string; degerler: AlanDegerleri };

// Kayıt değerleri sahibi modülün disari.ts'inden okunur; istenen sırada döner, hiç etiket vermeyen kimlik `eksikler`e düşer.
async function kayitDegerleri(db: Db, k: KayitSecimi): Promise<{ bulunan: KayitDegeri[]; eksikler: number[] }> {
  const bulunanlar = await kaynaktanOku(db, k);
  const bulunan = k.idler.flatMap((id) => bulunanlar.get(id) ?? []);
  return { bulunan, eksikler: k.idler.filter((id) => (bulunanlar.get(id) ?? []).length === 0) };
}

const tekli = (m: Map<number, KayitDegeri>): Map<number, KayitDegeri[]> => new Map([...m].map(([id, d]) => [id, [d]]));

async function kaynaktanOku(db: Db, k: KayitSecimi): Promise<Map<number, KayitDegeri[]>> {
  if (k.tur === 'konum') {
    const kodlar = await konumAdlari(db, k.idler);
    return tekli(new Map([...kodlar].map(([id, kod]) => [id, { id, baslik: kod, degerler: konumDegerleri(kod) }])));
  }
  if (k.tur === 'istasyon') {
    // Konumu açılmamış istasyonun teslim kodu yoktur; boş QR basılmaz, eksik sayılır.
    const konumlar = await istasyonKonumlari(db, k.idler);
    const adlar = await istasyonAdlari(db, [...konumlar.keys()]);
    return tekli(new Map([...konumlar].map(([id, { kod }]) => [id, { id, baslik: kod, degerler: istasyonDegerleri(kod, adlar.get(id) ?? null) }])));
  }
  if (k.tur === 'malzeme') {
    const ozetler = await malzemeOzetleri(db, k.idler);
    return tekli(new Map([...ozetler].map(([id, o]) => [id, { id, baslik: o.kod, degerler: malzemeDegerleri(o) }])));
  }
  // Lot, mal kabul ve refakat kartı tek kayıt okur; sorgular sırayla gider (aynı istemciye eşzamanlı sorgu verilmez).
  const sonuc = new Map<number, KayitDegeri[]>();
  if (k.tur === 'refakat') {
    // İptal emrin kartı basılmaz: emrin kendi kuralı (409) bütün baskıyı durdurur; olmayan emir eksik sayılır.
    const basim = new Date();
    for (const id of k.idler) {
      const kart = await refakatKarti(db, id).catch((h: unknown) => { if (h instanceof UygulamaHatasi && h.kod === 'BULUNAMADI') return null; throw h; });
      if (kart) sonuc.set(id, [{ id, baslik: kart.emirNo, degerler: refakatDegerleri(kart, basim) }]);
    }
    return sonuc;
  }
  for (const id of k.idler) {
    const lotlar = await lotEtiketleri(db, k.tur === 'mal-kabul' ? { malKabulId: id } : { partiId: id });
    sonuc.set(id, lotlar.map((e) => ({ id: e.partiId, baslik: e.lotNo, degerler: lotDegerleri(e) })));
  }
  return sonuc;
}

export async function kayitCiktisi(db: Db, anahtar: string, k: KayitSecimi, secenek: CiktiSecenekleri): Promise<KayitCiktiCevabi> {
  const sablon = sablonBul(anahtar);
  const uyum = kayitUyumHatasi(sablon.tur, k.tur);
  if (uyum !== null) throw dogrulama(uyum);
  const toplam = toplamEtiketHatasi(k.idler.length, secenek.adet);
  if (toplam !== null) throw dogrulama(toplam, 'adet');
  const { bulunan, eksikler } = await kayitDegerleri(db, k);
  if (bulunan.length === 0) throw bulunamadi('Seçilen kayıtlar bulunamadı.');
  // Mal kabul birden çok lot verir; sınır basılacak etiket sayısıyla yeniden denetlenir.
  const basilacak = toplamEtiketHatasi(bulunan.length, secenek.adet);
  if (basilacak !== null) throw dogrulama(basilacak, 'adet');
  return {
    ...cikti(sablon, bulunan.map((b) => b.degerler), secenek),
    kayitlar: bulunan.map(({ id, baslik }) => ({ id, baslik })),
    eksikler,
  };
}

// Açılışta geçersiz ya da kurum dışı aralık sunucuyu durdurur; çalışırken her istek değişkeni yeniden okur.
yaziciAgiOku(process.env);
const araliklar = () => yaziciAgiOku(process.env);

const YAZICI_YOK = 'Yazıcı bulunamadı.';
const AD_KISITI = { etiket_merkezi_yazici_ad_tekil: { ileti: 'Bu adla bir yazıcı var.', alan: 'ad' } };

async function dogrudanBaski(db: Db): Promise<DogrudanBaski> {
  return dogrudanBaskiDurumu(await sistemAyariOku(db, 'etiket-merkezi.dogrudan-baski'), araliklar());
}

export async function yazicilar(db: Db): Promise<YazicilarCevabi> {
  return { yazicilar: await yazicilariOku(db), dogrudanBaski: await dogrudanBaski(db) };
}

function yaziciYazimi(g: YaziciAcGovdesi): YaziciYazimi {
  const adres = g.baglanti === 'ag' ? (g.adres ?? '') : g.adres;
  const hata = yaziciAdresHatasi(g.baglanti, adres === '' ? null : adres, araliklar());
  if (hata !== null) throw dogrulama(hata, 'adres');
  return { ad: g.ad, dil: g.dil, dpi: g.dpi, baglanti: g.baglanti, adres: g.baglanti === 'ag' ? adres : null, sade: g.sade };
}

export async function yaziciAc(db: Db, kullanici: Kullanici, g: YaziciAcGovdesi): Promise<Yazici> {
  const y = await kisitKorumali(AD_KISITI, () => yaziciEkle(db, yaziciYazimi(g), kullanici.id));
  if (!y) throw new Error('Yazıcı yazılamadı.');
  return y;
}

export function yaziciDuzenle(db: Db, kullanici: Kullanici, id: number, g: YaziciGuncelleGovdesi): Promise<Yazici> {
  return kisitKorumali(AD_KISITI, () => surumluGuncelle({
    guncelle: () => yaziciGuncelle(db, id, { ...yaziciYazimi(g), aktif: g.aktif, surum: g.surum }, kullanici.id),
    varMi: () => yaziciVarMi(db, id),
    bulunamadiIletisi: YAZICI_YOK,
  }));
}

// Gönderim sonucu her durumda deftere yazılır; ulaşılamayan yazıcı hata değil "hata" sonuçlu kayıttır (ileti adres taşımaz).
export async function bas(db: Db, kullanici: Kullanici, anahtar: string, g: BasGovdesi, gonder: Gonderici = tcpGonder): Promise<BasCevabi> {
  const yazici = await yaziciOku(db, g.yaziciId);
  if (!yazici) throw bulunamadi(YAZICI_YOK);
  const sablon = sablonBul(anahtar);
  const ag = araliklar();
  const engel = baskiEngeli(yazici, dogrudanBaskiDurumu(await sistemAyariOku(db, 'etiket-merkezi.dogrudan-baski'), ag), ag, sablon.tur, g.kayit?.tur ?? null);
  if (engel !== null) throw dogrulama(engel);
  const hazir = await baskiCiktisi(db, anahtar, yazici, g);
  let hata: string | null = null;
  try {
    await gonder(yazici.adres ?? '', hazir.komut);
  } catch {
    hata = 'Yazıcıya ulaşılamadı (kapalı, ağda değil ya da 9100 kapısı kapalı).';
  }
  const baskiId = await baskiEkle(db, {
    yaziciId: yazici.id, sablonAnahtar: anahtar, adet: g.adet, kisiId: kullanici.id, sonuc: hata === null ? 'gonderildi' : 'hata', hata, kayit: basilanKayitlar(g, hazir),
  });
  return { baskiId, sonuc: hata === null ? 'gonderildi' : 'hata', ileti: hata };
}

// İndirilen dosyanın yazıcıya gönderildiği bilinmez; defter kimin hangi etiketi indirdiğini tutar.
export async function indir(db: Db, kullanici: Kullanici, anahtar: string, g: BasGovdesi): Promise<IndirCevabi> {
  const yazici = await yaziciOku(db, g.yaziciId);
  if (!yazici) throw bulunamadi(YAZICI_YOK);
  const sablon = sablonBul(anahtar);
  const engel = indirmeEngeli(yazici, sablon.tur, g.kayit?.tur ?? null);
  if (engel !== null) throw dogrulama(engel);
  const hazir = await baskiCiktisi(db, anahtar, yazici, g);
  const baskiId = await baskiEkle(db, {
    yaziciId: yazici.id, sablonAnahtar: anahtar, adet: g.adet, kisiId: kullanici.id, sonuc: 'indirildi', hata: null, kayit: basilanKayitlar(g, hazir),
  });
  return { baskiId, dosyaAdi: hazir.dosyaAdi, komut: hazir.komut };
}

// Yazıcı kendi dili, çözünürlüğü ve harf ayarıyla basar.
function baskiCiktisi(db: Db, anahtar: string, yazici: Yazici, g: BasGovdesi): Promise<CiktiCevabi & { kayitlar: KayitCiktiCevabi['kayitlar'] | null }> {
  const secenek = { dil: yazici.dil, dpi: yazici.dpi === 300 ? 300 : 203, adet: g.adet, sade: yazici.sade } as const;
  return g.kayit ? kayitCiktisi(db, anahtar, g.kayit, secenek) : Promise.resolve({ ...ornekCikti(anahtar, secenek), kayitlar: null });
}

// Defterde yalnız gerçekten komuta giren (bulunan) kayıtlar yer alır.
function basilanKayitlar(g: BasGovdesi, hazir: { kayitlar: KayitCiktiCevabi['kayitlar'] | null }): { tur: string; idler: number[] } | null {
  return g.kayit && hazir.kayitlar ? { tur: kayitSablonTuru(g.kayit.tur), idler: hazir.kayitlar.map((k) => k.id) } : null;
}

export async function baskilar(db: Db): Promise<BaskilarCevabi> {
  const satirlar = await sonBaskilar(db, 100);
  const adlar = await kisiAdlari(db, [...new Set(satirlar.map((s) => s.kisiId))]);
  return { baskilar: satirlar.map(({ kisiId, ...s }) => ({ ...s, kisi: adlar.get(kisiId) ?? null })) };
}
