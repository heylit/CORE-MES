import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { bagimliKayit, bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type {
  Alet, AletAyrintiCevabi, AletGuncelleGovdesi, AletOlusturGovdesi, KalibrasyonGovdesi, ListeCevabi, OzetCevabi, Sonuc, Tur,
} from '#paylasilan/sozlesme/kalibrasyon.ts';
import { kisiAdlari, kisileriListele } from '../kisiler/disari.ts';
import {
  SON_KAYIT_SAYISI, VARSAYILAN_PERIYOT_GUN, aramayaUyar, belirleyenKayit, gelecekTarihMi, kalibrasyonEtkisi, ozetSay,
  olcumdeKullanilabilirMi, turdeGecerliAletVarMi, turet, vadeyeGoreSirala,
} from './kurallar.ts';
import {
  aktifTurleriGetir, aletEkle, aletGuncelle, aletSil, aletVarMi, aletiKilitle, aletinTuru, aletleriGetir, bugunuGetir, kayitEkle,
  kayitSayisi, kayitSiralari, kullanimDisiMi, kullanimDurumuYaz, sonKayitlarHepsi, sonKayitlariGetir, turBul, turEkle, turGuncelle, turleriGetir,
} from './sorgular.ts';
import type { AletAlanlari, AletSatiri } from './sorgular.ts';

const ALET_YOK = 'Ölçü aleti bulunamadı.';
const GELECEK_TARIH = 'Kalibrasyon tarihi bugünden sonra olamaz.';
const NO_KULLANILIYOR = 'Bu alet numarası kullanılıyor.';
const TUR_ADI_KULLANILIYOR = 'Bu tür adı kullanılıyor.';

export function aleteCevir(s: AletSatiri): Alet {
  const t = turet({
    kullanimDisi: s.kullanim_disi, sonUygunTarih: s.son_uygun, periyotGun: s.periyot_gun, bugun: s.bugun,
  });
  return {
    id: s.id,
    no: s.no,
    turId: s.tur_id,
    tur: s.tur,
    ad: s.ad,
    olcmeAraligi: s.olcme_araligi,
    yer: s.yer,
    periyotGun: s.periyot_gun,
    kullanimDisi: s.kullanim_disi,
    kullanimDisiNedeni: s.kullanim_disi_nedeni,
    sonKalibrasyon: s.son_uygun,
    ...t,
    surum: s.surum,
  };
}

export async function aletleriListele(db: Db, ara: string | undefined): Promise<ListeCevabi> {
  const hepsi = (await aletleriGetir(db)).map(aleteCevir);
  // Sayılar süzgeçten bağımsızdır: arama listeyi daraltır, atölyenin durumunu değiştirmez.
  return { aletler: vadeyeGoreSirala(hepsi.filter((a) => aramayaUyar(a, ara))), ozet: ozetSay(hepsi) };
}

// Liste ucunun özetiyle aynı hesap; ana sayfa kartı listeyi taşımaz.
export async function aletOzeti(db: Db): Promise<OzetCevabi> {
  return ozetSay((await aletleriGetir(db)).map(aleteCevir));
}

export async function aletAyrintisi(db: Db, id: number): Promise<AletAyrintiCevabi> {
  const [satir] = await aletleriGetir(db, { id });
  if (satir === undefined) throw bulunamadi(ALET_YOK);
  const kayitlar = await sonKayitlariGetir(db, id, SON_KAYIT_SAYISI);
  const adlar = kayitlar.length === 0 ? new Map<number, string>() : new Map((await kisileriListele(db)).map((k) => [k.id, k.ad]));
  return {
    ...aleteCevir(satir),
    sonKayitlar: kayitlar.map((k) => {
      const kisiAd = adlar.get(k.kisi_id);
      // Yabancı anahtar kişiyi tutar; ad bulunamıyorsa uydurulmaz.
      if (kisiAd === undefined) throw new Error(`Kalibrasyon kaydının kişisi bulunamadı: ${k.id}`);
      return { id: k.id, tarih: k.tarih, sonuc: k.sonuc, sertifikaNo: k.sertifika_no, aciklama: k.aciklama, kisiAd };
    }),
    kayitSayisi: await kayitSayisi(db, id),
  };
}

// Pasif tür yeni alete seçilemez; aletin var olan türü pasifleşse de alet o türde kalabilir.
async function turuDenetle(db: Db, turId: number, mevcutTur: number | null): Promise<void> {
  const tur = await turBul(db, turId);
  if (tur === null) throw dogrulama('Alet türü bulunamadı.', 'turId');
  if (!tur.aktif && turId !== mevcutTur) throw dogrulama('Bu tür kullanımdan kaldırıldı; başka bir tür seçin.', 'turId');
}

async function cakismayiCevir<T>(is: () => Promise<T>, ileti: string): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    if (kisitIhlali(hata)?.hata.kod === 'CAKISMA') throw cakisma(ileti);
    throw hata;
  }
}

