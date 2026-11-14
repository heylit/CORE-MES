import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { SIPARIS_OZETI_AY, YAKLASAN_TERMIN_GUN, siparisEkleGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type {
  MalzemeSecenekleriCevabi, Siparis, SiparisAyrintisi, SiparisOzetiCevabi, SiparisDurumu, TerminDagilimiCevabi, SiparisEkleVerisi, SiparisGuncelleVerisi, SiparisListesiSuzgeci, SiparisSatiri,
} from '#paylasilan/sozlesme/siparisler.ts';
import { numaraAl } from '../ayarlar/disari.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { malzemeAra, malzemeOzetleri, malzemeSatinAlmaAyrintilari } from '../malzemeler/disari.ts';
import { beklenenTahsilatKaldir, beklenenTahsilatYaz } from '../finans/disari.ts';
import { firmaAdlari, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import {
  FIRMA_YOK, MUSTERI_NO_KULLANILIYOR, NUMARA_UZUN, SATILAN_TURLER, SIPARIS_YOK, aramaKalibi, bagliEmirReddi, duzenlemeReddi, firmaReddi, fiyatEksikReddi, fiyatlariKoru, fiyatYazmaReddi, gecisHedefi, gecisReddi,
  TAKVIM_SIPARIS_DURUMU, kilitliKalemReddi, malzemeReddi, miktarReddi, partiReddi, tarihAraligiReddi, terminDagilimi as terminAraliklari, tutarTasmaReddi,
} from './kurallar.ts';
import { bagliEmirler, emreBagliKalemler, emreBagliKalemlerOku } from './bagli-emirler.ts';
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

async function kalemPartileri(db: Db, satirIdleri: number[]): Promise<Map<number, sorgular.PartiSatiri[]>> {
  const harita = new Map<number, sorgular.PartiSatiri[]>();
  for (const p of await sorgular.partileriGetir(db, satirIdleri)) harita.set(p.satir_id, [...(harita.get(p.satir_id) ?? []), p]);
  return harita;
}

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
  const nolar = kalemler.map((k) => k.malzeme_no);
  const kartlar = await malzemeOzetleri(db, nolar);
  const ayrintilar = await malzemeSatinAlmaAyrintilari(db, nolar);
  const partiler = await kalemPartileri(db, kalemler.map((k) => k.id));
  const bagli = await emreBagliKalemlerOku(db, kalemler.map((k) => k.id));
  return kalemler.map((k) => {
    const kart = kartlar.get(k.malzeme_no);
    return {
      id: k.id, sira: k.sira, malzemeNo: k.malzeme_no, malzemeKodu: kart?.kod ?? null, malzemeAdi: kart?.ad ?? null,
      aciklamalar: ayrintilar.get(k.malzeme_no)?.aciklamalar ?? [], birim: kart?.birim ?? null,
      miktar: k.miktar, birimFiyat: k.birim_fiyat, tutar: k.tutar, termin: k.termin, aciklama: k.aciklama,
      partiler: (partiler.get(k.id) ?? []).map((p) => ({ id: p.id, emirTuru: p.emir_turu, adet: p.adet })),
      emreBagli: bagli.has(k.id),
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
    const kart = kartlar.get(s.malzemeNo) ?? null;
    const ret = malzemeReddi(kart);
    if (ret !== null) throw dogrulama(ret, `satirlar.${i}.malzemeNo`);
    const miktar = miktarReddi(kart?.birim ?? null, s.miktar);
    if (miktar !== null) throw dogrulama(miktar, `satirlar.${i}.miktar`);
    const parti = partiReddi(kart?.birim ?? null, s.miktar, s.partiler ?? []);
    if (parti !== null) throw dogrulama(parti, `satirlar.${i}.partiler`);
  });
  const tarih = tarihAraligiReddi(tesisGunu(Date.now()), g);
  if (tarih !== null) throw dogrulama(tarih.mesaj, tarih.alan);
  const tasma = tutarTasmaReddi(g.kdvOrani, g.satirlar);
  if (tasma !== null) throw dogrulama(tasma.mesaj, tasma.alan);
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
  const kayitlilar = await sorgular.kalemler(db, id);
  const onceki = kayitlilar.map((k) => ({
    malzemeNo: k.malzeme_no, miktar: k.miktar, birimFiyat: k.birim_fiyat, termin: k.termin, aciklama: k.aciklama,
  }));
  const satirlar = fiyatYazar ? g.satirlar : fiyatlariKoru(onceki, g.satirlar);
  // SIP-19 (3254 a): onayı geri alınmış siparişte emre bağlı kalem kilitlidir; yalnız termini değişir.
  const kilitli = await emreBagliKalemler(db, kayitlilar.map((k) => k.id));
  if (kilitli.size > 0) {
    const partiler = await kalemPartileri(db, [...kilitli]);
    const kayitli = kayitlilar.map((k) => ({
      id: k.id, sira: k.sira, malzemeNo: k.malzeme_no, miktar: k.miktar, birimFiyat: k.birim_fiyat, aciklama: k.aciklama,
      partiler: (partiler.get(k.id) ?? []).map((p) => ({ emirTuru: p.emir_turu, adet: p.adet })),
    }));
    const kilit = kilitliKalemReddi(kayitli, kilitli, satirlar);
    if (kilit !== null) throw cakisma(kilit.mesaj);
  }
  await firmayiDenetle(db, g.firmaId, mevcut.firma_id);
  await kalemleriDenetle(db, { ...g, satirlar });
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.siparisGuncelle(db, id, baslik(g), g.surum, kullanici.id),
    varMi: () => sorgular.siparisVarMi(db, id),
    bulunamadiIletisi: SIPARIS_YOK,
  }));
  await sorgular.kalemleriYaz(db, id, satirlar, kilitli);
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
  if (komut === 'iptal') {
    const bagli = bagliEmirReddi(komut, await bagliEmirler(db, { siparisId: id, satirIdleri: (await sorgular.kalemler(db, id)).map((k) => k.id) }));
    if (bagli !== null) throw cakisma(bagli);
  }
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    // Gerekçe yalnız iptalde sütuna yazılır; onay geri almanın gerekçesi uç denetim kaydında gövdeyle durur (SIP-19).
    guncelle: () => sorgular.durumYaz(db, id, {
      hedef: gecisHedefi(komut), surum: g.surum, kisiId: kullanici.id, iptalNedeni: komut === 'iptal' ? g.neden ?? null : null,
    }),
    varMi: () => sorgular.siparisVarMi(db, id),
    bulunamadiIletisi: SIPARIS_YOK,
  }));
  if (komut === 'onayla') await siparisOnaylandiBildir(db, { siparisId: id, kullanici });
  if (komut === 'onayla') await tahsilatiFinansaYaz(db, kullanici.id, id);
  if (komut === 'iptal' || komut === 'geri-al') await beklenenTahsilatKaldir(db, id);
  return siparisAyrintisi(db, id);
}

