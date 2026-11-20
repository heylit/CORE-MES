import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { type KarsilamaYolu, SIPARIS_OZETI_AY, YAKLASAN_TERMIN_GUN, siparisEkleGovdesi } from '#paylasilan/sozlesme/siparisler.ts';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type {
  BirimSecenekleriCevabi, KalemRevizyonu, MalzemeSecenekleriCevabi, Siparis, SiparisAyrintisi, SiparisOzetiCevabi, SiparisDurumu, TerminDagilimiCevabi, SiparisEkleVerisi, SiparisGuncelleVerisi, SiparisListesiSuzgeci, SiparisRevizyonlariCevabi, SiparisRevizyonVerisi, SiparisSatiri,
} from '#paylasilan/sozlesme/siparisler.ts';
import { denemeIsaretliKimlikler, firmaKoduSecimi, numaraAl } from '../ayarlar/disari.ts';
import { bildirimGonder, bildirimKapat, kalanGun } from '../bildirim/disari.ts';
import { olayAlanlari } from '#paylasilan/sozlesme/bildirim-kural-sabitleri.ts';
import { malzemeAra, malzemeOzetleri, malzemeSatinAlmaAyrintilari, malzemeYerlilikOranlari, revizyonBilgileri, satisBirimleri, type RevizyonBilgisi } from '../malzemeler/disari.ts';
import { beklenenTahsilatKaldir, beklenenTahsilatYaz } from '../finans/disari.ts';
import { firmaAdlari, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import {
  FIRMA_YOK, MUSTERI_NO_KULLANILIYOR, siparisArsivReddi, NUMARA_UZUN, bagliTalepReddi, SATILAN_TURLER, SIPARIS_YOK, aramaKalibi, bagliEmirReddi, kapanisReddi, duzenlemeReddi, firmaReddi, fiyatEksikReddi, fiyatlariKoru, fiyatYazmaReddi, ticariSartReddi, gecisHedefi, gecisReddi,
  TAKVIM_SIPARIS_DURUMU, REVIZYON_DEGISIKLIK_YOK, eskiRevizyonReddi, degisiklikFiyatsiz, kilitliKalemReddi, revizyonDegisiklikleri, revizyonGirdiReddi, revizyonReddi, malzemeReddi, miktarReddi, kalemKarsilamasi, karsilamaPartiReddi, partiReddi, tarihAraligiReddi, terminDagilimi as terminAraliklari, tutarTasmaReddi,
} from './kurallar.ts';
import { bagliEmirler, bagliTalepler, kapanisEksikleri, emreBagliKalemler, emreBagliKalemlerOku } from './bagli-emirler.ts';
import type { DurumKomutu, RevizyonDegisikligi, RevizyonHali } from './kurallar.ts';
import { siparisDegistiBildir, siparisIptalEdildiBildir, siparisRevizeEdildiBildir, siparisOnaylandiBildir, siparisOnayiGeriAlindiBildir } from './siparis-olaylari.ts';
import * as sorgular from './sorgular.ts';
import type { BaslikAlanlari, SiparisKilidi, KalemSatiri, SiparisSatiri as BaslikSatiri } from './sorgular.ts';

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
  const arsivleyenler = await kisiAdlari(db, satirlar.flatMap((s) => (s.arsivleyen_id === null ? [] : [s.arsivleyen_id])));
  return satirlar.map((s) => ({
    id: s.id, no: s.no, durum: s.durum, firmaId: s.firma_id, firmaAd: adlar.get(s.firma_id) ?? null, firmaKodu: s.firma_kodu,
    musteriSiparisNo: s.musteri_siparis_no, siparisTarihi: s.siparis_tarihi, termin: s.termin, paraBirimi: s.para_birimi,
    kdvOrani: s.kdv_orani, odemeKosulu: s.odeme_kosulu, aciklama: s.aciklama, araToplam: s.ara_toplam, kdvTutari: s.kdv_tutari,
    genelToplam: s.genel_toplam, cezaOraniGun: s.gecikme_ceza_orani, cezaTavaniOrani: s.ceza_tavani_orani, odemeVadesiGun: s.odeme_vadesi_gun, iptalNedeni: s.iptal_nedeni, olusturma: s.olusturma, guncelleme: s.guncelleme,
    onayZamani: s.onay_zamani, surum: s.surum, topluYukleme: s.toplu ?? false, logoBaglanacak: s.logo_baglanacak ?? false,
    arsiv: s.arsiv_an === null ? null : { an: s.arsiv_an, kisi: s.arsivleyen_id === null ? null : (arsivleyenler.get(s.arsivleyen_id) ?? null) },
  }));
}

