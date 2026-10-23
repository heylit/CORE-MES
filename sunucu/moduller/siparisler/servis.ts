import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { SIPARIS_OZETI_AY, YAKLASAN_TERMIN_GUN, siparisEkleGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type {
  MalzemeSecenekleriCevabi, Siparis, SiparisAyrintisi, SiparisOzetiCevabi, SiparisDurumu, SiparisEkleVerisi, SiparisGuncelleVerisi, SiparisListesiSuzgeci, SiparisSatiri,
} from '#paylasilan/sozlesme/siparisler.ts';
import { numaraAl } from '../ayarlar/disari.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { malzemeAra, malzemeOzetleri } from '../malzemeler/disari.ts';
import { firmaAdlari, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import {
  FIRMA_YOK, MUSTERI_NO_KULLANILIYOR, NUMARA_UZUN, SATILAN_TURLER, SIPARIS_YOK, aramaKalibi, duzenlemeReddi, firmaReddi, fiyatEksikReddi, fiyatlariKoru, fiyatYazmaReddi, gecisHedefi, gecisReddi,
  malzemeReddi,
} from './kurallar.ts';
import type { DurumKomutu } from './kurallar.ts';
import { siparisOnaylandiBildir } from './siparis-olaylari.ts';
import * as sorgular from './sorgular.ts';
import type { BaslikAlanlari, KalemSatiri, SiparisSatiri as BaslikSatiri } from './sorgular.ts';

const KISITLAR = {
  siparisler_siparis_musteri_no_tekil: { ileti: MUSTERI_NO_KULLANILIYOR, alan: 'musteriSiparisNo' },
  siparisler_siparis_tarih_sirasi: { ileti: 'Termin sipariş tarihinden önce olamaz.', alan: 'termin' },
  siparisler_siparis_firma: { ileti: FIRMA_YOK, alan: 'firmaId' },
  siparisler_siparis_no_bicim: NUMARA_UZUN,
} as const;

async function cevir(db: Db, satirlar: BaslikSatiri[]): Promise<Siparis[]> {
  const adlar = await firmaAdlari(db, satirlar.map((s) => s.firma_id));
  return satirlar.map((s) => ({
    id: s.id, no: s.no, durum: s.durum, firmaId: s.firma_id, firmaAd: adlar.get(s.firma_id) ?? null,
    musteriSiparisNo: s.musteri_siparis_no, siparisTarihi: s.siparis_tarihi, termin: s.termin, paraBirimi: s.para_birimi,
    kdvOrani: s.kdv_orani, odemeKosulu: s.odeme_kosulu, aciklama: s.aciklama, araToplam: s.ara_toplam, kdvTutari: s.kdv_tutari,
    genelToplam: s.genel_toplam, cezaOraniGun: s.gecikme_ceza_orani, cezaTavaniOrani: s.ceza_tavani_orani, odemeVadesiGun: s.odeme_vadesi_gun, iptalNedeni: s.iptal_nedeni, olusturma: s.olusturma, guncelleme: s.guncelleme,
    onayZamani: s.onay_zamani, surum: s.surum,
  }));
}

async function kalemleriCevir(db: Db, kalemler: KalemSatiri[]): Promise<SiparisSatiri[]> {
  const kartlar = await malzemeOzetleri(db, kalemler.map((k) => k.malzeme_no));
  return kalemler.map((k) => {
    const kart = kartlar.get(k.malzeme_no);
    return {
      id: k.id, sira: k.sira, malzemeNo: k.malzeme_no, malzemeKodu: kart?.kod ?? null, malzemeAdi: kart?.ad ?? null, birim: kart?.birim ?? null,
      miktar: k.miktar, birimFiyat: k.birim_fiyat, tutar: k.tutar, termin: k.termin, aciklama: k.aciklama,
    };
  });
}

export async function siparisListesi(db: Db, sorgu: SiparisListesiSuzgeci): Promise<SayfaliListe<Siparis>> {
  const suzgec = { kalip: aramaKalibi(sorgu.ara), durum: sorgu.durum ?? null, firmaId: sorgu.firmaId ?? null };
  return sayfaliListe(sorgu, {
    say: () => sorgular.siparisSay(db, suzgec),
    satirlar: async (dilim) => cevir(db, await sorgular.siparisSatirlari(db, suzgec, sorgu, dilim)),
  });
}

export async function siparisAyrintisi(db: Db, id: number): Promise<SiparisAyrintisi> {
  const satir = await sorgular.siparisGetir(db, id);
  if (satir === null) throw bulunamadi(SIPARIS_YOK);
  const [siparis] = await cevir(db, [satir]);
  if (siparis === undefined) throw new Error('Sipariş çevrilemedi');
  return { ...siparis, satirlar: await kalemleriCevir(db, await sorgular.kalemler(db, id)) };
}

async function firmayiDenetle(db: Db, firmaId: number, mevcut: number | null): Promise<void> {
  const ret = firmaReddi(await firmaOzeti(db, firmaId), firmaId, mevcut);
  if (ret !== null) throw dogrulama(ret, 'firmaId');
}

async function kalemleriDenetle(db: Db, g: SiparisEkleVerisi): Promise<void> {
  const kartlar = await malzemeOzetleri(db, g.satirlar.map((s) => s.malzemeNo));
  g.satirlar.forEach((s, i) => {
    const ret = malzemeReddi(kartlar.get(s.malzemeNo) ?? null);
    if (ret !== null) throw dogrulama(ret, `satirlar.${i}.malzemeNo`);
  });
}

const baslik = (g: SiparisEkleVerisi): BaslikAlanlari => ({
  firmaId: g.firmaId, musteriSiparisNo: g.musteriSiparisNo, siparisTarihi: g.siparisTarihi, termin: g.termin,
  paraBirimi: g.paraBirimi, kdvOrani: g.kdvOrani, odemeKosulu: g.odemeKosulu, aciklama: g.aciklama,
  cezaOraniGun: g.cezaOraniGun, cezaTavaniOrani: g.cezaTavaniOrani, odemeVadesiGun: g.odemeVadesiGun,
});

// `fiyatYazar` uçta `siparisler.fiyat-oku`dan gelir (201 a); disari çağıranlar (Portal) fiyatı kendi yetkisiyle yazar.
export async function siparisEkle(db: Db, kullanici: Kullanici, g: SiparisEkleVerisi, fiyatYazar = true): Promise<SiparisAyrintisi> {
  const fiyatRet = fiyatYazmaReddi(fiyatYazar, g.satirlar);
  if (fiyatRet !== null) throw yetkiYok(fiyatRet);
  await firmayiDenetle(db, g.firmaId, null);
  await kalemleriDenetle(db, g);
  const no = await numaraAl(db, 'siparisler.siparis-no', { varMi: (n) => sorgular.siparisNoVarMi(db, n) });
  const id = await kisitKorumali(KISITLAR, () => sorgular.siparisEkle(db, no, baslik(g), kullanici.id));
  await sorgular.kalemleriYaz(db, id, g.satirlar);
  // Ayrı "onaya gönder" durumu yok: taslak açılınca onay bekler; tekliften dönüşüm de buradan geçer.
  await bildirimGonder(db, {
    tur: 'siparisler.onay-bekliyor', baslik: `Onay bekleyen sipariş: ${no}`, yol: `/siparisler/${id}`, kaynakKimlik: String(id), haric: kullanici.id,
  });
  return siparisAyrintisi(db, id);
}

export type TaslakSiparisVerisi = {
  firmaId: number;
  termin: string;
  satirlar: { malzemeNo: number; miktar: string; termin?: string | null; aciklama?: string | null }[];
  kdvOrani?: string;
  aciklama?: string | null;
};

// Plan stüdyosundaki acil sipariş (286 b, 287 b): müşteri seçilir; fiyat boş kalır, Siparişler'de girilip onaylanır.
// Firma kartında KDV yok; verilmezse sipariş formunun varsayılanı. Doğrulama uçtakiyle aynı sözleşmeden geçer.
export async function taslakSiparisAc(db: Db, kullanici: Kullanici, g: TaslakSiparisVerisi): Promise<SiparisAyrintisi> {
  const govde = siparisEkleGovdesi.safeParse({
    firmaId: g.firmaId, siparisTarihi: tesisGunu(Date.now()), termin: g.termin, kdvOrani: g.kdvOrani ?? '20', aciklama: g.aciklama ?? null,
    satirlar: g.satirlar.map((s) => ({ ...s, birimFiyat: null })),
  });
  if (!govde.success) {
    const ilk = govde.error.issues[0];
    throw dogrulama(ilk?.message ?? 'Sipariş geçersiz.', ilk?.path.join('.'));
  }
  return siparisEkle(db, kullanici, govde.data);
}

async function kilitle(db: Db, id: number): Promise<{ durum: SiparisDurumu; firma_id: number }> {
  const mevcut = await sorgular.siparisKilitle(db, id);
  if (mevcut === null) throw bulunamadi(SIPARIS_YOK);
  return mevcut;
}

export async function siparisGuncelle(
  db: Db, kullanici: Kullanici, id: number, g: SiparisGuncelleVerisi, fiyatYazar = true,
): Promise<SiparisAyrintisi> {
  const fiyatRet = fiyatYazmaReddi(fiyatYazar, g.satirlar);
  if (fiyatRet !== null) throw yetkiYok(fiyatRet);
  const mevcut = await kilitle(db, id);
  const ret = duzenlemeReddi(mevcut.durum);
  if (ret !== null) throw gecersiz(ret);
  const onceki = (await sorgular.kalemler(db, id)).map((k) => ({ malzemeNo: k.malzeme_no, birimFiyat: k.birim_fiyat }));
  const satirlar = fiyatYazar ? g.satirlar : fiyatlariKoru(onceki, g.satirlar);
  await firmayiDenetle(db, g.firmaId, mevcut.firma_id);
  await kalemleriDenetle(db, g);
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.siparisGuncelle(db, id, baslik(g), g.surum, kullanici.id),
    varMi: () => sorgular.siparisVarMi(db, id),
    bulunamadiIletisi: SIPARIS_YOK,
  }));
  await sorgular.kalemleriYaz(db, id, satirlar);
  return siparisAyrintisi(db, id);
}