function alanlar(g: Omit<AletGuncelleGovdesi, 'surum'>): AletAlanlari {
  return {
    no: g.no, turId: g.turId, ad: g.ad ?? null, olcmeAraligi: g.olcmeAraligi ?? null, yer: g.yer ?? null,
    periyotGun: g.periyotGun,
  };
}

// `bugun` verilmezse veritabanının bugünüdür; testler saati buradan verir.
async function kayitYaz(db: Db, kisiId: number, aletId: number, govde: KalibrasyonGovdesi, bugun?: string): Promise<void> {
  if (govde.tarih !== undefined && gelecekTarihMi(govde.tarih, bugun ?? await bugunuGetir(db))) {
    throw dogrulama(GELECEK_TARIH, 'tarih');
  }
  const id = await kayitEkle(db, {
    aletId, tarih: govde.tarih ?? null, kisiId, sonuc: govde.sonuc, sertifikaNo: govde.sertifikaNo ?? null, aciklama: govde.aciklama ?? null,
  });
  // Geriye dönük kayıt deftere girer ama daha yeni tarihli kaydın belirlediği kullanım durumunu değiştirmez.
  if (belirleyenKayit(await kayitSiralari(db, aletId))?.id !== id) return;
  const etki = kalibrasyonEtkisi(govde.sonuc);
  await kullanimDurumuYaz(db, aletId, etki.kullanimDisi, etki.neden);
}

export async function aletOlustur(db: Db, kisiId: number, govde: AletOlusturGovdesi, bugun?: string): Promise<AletAyrintiCevabi> {
  const alan = alanlar({ ...govde, periyotGun: govde.periyotGun ?? VARSAYILAN_PERIYOT_GUN });
  await turuDenetle(db, alan.turId, null);
  const id = await cakismayiCevir(() => aletEkle(db, alan), NO_KULLANILIYOR);
  if (govde.ilkKalibrasyon !== undefined) await kayitYaz(db, kisiId, id, govde.ilkKalibrasyon, bugun);
  return aletAyrintisi(db, id);
}

export async function aletDuzenle(db: Db, id: number, govde: AletGuncelleGovdesi): Promise<AletAyrintiCevabi> {
  const alan = alanlar(govde);
  const mevcut = await aletinTuru(db, id);
  if (mevcut === null) throw bulunamadi(ALET_YOK);
  await turuDenetle(db, alan.turId, mevcut);
  await cakismayiCevir(() => surumluGuncelle({
    guncelle: () => aletGuncelle(db, id, alan, govde.surum),
    varMi: () => aletVarMi(db, id),
    bulunamadiIletisi: ALET_YOK,
  }), NO_KULLANILIYOR);
  return aletAyrintisi(db, id);
}

export async function kalibrasyonKaydet(
  db: Db, kisiId: number, aletId: number, govde: KalibrasyonGovdesi, bugun?: string,
): Promise<AletAyrintiCevabi> {
  // Eşzamanlı iki kayıt sırayla işlenir: ikincisi birincinin kaydını görerek belirleyen kaydı seçer.
  if (!(await aletiKilitle(db, aletId))) throw bulunamadi(ALET_YOK);
  await kayitYaz(db, kisiId, aletId, govde, bugun);
  return aletAyrintisi(db, aletId);
}

export async function kullanimDisiBirak(db: Db, id: number, neden: string): Promise<AletAyrintiCevabi> {
  if (!(await aletiKilitle(db, id))) throw bulunamadi(ALET_YOK);
  if ((await kullanimDisiMi(db, id)) === true) throw cakisma('Alet zaten kullanım dışı.');
  await kullanimDurumuYaz(db, id, true, neden);
  return aletAyrintisi(db, id);
}