async function kalemleriCevir(db: Db, kalemler: KalemSatiri[]): Promise<SiparisSatiri[]> {
  const nolar = kalemler.map((k) => k.malzeme_no);
  const kartlar = await malzemeOzetleri(db, nolar);
  const ayrintilar = await malzemeSatinAlmaAyrintilari(db, nolar);
  const partiler = await kalemPartileri(db, kalemler.map((k) => k.id));
  const bagli = await emreBagliKalemlerOku(db, kalemler.map((k) => k.id));
  const revizyonlar = await revizyonBilgileri(db, nolar);
  return kalemler.map((k) => {
    const kart = kartlar.get(k.malzeme_no);
    return {
      id: k.id, sira: k.sira, malzemeNo: k.malzeme_no, malzemeKodu: kart?.kod ?? null, malzemeAdi: kart?.ad ?? null,
      aciklamalar: ayrintilar.get(k.malzeme_no)?.aciklamalar ?? [], birim: kart?.birim ?? null,
      miktar: k.miktar, birimFiyat: k.birim_fiyat, tutar: k.tutar, termin: k.termin, aciklama: k.aciklama,
      partiler: (partiler.get(k.id) ?? []).map((p) => ({ id: p.id, emirTuru: p.emir_turu, adet: p.adet, rotaId: p.rota_id })),
      karsilama: k.karsilama,
      emreBagli: bagli.has(k.id),
      revizyon: kalemRevizyonu(k.malzeme_no, revizyonlar.get(k.malzeme_no)),
      eskiRevizyonGerekcesi: k.eski_revizyon_gerekcesi,
    };
  });
}

const kalemRevizyonu = (no: number, r: RevizyonBilgisi | undefined): KalemRevizyonu | null => (r === undefined ? null : {
  etiket: r.etiket, yururlukte: r.yururlukteki.no === no, yururluktekiNo: r.yururlukteki.no, yururluktekiKodu: r.yururlukteki.stokKodu, yururluktekiEtiketi: r.yururlukteki.etiket,
});

export async function siparisListesi(db: Db, sorgu: SiparisListesiSuzgeci): Promise<SayfaliListe<Siparis>> {
  const suzgec = {
    kalip: aramaKalibi(sorgu.ara), durum: sorgu.durum ?? null, firmaId: sorgu.firmaId ?? null, gizli: await denemeIsaretliKimlikler(db, 'siparis'),
    arsiv: sorgu.arsiv === undefined ? null : sorgu.arsiv === 'evet',
  };
  return sayfaliListe(sorgu, {
    say: () => sorgular.siparisSay(db, suzgec),
    satirlar: async (dilim) => cevir(db, await sorgular.siparisSatirlari(db, suzgec, sorgu, dilim)),
  });
}

// 3478-3: bildirim kuralının koşul alanları. Tutar yalnız koşulda kullanılır, bildirim metnine yazılmaz (bildirim modülü denetler).
const kuralAlanlari = (s: SiparisAyrintisi) => olayAlanlari('siparisler.onay-bekliyor', {
  firma: s.firmaAd, tutar: s.genelToplam, para_birimi: s.paraBirimi, termine_kalan_gun: kalanGun(s.termin, Date.now()),
});

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