export async function durumDegistir(
  db: Db, kullanici: Kullanici, id: number, komut: DurumKomutu, g: { surum: number; neden?: string },
): Promise<SiparisAyrintisi> {
  const mevcut = await kilitle(db, id);
  const ret = gecisReddi(mevcut.durum, komut);
  if (ret !== null) throw gecersiz(ret);
  if (komut === 'onayla') {
    const eksik = fiyatEksikReddi((await sorgular.kalemler(db, id)).map((k) => ({ birimFiyat: k.birim_fiyat })));
    if (eksik !== null) throw cakisma(eksik);
  }
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.durumYaz(db, id, { hedef: gecisHedefi(komut), surum: g.surum, kisiId: kullanici.id, iptalNedeni: g.neden ?? null }),
    varMi: () => sorgular.siparisVarMi(db, id),
    bulunamadiIletisi: SIPARIS_YOK,
  }));
  if (komut === 'onayla') await siparisOnaylandiBildir(db, { siparisId: id, kullanici });
  return siparisAyrintisi(db, id);
}

// SIP-02 seçim tarafında: yalnız aktif ve satılan türdeki kartlar listelenir; kayıt yine malzemeReddi'nden geçer.
export async function malzemeSecenekleri(db: Db, g: { ara: string | null; sayfa: number }): Promise<MalzemeSecenekleriCevabi> {
  const r = await malzemeAra(db, { metin: g.ara, turler: SATILAN_TURLER, yalnizAktif: true, sayfa: g.sayfa });
  return {
    satirlar: r.satirlar.map((m) => ({ no: m.id, kod: m.kod, ad: m.ad, tur: m.tur, birim: m.birim })),
    toplam: r.toplam, sayfa: r.sayfa, sayfaBoyu: r.sayfaBoyu,
  };
}