// 2132c (karar 2132-1): onaylanan sipariş finansa beklenen tahsilat olarak düşer. Sevk günü sevk planlanana kadar siparişin terminidir;
// vade günü siparişin ödeme vadesi, boşsa firmanın varsayılan vadesi, o da yoksa 0'dır (peşin). Tutarı sıfır olan siparişin tahsilatı yoktur.
// Kapanan sipariş tahsil edilmemiş olabilir: satır kalır, fatura bağlanınca kalanı düşer.
async function tahsilatiFinansaYaz(db: Db, kisiId: number, id: number): Promise<void> {
  const s = await siparisAyrintisi(db, id);
  if (s.genelToplam === null || Number(s.genelToplam) <= 0) { await beklenenTahsilatKaldir(db, id); return; }
  const vadeGun = s.odemeVadesiGun ?? (await firmaOzeti(db, s.firmaId))?.vadeGunu ?? 0;
  await beklenenTahsilatYaz(db, kisiId, {
    siparisId: id, siparisNo: s.no, firmaId: s.firmaId, paraBirimi: s.paraBirimi, tutar: s.genelToplam, sevkTarihi: s.termin, sevkKaynagi: 'termin', vadeGun,
  });
}

// SIP-02 seçim tarafında: yalnız aktif ve satılan türdeki kartlar listelenir; kayıt yine malzemeReddi'nden geçer.
export async function malzemeSecenekleri(db: Db, g: { ara: string | null; sayfa: number }): Promise<MalzemeSecenekleriCevabi> {
  const r = await malzemeAra(db, { metin: g.ara, turler: SATILAN_TURLER, yalnizAktif: true, sayfa: g.sayfa });
  const ayrintilar = await malzemeSatinAlmaAyrintilari(db, r.satirlar.map((m) => m.id));
  return {
    satirlar: r.satirlar.map((m) => ({ no: m.id, kod: m.kod, ad: m.ad, tur: m.tur, birim: m.birim, aciklamalar: ayrintilar.get(m.id)?.aciklamalar ?? [] })),
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
  // 3244 b: termin kalemin kendisinden mi (elle) yoksa siparişten mi geliyor; zincir bağı bunu okur.
  terminElle: boolean;
  // 3244 b: kalemin partileri; boşsa kalem tek seri partidir (çağıran öyle sayar).
  partiler: { id: number; emirTuru: EmirTuru; adet: string }[];
}

// kisiAdlari kalıbı: satırlar ve başlıklar birer sorgu; boş dizide sorgu yok; olmayan kimlik haritada yok.
async function satirOzetleri(db: Db, kalemler: KalemSatiri[]): Promise<SiparisSatiriOzeti[]> {
  const basliklar = new Map((await sorgular.siparisleriGetir(db, [...new Set(kalemler.map((k) => k.siparis_id))])).map((b) => [b.id, b]));
  const partiler = await kalemPartileri(db, kalemler.map((k) => k.id));
  return kalemler.flatMap((k) => {
    const b = basliklar.get(k.siparis_id);
    return b === undefined ? [] : [{
      id: k.id, siparisId: b.id, siparisNo: b.no, siparisDurumu: b.durum, firmaId: b.firma_id,
      sira: k.sira, malzemeNo: k.malzeme_no, miktar: k.miktar, termin: k.termin ?? b.termin, birimFiyat: k.birim_fiyat,
      tutar: k.tutar, paraBirimi: b.para_birimi, cezaOraniGun: b.gecikme_ceza_orani, cezaTavaniOrani: b.ceza_tavani_orani, odemeVadesiGun: b.odeme_vadesi_gun,
      terminElle: k.termin !== null, partiler: (partiler.get(k.id) ?? []).map((p) => ({ id: p.id, emirTuru: p.emir_turu, adet: p.adet })),
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

export const terminDagilimi = async (db: Db): Promise<TerminDagilimiCevabi> => ({ araliklar: terminAraliklari(await sorgular.terminKalanlari(db)) });

// Takvim (891): termini [baslangic, bitis] içindeki siparişler, firma adıyla. Yetki denetlemez; çağıran siparisler.oku'yu denetler.
export async function takvimKayitlari(db: Db, baslangic: string, bitis: string): Promise<TakvimKaydi[]> {
  const satirlar = await sorgular.takvimSiparisleri(db, baslangic, bitis);
  const adlar = await firmaAdlari(db, satirlar.map((s) => s.firma_id));
  return satirlar.flatMap((s): TakvimKaydi[] => {
    if (s.durum === 'iptal') return [];
    const d = TAKVIM_SIPARIS_DURUMU[s.durum];
    return [{
      kaynak: 'siparis', kimlik: String(s.id), tarih: s.termin, no: s.no, baslik: `Sipariş ${s.no}`,
      ilgili: adlar.get(s.firma_id) ?? null, durum: d.ad, bitti: d.bitti,
    }];
  });
}