// `kayitliKartlar`: siparişte zaten kayıtlı kalemlerin kartları; onlar sonradan eskiye düşse de kalemi durdurmaz (3438 a).
// Kalemleri yazılacak haliyle döner: karşılama yolu kart türüne göre tamamlanır (SIP-43); yürürlükteki karttaki gerekçe silinir (eski gerekçe yeni kartla kalmaz).
async function kalemleriDenetle<T extends SiparisEkleVerisi['satirlar'][number]>(
  db: Db, g: Omit<SiparisEkleVerisi, 'satirlar'> & { satirlar: T[] }, kayitliKartlar: ReadonlySet<number> = new Set(),
): Promise<T[]> {
  const kartlar = await malzemeOzetleri(db, g.satirlar.map((s) => s.malzemeNo));
  const revizyonlar = await revizyonBilgileri(db, g.satirlar.map((s) => s.malzemeNo));
  const satirlar = g.satirlar.map((s, i) => {
    const kart = kartlar.get(s.malzemeNo) ?? null;
    const ret = malzemeReddi(kart);
    if (ret !== null) throw dogrulama(ret, `satirlar.${i}.malzemeNo`);
    const miktar = miktarReddi(kart?.birim ?? null, s.miktar);
    if (miktar !== null) throw dogrulama(miktar, `satirlar.${i}.miktar`);
    const karsilama = kalemKarsilamasi(kart?.tur ?? null, s.karsilama);
    const parti = karsilamaPartiReddi(karsilama, s.partiler ?? []) ?? partiReddi(kart?.birim ?? null, s.miktar, s.partiler ?? []);
    if (parti !== null) throw dogrulama(parti, `satirlar.${i}.partiler`);
    const r = kalemRevizyonu(s.malzemeNo, revizyonlar.get(s.malzemeNo));
    const rev = eskiRevizyonReddi(r === null ? null : { ...r, kod: kart?.kod ?? null }, s.eskiRevizyonGerekcesi ?? null, kayitliKartlar.has(s.malzemeNo));
    if (rev !== null) throw dogrulama(rev, `satirlar.${i}.eskiRevizyonGerekcesi`);
    return { ...s, karsilama };
  });
  const tarih = tarihAraligiReddi(tesisGunu(Date.now()), g);
  if (tarih !== null) throw dogrulama(tarih.mesaj, tarih.alan);
  const tasma = tutarTasmaReddi(g.kdvOrani, g.satirlar);
  if (tasma !== null) throw dogrulama(tasma.mesaj, tasma.alan);
  return satirlar.map((s) => {
    const r = revizyonlar.get(s.malzemeNo);
    return r === undefined || r.yururlukteki.no === s.malzemeNo ? { ...s, eskiRevizyonGerekcesi: null } : s;
  });
}

const baslik = (g: SiparisEkleVerisi): BaslikAlanlari => ({
  firmaId: g.firmaId, musteriSiparisNo: g.musteriSiparisNo, siparisTarihi: g.siparisTarihi, termin: g.termin,
  paraBirimi: g.paraBirimi, kdvOrani: g.kdvOrani, odemeKosulu: g.odemeKosulu, aciklama: g.aciklama,
  cezaOraniGun: g.cezaOraniGun, cezaTavaniOrani: g.cezaTavaniOrani, odemeVadesiGun: g.odemeVadesiGun,
});

const kayitliTicariSart = (m: SiparisKilidi) => ({ cezaOraniGun: m.gecikme_ceza_orani, cezaTavaniOrani: m.ceza_tavani_orani, odemeVadesiGun: m.odeme_vadesi_gun });