// --- Başka modüllere (disari.ts) ---

// Siparişe bağlı kayıt açan modül (projeler, 176 a) okuduğu durumla yazar: satır çağıranın işlemi bitene dek kilitli kalır,
// eşzamanlı onay, kapatma ya da iptal bekler.
export async function siparisKilitliAyrinti(db: Db, id: number): Promise<SiparisAyrintisi> {
  await kilitle(db, id);
  return siparisAyrintisi(db, id);
}

// Üretim emri ve sevk satırı sipariş satırına bağlanırken: satırın siparişi, malzemesi, miktarı, termini ve siparişin durumu.
// Plan önceliği (177-179 a) satır tutarını (KDV hariç), para birimini ve siparişin ceza alanlarını da buradan okur; ceza boşsa null.
export interface SiparisSatiriOzeti {
  id: number; siparisId: number; siparisNo: string; siparisDurumu: SiparisDurumu; firmaId: number;
  sira: number; malzemeNo: number; miktar: string; termin: string;
  // 225: emrin payı birim fiyat × emir adedidir; fiyat yetkisi çağıranın ucundadır, fiyatsız satırda null.
  birimFiyat: string | null; tutar: string | null; paraBirimi: string; cezaOraniGun: string | null; cezaTavaniOrani: string | null;
  // 205 a: proje maliyeti finansmanı bu vadeden hesaplar, boşsa eksik sayar; plan vadeyi okumaz.
  odemeVadesiGun: number | null;
}

