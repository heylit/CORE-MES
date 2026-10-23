import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import {
  ARAC_EN_COK, DEMIRBAS_EN_COK, GOREV_EN_COK, GOREV_KAPANAN_GUN, KONTROL_EN_COK, MASRAF_EN_COK, PANO_EN_COK, SON_YER_EN_COK, YEMEK_GECMIS_GUN,
  type Arac, type AracEkleVerisi, type AracGorevi, type AracTalebiAcVerisi, type BugunCevabi,
  type Demirbas, type DemirbasEkleVerisi, type DemirbasGuncelleVerisi, type IadeVerisi, type Zimmet, type ZimmetleVerisi,
  type Masraf, type MasrafEkleVerisi, type MasraflarCevabi, type BugunIsi, type FirmaSecenekleriCevabi, type KisiSecenekleriCevabi, type Kontrol, type KontrolEkleVerisi,
  type KontrolGuncelleVerisi, type KontrolKaydi, type Talep, type TalepAcVerisi, type TalepPanosuCevabi, type TaleplerimSuzgeci,
  type YapildiVerisi, type YemekBildirVerisi, type YemekGunuCevabi,
} from '#paylasilan/sozlesme/idari-isler.ts';
import { numaraAl } from '../ayarlar/disari.ts';
import { gununFazlaMesaisi, izinliKisiler } from '../ik/disari.ts';
import { kisiAdlari, kisiSecenekleri } from '../kisiler/disari.ts';
import { firmaAdlari, firmaAra, firmaVarMi } from '../musteri-tedarikci/disari.ts';
import { basladigiGunTakvimleri, vardiyaKadrosu } from '../vardiya/disari.ts';
import {
  DEGER_GECERSIZ, DEMIRBAS_YOK, ZIMMET_BAGLI, ZIMMET_IADE_EDILMIS, ZIMMET_YOK, degerReddi, demirbasNo, elleDurumReddi, iadeReddi, iadeSonrasiDurum,
  zimmetlemeReddi,
  ARAC_DOLU, ARAC_VERILEMEZ, ARAC_YOK, BUGUN_GUN, FIRMA_YOK, GOREV_YOK, KISI_YOK, KONTROL_BITTI, KONTROL_YOK, MASRAF_IPTALLI, MASRAF_YOK,
  PLAKA_GECERSIZ, PLAKA_VAR,
  TALEP_YOK, YAKIN_GUN, aracBugundeMi, aracUyarilari, aracVerilemezMi, bugunSirasi, cikisKmReddi, donusKmReddi, gecisHedefi, gecisReddi,
  geriCekmeReddi, gorevGecisReddi, gorevTarihReddi, kmReddi, kontrolGrubu, masrafReddi, plakaBicimle, senden, yapildiSonucu,
  yemekBildirimReddi, yemekKadrosu, yemekSayisi, type GorevKomutu, type TalepKomutu, type YemekHesabi,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { AracSatiri, DemirbasSatiri, GorevSatiri, KontrolSatiri, MasrafSatiri, ZimmetSatiri, TalepSatiri, YemekSatiri } from './sorgular.ts';

const BUGUN_EN_COK = 100;

async function cevir(db: Db, satirlar: TalepSatiri[]): Promise<Talep[]> {
  const adlar = await kisiAdlari(db, satirlar.flatMap((s) => [s.acan_kisi_id, s.ustlenen_kisi_id, s.kapatan_kisi_id]).filter((k): k is number => k !== null));
  const ad = (id: number | null): string | null => (id === null ? null : adlar.get(id) ?? null);
  return satirlar.map((s) => ({
    id: s.id, no: s.no, kategori: s.kategori, yer: s.yer, aciklama: s.aciklama, aciliyet: s.aciliyet, durum: s.durum,
    acanKisiId: s.acan_kisi_id, acanAd: ad(s.acan_kisi_id), acilma: s.acilma,
    ustlenenKisiId: s.ustlenen_kisi_id, ustlenenAd: ad(s.ustlenen_kisi_id), ustlenme: s.ustlenme,
    kapatanAd: ad(s.kapatan_kisi_id), kapanma: s.kapanma, sonucNotu: s.sonuc_notu, surum: s.surum,
  }));
}

async function talep(db: Db, id: number): Promise<Talep> {
  const satir = await sorgular.talepGetir(db, id);
  if (satir === null) throw bulunamadi(TALEP_YOK);
  const [t] = await cevir(db, [satir]);
  if (t === undefined) throw new Error('Talep çevrilemedi');
  return t;
}

// IDR-01: talep komutu verenin adına açılır; açılma zamanı veritabanından.
// IDR-08: numara Sistem Ayarları'ndaki kalıptan, ortak sayaçla.
export async function talepAc(db: Db, kullanici: Kullanici, g: TalepAcVerisi): Promise<Talep> {
  const no = await numaraAl(db, 'idari-isler.talep-no', { varMi: (n) => sorgular.talepNoVarMi(db, n) });
  return talep(db, await sorgular.talepEkle(db, no, g, kullanici.id));
}

async function kilitle(db: Db, id: number, komut: TalepKomutu): Promise<{ acan_kisi_id: number }> {
  const mevcut = await sorgular.talepKilitle(db, id);
  if (mevcut === null) throw bulunamadi(TALEP_YOK);
  const ret = gecisReddi(mevcut.durum, komut);
  if (ret !== null) throw gecersiz(ret);
  return mevcut;
}

const surumlu = (db: Db, id: number, guncelle: () => Promise<{ id: number } | null>) =>
  surumluGuncelle({ guncelle, varMi: () => sorgular.talepVarMi(db, id), bulunamadiIletisi: TALEP_YOK });

// IDR-07: başkasına atanan kişi etkin olmalı.
async function atanabilirMi(db: Db, kisiId: number): Promise<boolean> {
  return (await kisiSecenekleri(db)).some((k) => k.id === kisiId);
}

export async function ustlen(db: Db, kullanici: Kullanici, id: number, surum: number, kisiId: number | null): Promise<Talep> {
  await kilitle(db, id, 'ustlen');
  const ustlenen = kisiId ?? kullanici.id;
  if (ustlenen !== kullanici.id && !(await atanabilirMi(db, ustlenen))) throw dogrulama(KISI_YOK, 'kisiId');
  await surumlu(db, id, () => sorgular.ustlenmeYaz(db, id, surum, ustlenen));
  return talep(db, id);
}

export async function birak(db: Db, id: number, surum: number): Promise<Talep> {
  await kilitle(db, id, 'birak');
  await surumlu(db, id, () => sorgular.birakmaYaz(db, id, surum));
  return talep(db, id);
}

export async function kapat(db: Db, kullanici: Kullanici, id: number, surum: number, not: string | null, komut: 'kapat' | 'reddet'): Promise<Talep> {
  await kilitle(db, id, komut);
  const hedef = gecisHedefi(komut) as 'kapandi' | 'reddedildi';
  await surumlu(db, id, () => sorgular.kapanisYaz(db, id, surum, hedef, kullanici.id, not));
  return talep(db, id);
}

// IDR-03: kendi talebi değilse yok sayılır (başkasının talebinin varlığı sızmaz).
export async function geriCek(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<Talep> {
  const mevcut = await sorgular.talepKilitle(db, id);
  if (mevcut === null || geriCekmeReddi(mevcut.acan_kisi_id, kullanici.id) !== null) throw bulunamadi(TALEP_YOK);
  await kilitle(db, id, 'geri-cek');
  await surumlu(db, id, () => sorgular.kapanisYaz(db, id, surum, 'geri_cekildi', kullanici.id, null));
  return talep(db, id);
}

export async function pano(db: Db): Promise<TalepPanosuCevabi> {
  const [yeni, yapiliyor, kapanan, sayilar] = [
    await sorgular.acikTalepler(db, 'yeni', PANO_EN_COK),
    await sorgular.acikTalepler(db, 'yapiliyor', PANO_EN_COK),
    await sorgular.sonKapananlar(db, PANO_EN_COK),
    await sorgular.panoSayilari(db),
  ];
  return {
    yeni: { talepler: await cevir(db, yeni), toplam: sayilar.yeni },
    yapiliyor: { talepler: await cevir(db, yapiliyor), toplam: sayilar.yapiliyor },
    kapanan: { talepler: await cevir(db, kapanan), toplam: sayilar.kapanan },
  };
}

export async function taleplerim(db: Db, kullanici: Kullanici, sorgu: TaleplerimSuzgeci): Promise<SayfaliListe<Talep>> {
  const durum = sorgu.durum ?? null;
  return sayfaliListe(sorgu, {
    say: () => sorgular.kendiTalepSayisi(db, kullanici.id, durum),
    satirlar: async (dilim) => cevir(db, await sorgular.kendiTalepleri(db, kullanici.id, durum, sorgu, dilim)),
  });
}

export async function sonYerler(db: Db, kullanici: Kullanici): Promise<string[]> {
  return sorgular.sonYerler(db, kullanici.id, SON_YER_EN_COK);
}

export async function atanabilirKisiler(db: Db): Promise<KisiSecenekleriCevabi> {
  return { kisiler: (await kisiSecenekleri(db)).map((k) => ({ id: k.id, ad: k.ad })) };
}

export async function bugun(db: Db, kullanici: Kullanici): Promise<BugunCevabi> {
  const talepler = (await cevir(db, await sorgular.bugunTalepleri(db, kullanici.id, BUGUN_EN_COK))).filter((t) => senden(t, kullanici.id));
  const kontroller = await kontrolCevir(db, await sorgular.yaklasanKontroller(db, BUGUN_GUN, BUGUN_EN_COK));
  const tumAraclar = await araclar(db);
  const isler: BugunIsi[] = [
    ...talepler.map((t) => ({ tur: 'talep' as const, talep: t })),
    ...kontroller.map((k) => ({ tur: 'kontrol' as const, kontrol: k })),
    ...tumAraclar.filter((a) => aracBugundeMi(a.uyarilar)).map((a) => ({ tur: 'arac' as const, arac: a })),
  ].sort(bugunSirasi);
  const s = await sorgular.bugunSayilari(db);
  const k = await sorgular.kontrolSayilari(db, YAKIN_GUN, BUGUN_GUN);
  return {
    isler,
    sayilar: {
      acikTalep: s.acik_talep, acilTalep: s.acil_talep, bugunAcilan: s.bugun_acilan, bugunKapanan: s.bugun_kapanan,
      gecenKontrol: k.gecen, yakinKontrol: k.yakin, aracUyarisi: tumAraclar.filter((a) => a.uyarilar.length > 0).length,
    },
  };
}

// Sayaç: oku olmayan Bugün, pano ve periyodik sayısını, talep-ac olmayan kendi sayısını görmez (null). Periyodik sayacı süresi geçenlerdir;
// yemek sayacı, bildirme işlemi olana bugünün sayısı bildirilmediyse 1'dir; filo sayacı süresi ya da km'si geçmiş uyarılı araçlardır.
// Araç görevleri sayacı onay bekleyenler, araç taleplerim sayacı kişinin açık (bekleyen, onaylı, yolda) talepleridir.
export async function menuSayaclari(db: Db, kullanici: Kullanici): Promise<Record<string, number | null>> {
  const okur = islemVarMi(kullanici, 'idari-isler.oku');
  const acar = islemVarMi(kullanici, 'idari-isler.talep-ac');
  const aracAcar = islemVarMi(kullanici, 'idari-isler.arac-talebi-ac');
  const yemekYazar = okur && islemVarMi(kullanici, 'idari-isler.yemek-yaz');
  const g = okur || aracAcar ? await sorgular.gorevSayilari(db, kullanici.id) : null;
  const gorevSayaclari = { 'arac-gorevleri': okur && g !== null ? g.bekleyen : null, 'arac-taleplerim': aracAcar && g !== null ? g.kendi : null };
  if (!okur && !acar) return { bugun: null, talepler: null, taleplerim: null, periyodik: null, yemek: null, filo: null, ...gorevSayaclari };
  const s = await sorgular.menuSayilari(db, kullanici.id);
  const k = okur ? await sorgular.kontrolSayilari(db, YAKIN_GUN, BUGUN_GUN) : null;
  const a = okur ? await araclar(db) : null;
  return {
    bugun: k === null || a === null ? null : s.bugun + k.bugun + a.filter((x) => aracBugundeMi(x.uyarilar)).length,
    talepler: okur ? s.acik : null,
    taleplerim: acar ? s.kendi : null,
    periyodik: k === null ? null : k.gecen,
    yemek: yemekYazar ? (await sorgular.bugunYemekBildirildiMi(db) ? 0 : 1) : null,
    filo: a === null ? null : a.filter((x) => x.uyarilar.some((u) => u.gecti)).length,
    ...gorevSayaclari,
  };
}

async function kontrolCevir(db: Db, satirlar: KontrolSatiri[]): Promise<Kontrol[]> {
  const adlar = await firmaAdlari(db, satirlar.map((s) => s.firma_id).filter((f): f is number => f !== null));
  return satirlar.map((s) => ({
    id: s.id, ad: s.ad, tur: s.tur, siklikDeger: s.siklik_deger, siklikBirim: s.siklik_birim, sonrakiTarih: s.sonraki_tarih,
    grup: kontrolGrubu(s.kalan_gun), kalanGun: s.kalan_gun, firmaId: s.firma_id, firmaAd: s.firma_id === null ? null : adlar.get(s.firma_id) ?? null,
    aciklama: s.aciklama, aktif: s.aktif, surum: s.surum,
  }));
}

async function kontrol(db: Db, id: number): Promise<Kontrol> {
  const satir = await sorgular.kontrolGetir(db, id);
  if (satir === null) throw bulunamadi(KONTROL_YOK);
  const [k] = await kontrolCevir(db, [satir]);
  if (k === undefined) throw new Error('Kontrol çevrilemedi');
  return k;
}

// Seçilen firma var ve etkin olmalı; kalemde zaten duran firma pasifleşmiş olsa da korunur.
async function firmaDenetle(db: Db, firmaId: number | null, mevcut: number | null = null): Promise<void> {
  if (firmaId === null || firmaId === mevcut) return;
  const f = await firmaVarMi(db, firmaId);
  if (!f.var || !f.aktif) throw dogrulama(FIRMA_YOK, 'firmaId');
}

async function kontrolKilitle(db: Db, id: number): Promise<KontrolSatiri> {
  const mevcut = await sorgular.kontrolKilitle(db, id);
  if (mevcut === null) throw bulunamadi(KONTROL_YOK);
  if (!mevcut.aktif) throw gecersiz(KONTROL_BITTI);
  return mevcut;
}

const kontrolSurumlu = (db: Db, id: number, guncelle: () => Promise<{ id: number } | null>) =>
  surumluGuncelle({ guncelle, varMi: () => sorgular.kontrolVarMi(db, id), bulunamadiIletisi: KONTROL_YOK });

export async function kontrolEkle(db: Db, kullanici: Kullanici, g: KontrolEkleVerisi): Promise<Kontrol> {
  await firmaDenetle(db, g.firmaId);
  return kontrol(db, await sorgular.kontrolEkle(db, g, kullanici.id));
}

export async function kontrolGuncelle(db: Db, id: number, g: KontrolGuncelleVerisi): Promise<Kontrol> {
  const mevcut = await kontrolKilitle(db, id);
  await firmaDenetle(db, g.firmaId, mevcut.firma_id);
  await kontrolSurumlu(db, id, () => sorgular.kontrolGuncelle(db, id, g));
  return kontrol(db, id);
}

// IDR-13: kayıt eklenir, sonraki tarih kayıttan ya da sıklıktan; firma boşsa kalemin firması yazılır.
export async function yapildi(db: Db, kullanici: Kullanici, id: number, g: YapildiVerisi): Promise<Kontrol> {
  const mevcut = await kontrolKilitle(db, id);
  const sonuc = yapildiSonucu({ tur: mevcut.tur, siklikDeger: mevcut.siklik_deger, siklikBirim: mevcut.siklik_birim }, g, await sorgular.bugunTarihi(db));
  if ('ileti' in sonuc) throw dogrulama(sonuc.ileti, sonuc.alan);
  await firmaDenetle(db, g.firmaId, mevcut.firma_id);
  await kontrolSurumlu(db, id, () => sorgular.yapildiYaz(db, id, g.surum, {
    yapilma: g.yapilma, oncekiTarih: mevcut.sonraki_tarih, sonrakiTarih: sonuc.sonraki, belgeNo: g.belgeNo, not: g.not,
    miktar: g.miktar, birim: g.birim, firmaId: g.firmaId ?? mevcut.firma_id,
  }, kullanici.id));
  return kontrol(db, id);
}

export async function bitir(db: Db, kullanici: Kullanici, id: number, surum: number, neden: string | null): Promise<Kontrol> {
  await kontrolKilitle(db, id);
  await kontrolSurumlu(db, id, () => sorgular.bitisYaz(db, id, surum, kullanici.id, neden));
  return kontrol(db, id);
}

export async function kontroller(db: Db): Promise<Kontrol[]> {
  return kontrolCevir(db, await sorgular.etkinKontroller(db, KONTROL_EN_COK));
}

const KAYIT_EN_COK = 100;
export async function kontrolKayitlari(db: Db, id: number): Promise<KontrolKaydi[]> {
  if (!(await sorgular.kontrolVarMi(db, id))) throw bulunamadi(KONTROL_YOK);
  const satirlar = await sorgular.kontrolKayitlari(db, id, KAYIT_EN_COK);
  const firmalar = await firmaAdlari(db, satirlar.map((s) => s.firma_id).filter((f): f is number => f !== null));
  const kisiler = await kisiAdlari(db, satirlar.map((s) => s.kaydeden_kisi_id));
  return satirlar.map((s) => ({
    id: s.id, yapilma: s.yapilma, oncekiTarih: s.onceki_tarih, sonrakiTarih: s.sonraki_tarih, belgeNo: s.belge_no, not: s.not_metni,
    miktar: s.miktar, birim: s.birim, firmaAd: s.firma_id === null ? null : firmalar.get(s.firma_id) ?? null,
    kaydedenAd: kisiler.get(s.kaydeden_kisi_id) ?? null, kayit: s.kayit,
  }));
}

// Kontrol, atık ve sözleşme firması hizmet aldığımız firmadır: tedarikçi ve iki yönlü firmalar.
const FIRMA_SECIM_EN_COK = 30;
export async function firmaSecenekleri(db: Db, ara: string): Promise<FirmaSecenekleriCevabi> {
  return { firmalar: (await firmaAra(db, { metin: ara, sinir: FIRMA_SECIM_EN_COK, tur: 'tedarikci' })).map((f) => ({ id: f.id, ad: f.ad })) };
}

// IDR-18: kadro Vardiya'dan (vardiya kadrosundaki ve o gün vardiyası başlayan kişiler), izinli ve fazla mesai İK'dan.
async function gununKadrosu(db: Db, tarih: string): Promise<YemekHesabi> {
  const kisiler = [...new Set((await vardiyaKadrosu(db)).flatMap((s) => s.kisiIdleri))];
  const takvim = kisiler.length === 0
    ? new Map()
    : await basladigiGunTakvimleri(db, kisiler.map((id) => ({ tur: 'kisi' as const, id })), { baslangic: tarih, bitis: tarih });
  const calisanlar = kisiler.filter((id) => (takvim.get(`kisi:${id}`)?.get(tarih)?.araliklar.length ?? 0) > 0);
  return yemekKadrosu(calisanlar, await izinliKisiler(db, tarih), await gununFazlaMesaisi(db, tarih));
}

function yemekCevir(s: YemekSatiri, adlar: ReadonlyMap<number, string>) {
  return {
    id: s.id, tarih: s.tarih, kadro: s.kadro, izinli: s.izinli, fazlaMesai: s.fazla_mesai, ziyaretci: s.ziyaretci, duzeltme: s.duzeltme,
    duzeltmeNedeni: s.duzeltme_nedeni, sayi: s.sayi, bildirenAd: adlar.get(s.bildiren_kisi_id) ?? null, bildirim: s.bildirim,
  };
}

export async function yemekGunu(db: Db, tarih: string | null): Promise<YemekGunuCevabi> {
  const bugun = await sorgular.bugunTarihi(db);
  const gun = tarih ?? bugun;
  const hesap = await gununKadrosu(db, gun);
  const son = await sorgular.sonYemekBildirimi(db, gun);
  const gecmis = await sorgular.yemekGecmisi(db, gun, YEMEK_GECMIS_GUN);
  const adlar = await kisiAdlari(db, son === null ? [] : [son.bildiren_kisi_id]);
  return {
    tarih: gun, bugun, kadro: hesap.kadro, izinli: hesap.izinli, fazlaMesai: hesap.fazlaMesai,
    son: son === null ? null : yemekCevir(son, adlar),
    gecmis: gecmis.map((g) => ({ tarih: g.tarih, hesaplanan: g.sayi - g.duzeltme, sayi: g.sayi })),
  };
}

// IDR-16, IDR-17: kadro, izinli ve fazla mesai sunucuda yeniden hesaplanır; kayıt hesabın kendisini taşır, gerekçe yalnız düzeltmeyle yazılır.
export async function yemekBildir(db: Db, kullanici: Kullanici, g: YemekBildirVerisi): Promise<YemekGunuCevabi> {
  const hesap = await gununKadrosu(db, g.tarih);
  const ret = yemekBildirimReddi(g, hesap, await sorgular.bugunTarihi(db));
  if (ret !== null) throw dogrulama(ret.ileti, ret.alan);
  await sorgular.yemekBildirimiEkle(db, {
    tarih: g.tarih, kadro: g.kadro, izinli: g.izinli, fazlaMesai: g.fazlaMesai, ziyaretci: g.ziyaretci, duzeltme: g.duzeltme,
    neden: g.duzeltme === 0 ? null : g.duzeltmeNedeni, sayi: yemekSayisi(g),
  }, kullanici.id);
  return yemekGunu(db, g.tarih);
}

async function aracCevir(db: Db, satirlar: AracSatiri[]): Promise<Arac[]> {
  const bugun = await sorgular.bugunTarihi(db);
  return satirlar.map((s) => {
    const oz = {
      durum: s.durum, km: s.km, sonrakiBakimKm: s.sonraki_bakim_km, muayeneTarihi: s.muayene_tarihi, sigortaTarihi: s.sigorta_tarihi,
    };
    return {
      id: s.id, plaka: s.plaka, tur: s.tur, markaModel: s.marka_model, sahiplik: s.sahiplik, ...oz, sevkiyatta: s.sevkiyatta,
      aciklama: s.aciklama, uyarilar: aracUyarilari(oz, bugun), surum: s.surum,
    };
  });
}

async function arac(db: Db, id: number): Promise<Arac> {
  const satir = await sorgular.aracGetir(db, id);
  if (satir === null) throw bulunamadi(ARAC_YOK);
  const [a] = await aracCevir(db, [satir]);
  if (a === undefined) throw new Error('Araç çevrilemedi');
  return a;
}

export async function araclar(db: Db): Promise<Arac[]> {
  return aracCevir(db, await sorgular.araclar(db, ARAC_EN_COK));
}

// IDR-20: plaka biçimlenir ve tekildir.
async function plakaDenetle(db: Db, plaka: string, haric: number | null): Promise<string> {
  const bicimli = plakaBicimle(plaka);
  if (bicimli === null) throw dogrulama(PLAKA_GECERSIZ, 'plaka');
  if (await sorgular.plakaBaskasinda(db, bicimli, haric)) throw dogrulama(PLAKA_VAR, 'plaka');
  return bicimli;
}

export async function aracEkle(db: Db, kullanici: Kullanici, g: AracEkleVerisi): Promise<Arac> {
  const plaka = await plakaDenetle(db, g.plaka, null);
  return arac(db, await sorgular.aracEkle(db, { ...g, plaka }, kullanici.id));
}

// IDR-21: km geriye yazılmaz.
export async function aracGuncelle(db: Db, id: number, g: AracEkleVerisi & { surum: number }): Promise<Arac> {
  const mevcut = await sorgular.aracKilitle(db, id);
  if (mevcut === null) throw bulunamadi(ARAC_YOK);
  const plaka = await plakaDenetle(db, g.plaka, id);
  const ret = kmReddi(mevcut.km, g.km);
  if (ret !== null) throw dogrulama(ret, 'km');
  await surumluGuncelle({
    guncelle: () => sorgular.aracGuncelle(db, id, g.surum, { ...g, plaka }),
    varMi: () => sorgular.aracVarMi(db, id),
    bulunamadiIletisi: ARAC_YOK,
  });
  return arac(db, id);
}

async function gorevCevir(db: Db, satirlar: GorevSatiri[]): Promise<AracGorevi[]> {
  const adlar = await kisiAdlari(db, satirlar.flatMap((s) => [s.talep_eden_kisi_id, s.onaylayan_kisi_id]).filter((k): k is number => k !== null));
  return satirlar.map((s) => ({
    id: s.id, talepEdenKisiId: s.talep_eden_kisi_id, talepEdenAd: adlar.get(s.talep_eden_kisi_id) ?? null, amac: s.amac, varis: s.varis,
    tarih: s.tarih, donusTarihi: s.donus_tarihi, aciklama: s.aciklama, durum: s.durum, talep: s.talep, aracId: s.arac_id, plaka: s.plaka,
    onaylayanAd: s.onaylayan_kisi_id === null ? null : adlar.get(s.onaylayan_kisi_id) ?? null, onay: s.onay, redNedeni: s.red_nedeni,
    cikisKm: s.cikis_km, cikis: s.cikis, donusKm: s.donus_km, donus: s.donus, kapanma: s.kapanma, surum: s.surum,
  }));
}

async function gorev(db: Db, id: number): Promise<AracGorevi> {
  const satir = await sorgular.gorevGetir(db, id);
  if (satir === null) throw bulunamadi(GOREV_YOK);
  const [g] = await gorevCevir(db, [satir]);
  if (g === undefined) throw new Error('Görev çevrilemedi');
  return g;
}

async function gorevKilitle(db: Db, id: number, komut: GorevKomutu): Promise<sorgular.GorevKilidi> {
  const mevcut = await sorgular.gorevKilitle(db, id);
  if (mevcut === null) throw bulunamadi(GOREV_YOK);
  const ret = gorevGecisReddi(mevcut.durum, komut);
  if (ret !== null) throw gecersiz(ret);
  return mevcut;
}

const gorevSurumlu = (db: Db, id: number, guncelle: () => Promise<{ id: number } | null>) =>
  surumluGuncelle({ guncelle, varMi: () => sorgular.gorevVarMi(db, id), bulunamadiIletisi: GOREV_YOK });

// IDR-24: talep komutu verenin adına açılır.
export async function aracTalebiAc(db: Db, kullanici: Kullanici, g: AracTalebiAcVerisi): Promise<AracGorevi> {
  const ret = gorevTarihReddi(g, await sorgular.bugunTarihi(db));
  if (ret !== null) throw dogrulama(ret.ileti, ret.alan);
  return gorev(db, await sorgular.gorevEkle(db, g, kullanici.id));
}

// Kendi talebi değilse yok sayılır (başkasının talebinin varlığı sızmaz).
export async function gorevGeriCek(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<AracGorevi> {
  const mevcut = await sorgular.gorevKilitle(db, id);
  if (mevcut === null || mevcut.talep_eden_kisi_id !== kullanici.id) throw bulunamadi(GOREV_YOK);
  await gorevKilitle(db, id, 'geri-cek');
  await gorevSurumlu(db, id, () => sorgular.gorevKapanisYaz(db, id, surum, 'geri_cekildi', kullanici.id, null));
  return gorev(db, id);
}

// IDR-25: verilen araç var, pasif ya da serviste değil ve bu tarihlerde başka onaylı ya da yoldaki görevde değil.
export async function gorevOnayla(db: Db, kullanici: Kullanici, id: number, surum: number, aracId: number): Promise<AracGorevi> {
  const mevcut = await gorevKilitle(db, id, 'onayla');
  const a = await sorgular.aracKilitle(db, aracId);
  if (a === null) throw dogrulama(ARAC_YOK, 'aracId');
  if (aracVerilemezMi(a.durum)) throw dogrulama(ARAC_VERILEMEZ, 'aracId');
  if (await sorgular.aracCakisiyorMu(db, aracId, mevcut.tarih, mevcut.donus_tarihi, id)) throw dogrulama(ARAC_DOLU, 'aracId');
  await gorevSurumlu(db, id, () => sorgular.gorevOnayYaz(db, id, surum, aracId, kullanici.id));
  return gorev(db, id);
}

export async function gorevReddet(db: Db, kullanici: Kullanici, id: number, surum: number, neden: string): Promise<AracGorevi> {
  await gorevKilitle(db, id, 'reddet');
  await gorevSurumlu(db, id, () => sorgular.gorevKapanisYaz(db, id, surum, 'reddedildi', kullanici.id, neden));
  return gorev(db, id);
}

// IDR-26: çıkışta araç görevde olur ve km'si çıkış km'sine çıkar; çıkış km'si aracın km'sinden küçük olmaz.
export async function gorevCikis(db: Db, id: number, surum: number, km: number): Promise<AracGorevi> {
  const mevcut = await gorevKilitle(db, id, 'cikis');
  const aracId = mevcut.arac_id;
  if (aracId === null) throw new Error('Onaylı görevin aracı yok');
  const a = await sorgular.aracKilitle(db, aracId);
  if (a === null) throw bulunamadi(ARAC_YOK);
  if (aracVerilemezMi(a.durum)) throw gecersiz(ARAC_VERILEMEZ);
  const ret = cikisKmReddi(a.km, km);
  if (ret !== null) throw dogrulama(ret, 'km');
  await gorevSurumlu(db, id, () => sorgular.gorevCikisYaz(db, id, surum, km));
  await sorgular.aracGorevYaz(db, aracId, km, 'gorevde');
  return gorev(db, id);
}

// IDR-26: dönüşte aracın km'si dönüş km'si olur; yolda başka görevi kalmayan araç müsaite döner.
export async function gorevDonus(db: Db, kullanici: Kullanici, id: number, surum: number, km: number): Promise<AracGorevi> {
  const mevcut = await gorevKilitle(db, id, 'donus');
  const aracId = mevcut.arac_id;
  if (aracId === null || mevcut.cikis_km === null) throw new Error('Yoldaki görevin aracı ya da çıkış km\'si yok');
  const ret = donusKmReddi(mevcut.cikis_km, km);
  if (ret !== null) throw dogrulama(ret, 'km');
  const a = await sorgular.aracKilitle(db, aracId);
  if (a === null) throw bulunamadi(ARAC_YOK);
  await gorevSurumlu(db, id, () => sorgular.gorevDonusYaz(db, id, surum, km, kullanici.id));
  const baskaYolda = await sorgular.aracYoldaBaskaGorevVarMi(db, aracId, id);
  await sorgular.aracGorevYaz(db, aracId, km, a.durum === 'gorevde' && !baskaYolda ? 'musait' : a.durum);
  return gorev(db, id);
}

export async function aracGorevleri(db: Db): Promise<AracGorevi[]> {
  return gorevCevir(db, await sorgular.gorevler(db, GOREV_KAPANAN_GUN, GOREV_EN_COK));
}

export async function aracTaleplerim(db: Db, kullanici: Kullanici): Promise<AracGorevi[]> {
  return gorevCevir(db, await sorgular.kendiGorevleri(db, kullanici.id, GOREV_EN_COK));
}

async function masrafCevir(db: Db, satirlar: MasrafSatiri[]): Promise<Masraf[]> {
  const adlar = await kisiAdlari(db, satirlar.map((s) => s.kaydeden_kisi_id));
  return satirlar.map((s) => ({
    id: s.id, aracId: s.arac_id, tarih: s.tarih, tur: s.tur, tutar: s.tutar, km: s.km, belgeNo: s.belge_no, aciklama: s.aciklama,
    kaydedenAd: adlar.get(s.kaydeden_kisi_id) ?? null, kayit: s.kayit, iptal: s.iptal, iptalNedeni: s.iptal_nedeni, surum: s.surum,
  }));
}

async function masraf(db: Db, id: number): Promise<Masraf> {
  const satir = await sorgular.masrafGetir(db, id);
  if (satir === null) throw bulunamadi(MASRAF_YOK);
  const [m] = await masrafCevir(db, [satir]);
  if (m === undefined) throw new Error('Masraf çevrilemedi');
  return m;
}

export async function aracMasraflari(db: Db, aracId: number): Promise<MasraflarCevabi> {
  if (!(await sorgular.aracVarMi(db, aracId))) throw bulunamadi(ARAC_YOK);
  return {
    masraflar: await masrafCevir(db, await sorgular.aracMasraflari(db, aracId, MASRAF_EN_COK)),
    yilToplami: await sorgular.aracYilToplami(db, aracId),
  };
}

// IDR-27: tutar ve tarih sunucuda denetlenir; kaydeden sunucudan. Pasif araca da geçmiş masraf yazılır.
export async function masrafEkle(db: Db, kullanici: Kullanici, aracId: number, g: MasrafEkleVerisi): Promise<Masraf> {
  if (!(await sorgular.aracVarMi(db, aracId))) throw bulunamadi(ARAC_YOK);
  const ret = masrafReddi(g, await sorgular.bugunTarihi(db));
  if (ret !== null) throw dogrulama(ret.ileti, ret.alan);
  return masraf(db, await sorgular.masrafEkle(db, aracId, g, kullanici.id));
}

// IDR-28: kayıt değişmez; yalnız gerekçeyle bir kez iptal edilir.
export async function masrafIptal(db: Db, kullanici: Kullanici, id: number, surum: number, neden: string): Promise<Masraf> {
  const mevcut = await sorgular.masrafKilitle(db, id);
  if (mevcut === null) throw bulunamadi(MASRAF_YOK);
  if (mevcut.iptal !== null) throw gecersiz(MASRAF_IPTALLI);
  await surumluGuncelle({
    guncelle: () => sorgular.masrafIptalYaz(db, id, surum, kullanici.id, neden),
    varMi: () => sorgular.masrafVarMi(db, id),
    bulunamadiIletisi: MASRAF_YOK,
  });
  return masraf(db, id);
}

async function zimmetCevir(db: Db, satirlar: ZimmetSatiri[]): Promise<Zimmet[]> {
  const adlar = await kisiAdlari(db, satirlar.flatMap((s) => [s.kisi_id, s.veren_kisi_id, s.iade_alan_kisi_id]).filter((k): k is number => k !== null));
  const ad = (k: number | null) => (k === null ? null : adlar.get(k) ?? null);
  return satirlar.map((s) => ({
    id: s.id, demirbasId: s.demirbas_id, kisiId: s.kisi_id, kisiAd: ad(s.kisi_id), personelAdi: s.personel_adi, verilis: s.verilis, iade: s.iade,
    iadeDurumu: s.iade_durumu, iadeNotu: s.iade_notu, aciklama: s.aciklama, verenAd: ad(s.veren_kisi_id), iadeAlanAd: ad(s.iade_alan_kisi_id),
    ikdenTasindi: s.ikden_tasindi, surum: s.surum,
  }));
}

async function demirbasCevir(db: Db, satirlar: DemirbasSatiri[]): Promise<Demirbas[]> {
  const acik = await zimmetCevir(db, await sorgular.acikZimmetler(db, satirlar.map((s) => s.id)));
  const zimmetler = new Map(acik.map((z) => [z.demirbasId, z]));
  return satirlar.map((s) => ({
    id: s.id, no: demirbasNo(s.id), tur: s.tur, markaModel: s.marka_model, seriNo: s.seri_no, deger: s.deger, durum: s.durum, aciklama: s.aciklama,
    acikZimmet: zimmetler.get(s.id) ?? null, surum: s.surum,
  }));
}

async function demirbas(db: Db, id: number): Promise<Demirbas> {
  const satir = await sorgular.demirbasGetir(db, id);
  if (satir === null) throw bulunamadi(DEMIRBAS_YOK);
  const [d] = await demirbasCevir(db, [satir]);
  if (d === undefined) throw new Error('Demirbaş çevrilemedi');
  return d;
}

async function zimmet(db: Db, id: number): Promise<Zimmet> {
  const satir = await sorgular.zimmetGetir(db, id);
  if (satir === null) throw bulunamadi(ZIMMET_YOK);
  const [z] = await zimmetCevir(db, [satir]);
  if (z === undefined) throw new Error('Zimmet çevrilemedi');
  return z;
}

export async function demirbaslar(db: Db): Promise<Demirbas[]> {
  return demirbasCevir(db, await sorgular.demirbaslar(db, DEMIRBAS_EN_COK));
}

export async function demirbasZimmetleri(db: Db, id: number): Promise<Zimmet[]> {
  if (!(await sorgular.demirbasVarMi(db, id))) throw bulunamadi(DEMIRBAS_YOK);
  return zimmetCevir(db, await sorgular.demirbasZimmetleri(db, id));
}

// IDR-29: değer sunucuda denetlenir; açan sunucudan.
export async function demirbasEkle(db: Db, kullanici: Kullanici, g: DemirbasEkleVerisi): Promise<Demirbas> {
  if (degerReddi(g.deger) !== null) throw dogrulama(DEGER_GECERSIZ, 'deger');
  return demirbas(db, await sorgular.demirbasEkle(db, g, kullanici.id));
}

// IDR-30: zimmetli demirbaşın durumu elle değişmez; hurda son durumdur.
export async function demirbasGuncelle(db: Db, id: number, g: DemirbasGuncelleVerisi): Promise<Demirbas> {
  const mevcut = await sorgular.demirbasKilitle(db, id);
  if (mevcut === null) throw bulunamadi(DEMIRBAS_YOK);
  if (degerReddi(g.deger) !== null) throw dogrulama(DEGER_GECERSIZ, 'deger');
  const ret = g.durum === null ? null : elleDurumReddi(mevcut.durum, g.durum);
  if (ret !== null) throw gecersiz(ret);
  await surumluGuncelle({
    guncelle: () => sorgular.demirbasGuncelle(db, id, g.surum, { ...g, durum: g.durum ?? mevcut.durum }),
    varMi: () => sorgular.demirbasVarMi(db, id),
    bulunamadiIletisi: DEMIRBAS_YOK,
  });
  return demirbas(db, id);
}

// IDR-30: yalnız boştaki demirbaş, etkin bir kişiye zimmetlenir; demirbaş aynı işlemde zimmetli olur.
export async function zimmetle(db: Db, kullanici: Kullanici, id: number, g: ZimmetleVerisi): Promise<Demirbas> {
  const mevcut = await sorgular.demirbasKilitle(db, id);
  if (mevcut === null) throw bulunamadi(DEMIRBAS_YOK);
  const ret = zimmetlemeReddi(mevcut.durum, g.verilis, await sorgular.bugunTarihi(db));
  if (ret !== null) throw dogrulama(ret.ileti, ret.alan);
  if (!(await atanabilirMi(db, g.kisiId))) throw dogrulama(KISI_YOK, 'kisiId');
  await surumluGuncelle({
    guncelle: () => sorgular.demirbasSurumluDurumYaz(db, id, g.surum, 'zimmetli'),
    varMi: () => sorgular.demirbasVarMi(db, id),
    bulunamadiIletisi: DEMIRBAS_YOK,
  });
  await sorgular.zimmetEkle(db, id, g, kullanici.id);
  return demirbas(db, id);
}

async function acikZimmetKilitle(db: Db, id: number): Promise<ZimmetSatiri> {
  const mevcut = await sorgular.zimmetKilitle(db, id);
  if (mevcut === null) throw bulunamadi(ZIMMET_YOK);
  if (mevcut.iade !== null) throw gecersiz(ZIMMET_IADE_EDILMIS);
  return mevcut;
}

// IDR-31: iade sağlamsa demirbaş boşa, hasarlıysa bakıma, kayıpsa kayba düşer; iadeyi alan sunucudan.
export async function zimmetIade(db: Db, kullanici: Kullanici, id: number, g: IadeVerisi): Promise<Zimmet> {
  const mevcut = await acikZimmetKilitle(db, id);
  const ret = iadeReddi(mevcut.verilis, g.iade, await sorgular.bugunTarihi(db));
  if (ret !== null) throw dogrulama(ret, 'iade');
  await surumluGuncelle({
    guncelle: () => sorgular.zimmetIadeYaz(db, id, g.surum, g, kullanici.id),
    varMi: () => sorgular.zimmetVarMi(db, id),
    bulunamadiIletisi: ZIMMET_YOK,
  });
  await sorgular.demirbasDurumYaz(db, mevcut.demirbas_id, iadeSonrasiDurum(g.iadeDurumu));
  return zimmet(db, id);
}

// IDR-32: İK'dan kişisiz gelen zimmet bir kez etkin kişiye bağlanır.
export async function zimmetKisiyeBagla(db: Db, id: number, surum: number, kisiId: number): Promise<Zimmet> {
  const mevcut = await sorgular.zimmetKilitle(db, id);
  if (mevcut === null) throw bulunamadi(ZIMMET_YOK);
  if (mevcut.kisi_id !== null) throw gecersiz(ZIMMET_BAGLI);
  if (!(await atanabilirMi(db, kisiId))) throw dogrulama(KISI_YOK, 'kisiId');
  await surumluGuncelle({
    guncelle: () => sorgular.zimmetKisiYaz(db, id, surum, kisiId),
    varMi: () => sorgular.zimmetVarMi(db, id),
    bulunamadiIletisi: ZIMMET_YOK,
  });
  return zimmet(db, id);
}