export async function aletiSil(db: Db, id: number): Promise<void> {
  if (!(await aletiKilitle(db, id))) throw bulunamadi(ALET_YOK);
  if ((await kayitSayisi(db, id)) > 0) {
    throw bagimliKayit('Kalibrasyon kaydı olan alet silinemez; kullanım dışı bırakın.');
  }
  await aletSil(db, id);
}

export async function turleriListele(db: Db): Promise<Tur[]> {
  return (await turleriGetir(db)).map((t) => ({ id: t.id, ad: t.ad, aktif: t.aktif, aletSayisi: t.alet_sayisi, surum: t.surum }));
}

export async function turOlustur(db: Db, ad: string): Promise<Tur[]> {
  await cakismayiCevir(() => turEkle(db, ad), TUR_ADI_KULLANILIYOR);
  return turleriListele(db);
}

export async function turDuzenle(db: Db, id: number, ad: string, aktif: boolean, surum: number): Promise<Tur[]> {
  await cakismayiCevir(() => surumluGuncelle({
    guncelle: () => turGuncelle(db, id, ad, aktif, surum),
    varMi: async () => (await turBul(db, id)) !== null,
    bulunamadiIletisi: 'Alet türü bulunamadı.',
  }), TUR_ADI_KULLANILIYOR);
  return turleriListele(db);
}

export function aktifTurler(db: Db): Promise<{ id: number; ad: string }[]> {
  return aktifTurleriGetir(db);
}

export async function gecerliAletVarMi(db: Db, turId: number): Promise<boolean | null> {
  const durumlar = (await aletleriGetir(db, { turId })).map((s) => aleteCevir(s).durum);
  return turdeGecerliAletVarMi(durumlar);
}

// KLB-17: ölçüme bağlanacak alet (kimliğiyle) bugün kullanılabilir mi; olmayan alet kullanılamaz.
export async function olcumAletiGecerliMi(db: Db, id: number): Promise<boolean> {
  const [satir] = await aletleriGetir(db, { id });
  return satir !== undefined && olcumdeKullanilabilirMi(aleteCevir(satir).durum);
}

export async function vadesiGecenAletSayisi(db: Db): Promise<number> {
  return (await aletOzeti(db)).vadesiGecen;
}

export async function aletGetir(db: Db, id: number): Promise<{
  id: number; no: string; turId: number; tur: string; vade: string | null; durum: Alet['durum'];
} | null> {
  const [satir] = await aletleriGetir(db, { id });
  if (satir === undefined) return null;
  const a = aleteCevir(satir);
  return { id: a.id, no: a.no, turId: a.turId, tur: a.tur, vade: a.vade, durum: a.durum };
}

// KAL-A7 (#518): ölçü aletlerinin tek kaynağı bu modüldür; Arkon alet listesini ve kalibrasyon geçmişini buradan okur.
// Kayıtlar eskiden yeniye, alet başına en çok `kayitAdedi`.
export interface AletKaydi { tarih: string; sonuc: Sonuc; sertifikaNo: string | null; aciklama: string | null; kisiAd: string | null }
export async function aletlerVeKayitlari(db: Db, kayitAdedi: number): Promise<(Alet & { kayitlar: AletKaydi[] })[]> {
  const aletler = (await aletleriGetir(db)).map(aleteCevir);
  const kayitlar = await sonKayitlarHepsi(db, kayitAdedi);
  const adlar = await kisiAdlari(db, [...new Set(kayitlar.map((k) => k.kisi_id))]);
  const aletBasina = new Map<number, typeof kayitlar>();
  for (const k of kayitlar) aletBasina.set(k.alet_id, [...(aletBasina.get(k.alet_id) ?? []), k]);
  return vadeyeGoreSirala(aletler).map((a) => ({
    ...a,
    kayitlar: (aletBasina.get(a.id) ?? []).map((k) => ({
      tarih: k.tarih, sonuc: k.sonuc, sertifikaNo: k.sertifika_no, aciklama: k.aciklama, kisiAd: adlar.get(k.kisi_id) ?? null,
    })),
  }));
}