// `fiyatYazar` uçta `siparisler.fiyat-oku`dan gelir (201 a); disari çağıranlar (Portal) fiyatı kendi yetkisiyle yazar.
// `devralinanFirmaKodu`: tekliften dönüşümde teklifin kodu; sonradan pasife alınmış olsa da sipariş onu taşır (3399 a).
// `bildirimsiz`: toplu yükleme (3455-3) yüzlerce siparişte "onay bekliyor" bildirimi göndermez.
export async function siparisEkle(
  db: Db, kullanici: Kullanici, g: SiparisEkleVerisi, fiyatYazar = true, devralinanFirmaKodu: string | null = null, bildirimsiz = false,
): Promise<SiparisAyrintisi> {
  const fiyatRet = fiyatYazmaReddi(fiyatYazar, g.satirlar) ?? ticariSartReddi(fiyatYazar, g);
  if (fiyatRet !== null) throw yetkiYok(fiyatRet);
  await firmayiDenetle(db, g.firmaId, null);
  const satirlar = await kalemleriDenetle(db, g);
  // 3399 a: seçilmediyse varsayılan kod; numara bu kodla verilir.
  const firmaKodu = await firmaKoduSecimi(db, g.firmaKodu, 'firmaKodu', devralinanFirmaKodu);
  const no = await numaraAl(db, 'siparisler.siparis-no', { alanlar: { FIRMA: firmaKodu }, varMi: (n) => sorgular.siparisNoVarMi(db, n) });
  const id = await kisitKorumali(KISITLAR, () => sorgular.siparisEkle(db, no, { ...baslik(g), firmaKodu }, kullanici.id));
  await sorgular.kalemleriYaz(db, id, satirlar);
  await siparisDegistiBildir(db, { siparisId: id, kullanici });
  // Ayrı "onaya gönder" durumu yok: taslak açılınca onay bekler; tekliften dönüşüm de buradan geçer.
  const sonuc = await siparisAyrintisi(db, id);
  if (!bildirimsiz) await bildirimGonder(db, {
    tur: 'siparisler.onay-bekliyor', baslik: `Onay bekleyen sipariş: ${no}`, yol: `/siparisler/${id}`, kaynakKimlik: String(id), haric: kullanici.id,
    alanlar: kuralAlanlari(sonuc),
  });
  return sonuc;
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

async function kilitle(db: Db, id: number): Promise<SiparisKilidi> {
  const mevcut = await sorgular.siparisKilitle(db, id);
  if (mevcut === null) throw bulunamadi(SIPARIS_YOK);
  return mevcut;
}

export async function siparisGuncelle(
  db: Db, kullanici: Kullanici, id: number, g: SiparisGuncelleVerisi, fiyatYazar = true,
): Promise<SiparisAyrintisi> {
  const fiyatRet = fiyatYazmaReddi(fiyatYazar, g.satirlar) ?? ticariSartReddi(fiyatYazar, g);
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
      partiler: (partiler.get(k.id) ?? []).map((p) => ({ emirTuru: p.emir_turu, adet: p.adet, rotaId: p.rota_id })), karsilama: k.karsilama,
    }));
    const kilit = kilitliKalemReddi(kayitli, kilitli, satirlar);
    if (kilit !== null) throw cakisma(kilit.mesaj);
  }
  await firmayiDenetle(db, g.firmaId, mevcut.firma_id);
  const denetli = await kalemleriDenetle(db, { ...g, satirlar }, new Set(kayitlilar.map((k) => k.malzeme_no)));
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.siparisGuncelle(db, id, fiyatYazar ? baslik(g) : { ...baslik(g), ...kayitliTicariSart(mevcut) }, g.surum, kullanici.id),
    varMi: () => sorgular.siparisVarMi(db, id),
    bulunamadiIletisi: SIPARIS_YOK,
  }));
  await sorgular.kalemleriYaz(db, id, denetli, kilitli);
  await siparisDegistiBildir(db, { siparisId: id, kullanici });
  return siparisAyrintisi(db, id);
}

