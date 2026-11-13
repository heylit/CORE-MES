import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import type { LogoKartAlislariCevabi, LogoKartBolumuCevabi, LogoKartHareketleriCevabi } from '#paylasilan/sozlesme/logo.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { malzemeNoKoddan } from '../malzemeler/disari.ts';
import { logoEsliDepoMiktarlari } from '../stok/disari.ts';
import type { KopruIstemcisi } from './kopru.ts';
import {
  hareketFisAdi, hareketYonu, KART_HAREKET_ESKI_YOL_SAYFA_SINIRI, KART_HAREKET_SAYFASI, kartStokKarsilastir,
} from './kurallar.ts';
import type { LogoMalzemeHareketi } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { TxAcan } from './servis.ts';

// 3201 a: malzeme kartında Logo'daki stok (aynadan), hareketler ve son alış fiyatları (köprüden, istenince). Yalnız okuma: Logo'ya istek
// yalnız GET'tir, okunan hiçbir şey CORE'a yazılmaz. Her parça "Logo bağlantısı" ve kendi anahtarı açıkken vardır; üçü de kapalı gelir.
export const KART_AYARLARI = {
  stok: 'logo.stok-okumasi', hareket: 'logo.malzeme-hareketleri-okumasi', fiyat: 'logo.son-alis-fiyatlari-okumasi',
} as const;
type Parca = keyof typeof KART_AYARLARI;

async function parcaAcik(db: Db, p: Parca): Promise<boolean> {
  return (await sistemAyariOku(db, 'logo.baglanti')) === true && (await sistemAyariOku(db, KART_AYARLARI[p])) === true;
}

async function kartKodlari(db: Db, stokKodu: string): Promise<{ malzemeNo: number; kod: string; logoKodu: string }> {
  const kod = stokKodu.trim().toUpperCase();
  const malzemeNo = await malzemeNoKoddan(db, kod);
  if (malzemeNo === null) throw bulunamadi('Malzeme kartı bulunamadı.');
  return { malzemeNo, kod, logoKodu: (await s.logoKodHaritasi(db, [kod])).get(kod) ?? kod };
}

const MIKTAR = /^-?\d+(\.\d+)?$/;

export async function kartBolumu(db: Db, stokKodu: string, gorur: { stok: boolean; fiyat: boolean }): Promise<LogoKartBolumuCevabi> {
  const k = await kartKodlari(db, stokKodu);
  const parcalar = {
    stok: gorur.stok && (await parcaAcik(db, 'stok')),
    hareket: gorur.stok && (await parcaAcik(db, 'hareket')),
    fiyat: gorur.stok && gorur.fiyat && (await parcaAcik(db, 'fiyat')),
  };
  if (!parcalar.stok) return { parcalar, logoKodu: k.logoKodu, stok: null };
  const imlec = await s.okumaImleci(db, 'stok');
  const logo = (await s.aynadakiStoklar(db, [k.logoKodu])).filter((x) => MIKTAR.test(x.miktar));
  const karsilastirma = kartStokKarsilastir(logo, await logoEsliDepoMiktarlari(db, k.malzemeNo), await s.ambarAdlari(db));
  return { parcalar, logoKodu: k.logoKodu, stok: { sonOkuma: imlec?.sonTamamMetni ?? null, ...karsilastirma } };
}

type Kapali = { durum: 'kapali' | 'ortam-degiskeni-yok'; ileti: string };
async function kapi(vt: TxAcan, kopru: KopruIstemcisi | null, stokKodu: string, p: 'hareket' | 'fiyat', ad: string):
  Promise<{ kopru: KopruIstemcisi; logoKodu: string } | Kapali> {
  const r = await vt.tx(async (db) => ({ acik: await parcaAcik(db, p), logoKodu: (await kartKodlari(db, stokKodu)).logoKodu }));
  if (!r.acik) return { durum: 'kapali', ileti: `Logo'dan ${ad} okuması Sistem Ayarları'nda kapalı.` };
  if (kopru === null) return { durum: 'ortam-degiskeni-yok', ileti: 'Logo bağlantı bilgileri sunucuda tanımlı değil; sistem yöneticisine haber verin.' };
  return { kopru, logoKodu: r.logoKodu };
}

const KART_YOK = 'Bu kart Logo\'da bulunamadı.';
const COK_HAREKET = 'Bu malzemenin Logo\'da çok hareketi var; son hareketleri görmek için Logo bilgisayarındaki yardımcı programın güncellenmesi gerekir.';

function hareketSatiri(h: LogoMalzemeHareketi): LogoKartHareketleriCevabi['kayitlar'][number] {
  return {
    logoKayitNo: h.logoKayitNo, tarih: h.tarih, fisTuru: h.fisTuru, fisAdi: hareketFisAdi(h.fisTuru), yon: hareketYonu(h.girisCikis),
    fisNo: h.fisNo, ambarNo: h.ambarNo, miktar: h.miktar, birim: h.birim,
  };
}