// kisiAdlari kalıbı: satırlar ve başlıklar birer sorgu; boş dizide sorgu yok; olmayan kimlik haritada yok.
async function satirOzetleri(db: Db, kalemler: KalemSatiri[]): Promise<SiparisSatiriOzeti[]> {
  const basliklar = new Map((await sorgular.siparisleriGetir(db, [...new Set(kalemler.map((k) => k.siparis_id))])).map((b) => [b.id, b]));
  return kalemler.flatMap((k) => {
    const b = basliklar.get(k.siparis_id);
    return b === undefined ? [] : [{
      id: k.id, siparisId: b.id, siparisNo: b.no, siparisDurumu: b.durum, firmaId: b.firma_id,
      sira: k.sira, malzemeNo: k.malzeme_no, miktar: k.miktar, termin: k.termin ?? b.termin, birimFiyat: k.birim_fiyat,
      tutar: k.tutar, paraBirimi: b.para_birimi, cezaOraniGun: b.gecikme_ceza_orani, cezaTavaniOrani: b.ceza_tavani_orani, odemeVadesiGun: b.odeme_vadesi_gun,
    }];
  });
}

export async function siparisSatiriOzetleri(db: Db, idler: number[]): Promise<Map<number, SiparisSatiriOzeti>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await satirOzetleri(db, await sorgular.kalemleriGetir(db, tekil))).map((s) => [s.id, s]));
}

// 224: emir açılırken siparişin satırı seçilir; satırlar sıra ile, sipariş yoksa boş dizi.
export async function siparisinSatirOzetleri(db: Db, siparisId: number): Promise<SiparisSatiriOzeti[]> {
  return satirOzetleri(db, await sorgular.kalemler(db, siparisId));
}

export const siparisOzeti = (db: Db): Promise<SiparisOzetiCevabi> => sorgular.siparisOzetiSay(db, YAKLASAN_TERMIN_GUN, SIPARIS_OZETI_AY);