export async function durumDegistir(
  db: Db, kullanici: Kullanici, id: number, komut: DurumKomutu, g: { surum: number; neden?: string; projeKodu?: string | undefined },
): Promise<SiparisAyrintisi> {
  const mevcut = await kilitle(db, id);
  const ret = gecisReddi(mevcut.durum, komut);
  if (ret !== null) throw gecersiz(ret);
  if (komut === 'onayla') {
    const eksik = fiyatEksikReddi((await sorgular.kalemler(db, id)).map((k) => ({ birimFiyat: k.birim_fiyat })));
    if (eksik !== null) throw cakisma(eksik);
  }
  if (komut === 'kapat') {
    const eksik = kapanisReddi(komut, await kapanisEksikleri(db, id), g.neden);
    if (eksik !== null) throw dogrulama(eksik, 'neden');
  }
  if (komut === 'iptal') {
    const satirIdleri = (await sorgular.kalemler(db, id)).map((k) => k.id);
    const bagli = bagliEmirReddi(komut, await bagliEmirler(db, { siparisId: id, satirIdleri })) ?? bagliTalepReddi(komut, await bagliTalepler(db, satirIdleri));
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
  // 3478: onay ya da iptalden sonra "onay bekleyen sipariş" işi Gelenler'de ve zilde kalmaz.
  if (komut === 'onayla' || komut === 'iptal') await bildirimKapat(db, { tur: 'siparisler.onay-bekliyor', kaynakKimlik: String(id) });
  if (komut === 'onayla') await siparisOnaylandiBildir(db, { siparisId: id, kullanici, projeKodu: g.projeKodu });
  if (komut === 'geri-al') await siparisOnayiGeriAlindiBildir(db, { siparisId: id, kullanici });
  if (komut === 'iptal') await siparisIptalEdildiBildir(db, { siparisId: id, kullanici });
  await siparisDegistiBildir(db, { siparisId: id, kullanici });
  if (komut === 'onayla') await tahsilatiFinansaYaz(db, kullanici.id, id);
  if (komut === 'iptal' || komut === 'geri-al') await beklenenTahsilatKaldir(db, id);
  const sonuc = await siparisAyrintisi(db, id);
  // 3478: onay ve iptal siparişi açana haber verilir (kendi kararı değilse); olay varsayılan kapalıdır.
  const acan = komut === 'onayla' || komut === 'iptal' ? await sorgular.siparisiAcan(db, id) : null;
  if (acan !== null) await bildirimGonder(db, {
    tur: komut === 'onayla' ? 'siparisler.siparis-onaylandi' : 'siparisler.siparis-iptal-edildi',
    baslik: `${komut === 'onayla' ? 'Onaylanan' : 'İptal edilen'} sipariş: ${sonuc.no}`, yol: `/siparisler/${id}`, kaynakKimlik: String(id), kisiler: [acan], haric: kullanici.id,
  });
  // 3478 Risk N1: onayı geri alınan sipariş yeniden onay bekler; iş onaylayanlara yeniden düşer.
  if (komut === 'geri-al') await bildirimGonder(db, {
    tur: 'siparisler.onay-bekliyor', baslik: `Onay bekleyen sipariş: ${sonuc.no}`, yol: `/siparisler/${id}`, kaynakKimlik: String(id), haric: kullanici.id, alanlar: kuralAlanlari(sonuc),
  });
  return sonuc;
}

// 3425 a: iptal edilmiş sipariş arşive kalkar ya da geri gelir; durum, iptal nedeni, tahsilat ve emirler değişmez.
export async function siparisArsivle(db: Db, kullanici: Kullanici, id: number, g: { surum: number }, arsivle: boolean): Promise<SiparisAyrintisi> {
  const mevcut = await kilitle(db, id);
  const ret = siparisArsivReddi(mevcut.durum, mevcut.arsivde, arsivle);
  if (ret !== null) throw gecersiz(ret);
  await surumluGuncelle({
    guncelle: () => sorgular.siparisArsivYaz(db, id, { surum: g.surum, kisiId: kullanici.id, arsivle }),
    varMi: () => sorgular.siparisVarMi(db, id),
    bulunamadiIletisi: SIPARIS_YOK,
  });
  await siparisDegistiBildir(db, { siparisId: id, kullanici });
  return siparisAyrintisi(db, id);
}

// SIP-40 (3427-4 a): onaylı sipariş yeni sürümle düzenlenir. Kalem yerinde kalır; fiyat, termin, açıklama ve ticari şartlar değişir.
// Fiyatı görmeyenin gövdesi fiyatsızdır: kayıtlı fiyat ve ticari şart kimlikle korunur. Termin bağlı projeye ve başlamamış emre onaydaki
// gibi kayar (olay), tutar beklenen tahsilata yeniden yazılır. Logo'ya gitmiş siparişte sürüm bunu işaretler; Logo'ya yeniden gitmez.
export async function siparisRevizeEt(
  db: Db, kullanici: Kullanici, id: number, g: SiparisRevizyonVerisi, fiyatYazar = true,
): Promise<SiparisAyrintisi> {
  const fiyatRet = fiyatYazmaReddi(fiyatYazar, g.satirlar) ?? ticariSartReddi(fiyatYazar, g);
  if (fiyatRet !== null) throw yetkiYok(fiyatRet);
  const mevcut = await kilitle(db, id);
  const ret = revizyonReddi(mevcut.durum, mevcut.arsivde);
  if (ret !== null) throw gecersiz(ret);
  const once = await siparisAyrintisi(db, id);
  const onceki = revizyonHali(once);
  const kayitliFiyat = new Map(onceki.kalemler.map((k) => [k.id, k.birimFiyat]));
  const satirlar = fiyatYazar ? g.satirlar : g.satirlar.map((s) => ({ ...s, birimFiyat: s.id === undefined ? null : (kayitliFiyat.get(s.id) ?? null) }));
  const baslikYeni = fiyatYazar ? baslik(g) : { ...baslik(g), ...kayitliTicariSart(mevcut) };
  const girdi = { baslik: baslikYeni, kalemler: satirlar };
  const girdiRet = revizyonGirdiReddi(onceki, girdi);
  if (girdiRet !== null) throw dogrulama(girdiRet.mesaj, girdiRet.alan);
  const degisiklikler = revizyonDegisiklikleri(onceki, girdi);
  if (degisiklikler.length === 0) throw gecersiz(REVIZYON_DEGISIKLIK_YOK);
  const eksik = fiyatEksikReddi(satirlar);
  if (eksik !== null) throw cakisma(eksik);
  const tarih = tarihAraligiReddi(tesisGunu(Date.now()), { ...g, satirlar });
  if (tarih !== null) throw dogrulama(tarih.mesaj, tarih.alan);
  const tasma = tutarTasmaReddi(g.kdvOrani, satirlar);
  if (tasma !== null) throw dogrulama(tasma.mesaj, tasma.alan);
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.revizyonBasligiYaz(db, id, baslikYeni, g.surum, kullanici.id),
    varMi: () => sorgular.siparisVarMi(db, id),
    bulunamadiIletisi: SIPARIS_YOK,
  }));
  await sorgular.revizyonKalemleriYaz(db, id, onceki.kalemler.map((k, i) => {
    const s = satirlar[i];
    return { id: k.id, birimFiyat: s?.birimFiyat ?? null, termin: s?.termin ?? null, aciklama: s?.aciklama ?? null };
  }));
  await sorgular.revizyonEkle(db, { siparisId: id, gerekce: g.gerekce, kisiId: kullanici.id, onceki: once, degisiklikler });
  await siparisRevizeEdildiBildir(db, { siparisId: id, kullanici });
  await siparisDegistiBildir(db, { siparisId: id, kullanici });
  await tahsilatiFinansaYaz(db, kullanici.id, id);
  return siparisAyrintisi(db, id);
}