// Yeni yardımcı en yeniden geriye sayfa verir (3204). Eski yardımcı en eskiden başlar: en çok KART_HAREKET_ESKI_YOL_SAYFA_SINIRI sayfa okunur,
// son KART_HAREKET_SAYFASI gösterilir; daha fazlası varsa son hareketler bilinemez, uydurulmaz.
export async function kartHareketleri(vt: TxAcan, kopruVarsa: KopruIstemcisi | null, stokKodu: string, once: number | null): Promise<LogoKartHareketleriCevabi> {
  const g = await kapi(vt, kopruVarsa, stokKodu, 'hareket', 'malzeme hareketleri');
  if ('durum' in g) return { ...g, kayitlar: [], dahaEski: null };
  const r = await g.kopru.malzemeHareketleriGeriyeOku(g.logoKodu, once);
  if (r.tur !== 'basarili') return { durum: 'hata', ileti: r.ileti, kayitlar: [], dahaEski: null };
  if (r.veri === null) return { durum: 'kart-yok', ileti: KART_YOK, kayitlar: [], dahaEski: null };
  const gecerli = (h: LogoMalzemeHareketi) => MIKTAR.test(h.miktar);
  if (r.veri.geriye) {
    return { durum: 'tamam', ileti: null, kayitlar: r.veri.sayfa.kayitlar.filter(gecerli).map(hareketSatiri), dahaEski: r.veri.sayfa.sonraki };
  }
  const hepsi = [...r.veri.sayfa.kayitlar];
  let sonraki = r.veri.sayfa.sonraki;
  for (let sayfa = 1; sonraki !== null; sayfa++) {
    if (sayfa >= KART_HAREKET_ESKI_YOL_SAYFA_SINIRI) return { durum: 'hata', ileti: COK_HAREKET, kayitlar: [], dahaEski: null };
    const d = await g.kopru.malzemeHareketleriOku(g.logoKodu, sonraki);
    if (d.tur !== 'basarili') return { durum: 'hata', ileti: d.ileti, kayitlar: [], dahaEski: null };
    if (d.veri === null) return { durum: 'kart-yok', ileti: KART_YOK, kayitlar: [], dahaEski: null };
    hepsi.push(...d.veri.kayitlar);
    sonraki = d.veri.sonraki;
  }
  const eskiler = hepsi.filter((h) => once === null || h.logoKayitNo < once).sort((a, b) => b.logoKayitNo - a.logoKayitNo);
  const sayfa = eskiler.slice(0, KART_HAREKET_SAYFASI);
  const enEski = sayfa.at(-1);
  return {
    durum: 'tamam', ileti: null, kayitlar: sayfa.filter(gecerli).map(hareketSatiri),
    dahaEski: eskiler.length > KART_HAREKET_SAYFASI && enEski !== undefined ? enEski.logoKayitNo : null,
  };
}

// Tedarikçi adı Logo cari aynasından; aynada yoksa Logo cari kodu gösterilir.
export async function kartAlislari(vt: TxAcan, kopruVarsa: KopruIstemcisi | null, stokKodu: string): Promise<LogoKartAlislariCevabi> {
  const g = await kapi(vt, kopruVarsa, stokKodu, 'fiyat', 'son alış fiyatları');
  if ('durum' in g) return { ...g, kayitlar: [] };
  const r = await g.kopru.sonAlisFiyatlariOku(g.logoKodu);
  if (r.tur !== 'basarili') return { durum: 'hata', ileti: r.ileti, kayitlar: [] };
  if (r.veri === null) return { durum: 'kart-yok', ileti: KART_YOK, kayitlar: [] };
  const satirlar = r.veri.filter((a) => MIKTAR.test(a.miktar) && MIKTAR.test(a.fiyat) && (a.dovizFiyati === null || MIKTAR.test(a.dovizFiyati)));
  const kodlar = [...new Set(satirlar.map((a) => a.cariKodu).filter((c): c is string => c !== null))];
  const adlar = await vt.tx((db) => s.cariAdlari(db, kodlar));
  return {
    durum: 'tamam', ileti: null,
    kayitlar: satirlar.map((a) => ({
      logoKayitNo: a.logoKayitNo, tarih: a.tarih, tedarikci: a.cariKodu === null ? null : (adlar.get(a.cariKodu) ?? a.cariKodu),
      faturaNo: a.faturaNo, miktar: a.miktar, birim: a.birim, fiyat: a.fiyat, dovizTuru: a.dovizTuru, dovizFiyati: a.dovizFiyati,
    })),
  };
}