function revizyonHali(s: SiparisAyrintisi): RevizyonHali {
  return {
    baslik: {
      firmaId: s.firmaId, siparisTarihi: s.siparisTarihi, paraBirimi: s.paraBirimi, musteriSiparisNo: s.musteriSiparisNo, termin: s.termin, kdvOrani: s.kdvOrani,
      odemeKosulu: s.odemeKosulu, aciklama: s.aciklama, cezaOraniGun: s.cezaOraniGun, cezaTavaniOrani: s.cezaTavaniOrani, odemeVadesiGun: s.odemeVadesiGun,
    },
    kalemler: s.satirlar.map((k) => ({ id: k.id, sira: k.sira, malzemeNo: k.malzemeNo, miktar: k.miktar, birimFiyat: k.birimFiyat, termin: k.termin, aciklama: k.aciklama })),
  };
}

export async function siparisRevizyonlari(db: Db, id: number, fiyatGorur: boolean): Promise<SiparisRevizyonlariCevabi> {
  if (!(await sorgular.siparisVarMi(db, id))) throw bulunamadi(SIPARIS_YOK);
  const satirlar = await sorgular.revizyonlar(db, id);
  const adlar = await kisiAdlari(db, [...new Set(satirlar.map((r) => r.kisi_id))]);
  return {
    revizyonlar: satirlar.map((r) => {
      const degisiklikler = r.degisiklikler as RevizyonDegisikligi[];
      return {
        revNo: r.rev_no, gerekce: r.gerekce, kisi: adlar.get(r.kisi_id) ?? null, an: r.an, logoGitmisti: r.logo_gitmisti,
        degisiklikler: fiyatGorur ? degisiklikler : degisiklikler.map(degisiklikFiyatsiz),
      };
    }),
  };
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
  const oranlar = await malzemeYerlilikOranlari(db, r.satirlar.map((m) => m.id));
  const revizyonlar = await revizyonBilgileri(db, r.satirlar.map((m) => m.id));
  const satirlar = r.satirlar.map((m) => ({
    no: m.id, kod: m.kod, ad: m.ad, tur: m.tur, birim: m.birim, aciklamalar: ayrintilar.get(m.id)?.aciklamalar ?? [], yerlilikOrani: oranlar.get(m.id) ?? null,
    revizyon: kalemRevizyonu(m.id, revizyonlar.get(m.id)),
  }));
  // 3438 a: yürürlükteki olmayan revizyon önerilmez; sayfanın sonuna iner, seçilirse gerekçe ister.
  return {
    satirlar: [...satirlar.filter((m) => m.revizyon?.yururlukte !== false), ...satirlar.filter((m) => m.revizyon?.yururlukte === false)],
    toplam: r.toplam, sayfa: r.sayfa, sayfaBoyu: r.sayfaBoyu,
  };
}

// 3400-2: teklif kaleminin birim listesi (aktif birimler, Logo karşılığıyla).
export async function birimSecenekleri(db: Db): Promise<BirimSecenekleriCevabi> {
  return { birimler: (await satisBirimleri(db)).map((b) => ({ kod: b.kod, logo: b.logoBirimSeti })) };
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
  // 3296-3 a: rotaId partide elle seçilen rota; boşsa çeşidin rotası.
  partiler: { id: number; emirTuru: EmirTuru; adet: string; rotaId: number | null }[];
  // 3429-3 F: yalnız "uret" kalemi emir açar.
  karsilama: KarsilamaYolu;
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
      terminElle: k.termin !== null, partiler: (partiler.get(k.id) ?? []).map((p) => ({ id: p.id, emirTuru: p.emir_turu, adet: p.adet, rotaId: p.rota_id })),
      karsilama: k.karsilama,
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

// 3429-3 F3: satın almanın ön talep kaynağı; onaylı siparişin "Satın al" kalemleri. Yetki denetlemez; çağıran satın alma okumasını denetler.
export interface SatinAlinacakKalem { siparisSatiriId: number; siparisId: number; siparisNo: string; firmaId: number; malzemeNo: number; miktar: string; termin: string }
const emirsizKalem = (k: sorgular.SatinAlinacakKalemSatiri): SatinAlinacakKalem => ({
  siparisSatiriId: k.id, siparisId: k.siparis_id, siparisNo: k.siparis_no, firmaId: k.firma_id, malzemeNo: k.malzeme_no, miktar: k.miktar, termin: k.termin,
});
export async function satinAlinacakKalemler(db: Db): Promise<SatinAlinacakKalem[]> {
  return (await sorgular.satinAlinacakKalemler(db)).map(emirsizKalem);
}
// 3429-3 F4: sevkiyatın emirsiz kalem adayları ("Stoktan" ve "Satın al"); emri olmadığı için sevk siparişe kalemden bağlanır.
export interface SevkEdilecekKalem extends SatinAlinacakKalem { karsilama: 'stok' | 'satin-al' }
export async function sevkEdilecekKalemler(db: Db, idler: readonly number[] | null = null): Promise<SevkEdilecekKalem[]> {
  return (await sorgular.emirsizKalemler(db, ['stok', 'satin-al'], idler)).map((k) => ({ ...emirsizKalem(k), karsilama: k.karsilama }));
}

export const siparisOzeti = async (db: Db): Promise<SiparisOzetiCevabi> =>
  sorgular.siparisOzetiSay(db, YAKLASAN_TERMIN_GUN, SIPARIS_OZETI_AY, await denemeIsaretliKimlikler(db, 'siparis'));

export const terminDagilimi = async (db: Db): Promise<TerminDagilimiCevabi> => ({ araliklar: terminAraliklari(await sorgular.terminKalanlari(db, await denemeIsaretliKimlikler(db, 'siparis'))) });

// Takvim (891): termini [baslangic, bitis] içindeki siparişler, firma adıyla. Yetki denetlemez; çağıran siparisler.oku'yu denetler.
// 3478: kademeli uyarı kaynağı (siparisler.onay). VARSAYIM: bekleme açılıştan sayılır; geri alınan onay sayacı baştan başlatmaz.
export async function onayBekleyenSiparisler(db: Db): Promise<{ id: number; no: string; beklemeAni: string }[]> {
  return (await sorgular.onayBekleyenSiparisler(db)).map((s) => ({ id: s.id, no: s.no, beklemeAni: s.olusturma.toISOString() }));
}

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
