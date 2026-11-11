import type { Db } from '#cekirdek/db.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { GERI_BILDIRIM_DURUMLARI } from '#paylasilan/sozlesme/profil.ts';
import type {
  GeriBildirim, GeriBildirimAyrintiCevabi, GeriBildirimDurumu, GeriBildirimGonderGovdesi, GeriBildirimKategoriEkleGovdesi,
  GeriBildirimKategoriGuncelleGovdesi, GeriBildirimKonusu, GeriBildirimListeSatiri, GeriBildirimNotGovdesi, GeriBildirimOzetiCevabi,
  GeriBildirimSecenekleriCevabi, GeriBildirimTakipGovdesi, GeriBildirimTuru, GeriBildirimYanitlaGovdesi, KendiGeriBildirimi,
  MenuSecGovdesi, MenuTercihiCevabi, MiniPanoCevabi, MiniPanoSecGovdesi, ProfilCevabi, TemaCevabi, TemaSecGovdesi,
} from '#paylasilan/sozlesme/profil.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { kisininFazlaMesaisi, kisininIzinleri, kisininKalanIzni, kisininPersonelKarti } from '../ik/disari.ts';
import { kisiAdlari, kisiGorevi, kisilerinIslemleri, kisininRolleri, rollerVeBayraklari } from '../kisiler/disari.ts';
import {
  anaKayitHatasi, gelenBildirimTuru, kapanisBildirilir, kategoriSecilebilir, kayitDurumu, mesaiToplami, ortanca, ozetAylari, PROFIL_GERI_BILDIRIM_SINIRI, profilAraliklari,
  acabildigiSayfalar, bilinmeyenMenuSayfalari, menuCevabiYap, miniPanoCevabiYap, temaCevabiYap, yanitImzasi, yanitSonrasiDurum,
} from './kurallar.ts';
import * as s from './sorgular.ts';

const disaGeriBildirim = ({ kisiId: _kisi, ...g }: s.GeriBildirimSatiri): GeriBildirim => g;

// Yalnız oturumdaki kişinin kaydı okunur; başka kişiyi seçen girdi yoktur.
export async function profilOku(db: Db, kullanici: Kullanici, simdi: Date): Promise<ProfilCevabi> {
  const bugun = tesisGunu(simdi);
  const ar = profilAraliklari(bugun);
  const gorev = await kisiGorevi(db, kullanici.id);
  const personel = await kisininPersonelKarti(db, kullanici.id);
  const izin = await kisininKalanIzni(db, kullanici.id, bugun);
  const izinler = await kisininIzinleri(db, kullanici.id, ar.izinBaslangic, ar.izinBitis);
  const mesai = await kisininFazlaMesaisi(db, kullanici.id, ar.mesaiBaslangic, ar.mesaiBitis);
  const geriBildirimler = await kendiGeriBildirimleri(db, kullanici.id);
  return {
    kisi: { id: kullanici.id, ad: kullanici.ad, gorev },
    personel,
    izin,
    izinler: izinler === null ? null : [...izinler].sort((a, b) => b.baslangic.localeCompare(a.baslangic)),
    fazlaMesai: mesai === null ? null : {
      satirlar: [...mesai.satirlar].sort((a, b) => b.tarih.localeCompare(a.tarih)),
      toplamSaat: mesaiToplami(mesai.satirlar),
      yillikSinirSaat: mesai.yillikSinirSaat,
    },
    geriBildirimler,
    geriBildirimOkur: kullanici.islemler.includes('profil.geri-bildirim-oku'),
  };
}

// Kişi ve zaman sunucudan; gövde yalnız konu, tür ve metni taşır.
// Bildirim aynı transaction'da yazılır: kayıt geri alınırsa bildirim de kalmaz (GBM-8).
export async function geriBildirimGonder(db: Db, kullanici: Kullanici, govde: GeriBildirimGonderGovdesi): Promise<GeriBildirim> {
  const kayit = await s.geriBildirimEkle(db, kullanici.id, { konu: govde.konu, tur: govde.tur, metin: govde.metin.trim() });
  await bildirimGonder(db, {
    tur: gelenBildirimTuru(kayit.konu), baslik: `#${kayit.id} yeni kayıt`, metin: kayit.metin,
    yol: '/geri-bildirim', kaynakKimlik: String(kayit.id), haric: kullanici.id,
  });
  return disaGeriBildirim(kayit);
}

// Çalışanın kendi kayıtları: durum ve yalnız yanıtlar (imzasıyla); iç not, sorumlu ve yanıtlayanın adı girmez.
async function kendiGeriBildirimleri(db: Db, kisiId: number): Promise<KendiGeriBildirimi[]> {
  const kayitlar = await s.kisininGeriBildirimleri(db, kisiId, PROFIL_GERI_BILDIRIM_SINIRI);
  const idler = kayitlar.map((k) => k.id);
  const durumlar = new Map((await s.kendiDurumlari(db, idler)).map((d) => [d.id, d.durum]));
  const yanitlar = await s.kendiYanitlari(db, idler);
  return kayitlar.map((k) => ({
    ...disaGeriBildirim(k),
    durum: durumlar.get(k.id) ?? 'yeni',
    yanitlar: yanitlar.filter((y) => y.geriBildirimId === k.id).map(({ metin, imza, zaman }) => ({ metin, imza, zaman })),
  }));
}

const disaMerkezSatiri = ({ kisiId, ...r }: s.MerkezSatiri, adlar: Map<number, string>): GeriBildirimListeSatiri => ({
  ...r, kisiAdi: adlar.get(kisiId) ?? `Kişi ${kisiId}`,
});

export async function geriBildirimListesi(
  db: Db,
  sorgu: {
    sayfa: number; sayfaBoyu?: number | undefined; konu?: GeriBildirimKonusu | undefined; tur?: GeriBildirimTuru | undefined;
    durum?: GeriBildirimDurumu | undefined; kategoriId?: number | undefined; ara?: string | undefined;
  },
): Promise<SayfaliListe<GeriBildirimListeSatiri>> {
  const ara = sorgu.ara?.trim() ?? '';
  const suzgec: s.ListeSuzgeci = {
    konu: sorgu.konu ?? null, tur: sorgu.tur ?? null, durum: sorgu.durum ?? null, kategoriId: sorgu.kategoriId ?? null, ara: ara === '' ? null : ara,
  };
  return sayfaliListe(sorgu, {
    say: () => s.geriBildirimSay(db, suzgec),
    satirlar: async (dilim) => {
      const satirlar = await s.geriBildirimSatirlari(db, suzgec, dilim);
      const adlar = await kisiAdlari(db, satirlar.map((r) => r.kisiId));
      return satirlar.map((r) => disaMerkezSatiri(r, adlar));
    },
  });
}

export async function geriBildirimAyrinti(db: Db, id: number): Promise<GeriBildirimAyrintiCevabi> {
  const kayit = await s.merkezSatiri(db, id);
  if (kayit === null) throw bulunamadi('Geri bildirim bulunamadı.');
  const takip = await s.takipOku(db, id);
  const hareketler = await s.hareketler(db, id);
  const sorumlu = takip?.sorumluKisiId ?? null;
  const adlar = await kisiAdlari(db, [kayit.kisiId, ...hareketler.map((h) => h.kisiId), ...(sorumlu === null ? [] : [sorumlu])]);
  return {
    kayit: disaMerkezSatiri(kayit, adlar),
    sorumluKisiId: sorumlu,
    sorumluAdi: sorumlu === null ? null : adlar.get(sorumlu) ?? `Kişi ${sorumlu}`,
    surum: takip?.surum ?? 0,
    hareketler: hareketler.map((h) => ({
      id: h.id, tur: h.tur, metin: h.metin, durum: h.durum, imza: h.imza, kisiAdi: adlar.get(h.kisiId) ?? `Kişi ${h.kisiId}`, zaman: h.zaman,
    })),
    baglilar: await s.bagliKayitlar(db, id),
  };
}

// Kaydı kilitler; kayıt yoksa 404. Okunan sürüm (takip satırı yoksa 0) tutmazsa eski sürüm reddi.
async function takipAl(db: Db, id: number, surum: number): Promise<s.TakipSatiri | null> {
  if (!(await s.kayitVarMi(db, id))) throw bulunamadi('Geri bildirim bulunamadı.');
  const takip = await s.takipKilitle(db, id);
  if ((takip?.surum ?? 0) !== surum) throw eskiSurum();
  return takip;
}

async function takipYaz(db: Db, id: number, onceki: s.TakipSatiri | null, yeni: s.TakipYazimi, kisiId: number): Promise<void> {
  const yazilan = onceki === null ? await s.takipEkle(db, id, yeni) : await s.takipGuncelle(db, id, yeni, onceki.surum);
  if (yazilan === null) throw eskiSurum();
  if (kayitDurumu(onceki) === yeni.durum) return;
  await s.hareketEkle(db, id, { tur: 'durum', metin: null, durum: yeni.durum, imza: null, kisiId });
  // GBM-9: sonuçlanınca yazana haber gider; durum adı çalışanın gördüğü adla.
  if (kapanisBildirilir(kayitDurumu(onceki), yeni.durum)) {
    await yazanaBildir(db, id, kisiId, 'profil.geri-bildirim-kapandi', yeni.durum === 'cozuldu' ? 'Çözüldü' : 'Kapandı', null);
  }
}

// Yanıt ve kapanış yalnız yazana gider; yanıtlayan kendisi yazmışsa almaz (bildirimin `haric` kuralı).
async function yazanaBildir(
  db: Db, id: number, yapan: number, tur: 'profil.geri-bildirime-yanit' | 'profil.geri-bildirim-kapandi', baslikEki: string, metin: string | null,
): Promise<void> {
  const yazan = await s.kayitYazani(db, id);
  if (yazan === null) return;
  await bildirimGonder(db, { tur, baslik: `#${id} ${baslikEki}`, metin, yol: '/profil', kisiler: [yazan], haric: yapan });
}

const mevcutYazim = (t: s.TakipSatiri | null): s.TakipYazimi => ({
  durum: kayitDurumu(t), kategoriId: t?.kategoriId ?? null, sorumluKisiId: t?.sorumluKisiId ?? null, anaKayitId: t?.anaKayitId ?? null,
});

// GBM-2, GBM-3: yanıt yazana görünür, rol adıyla imzalanır; açık kayıt "yanıtlandı" olur. Kişi ve zaman sunucudan.
export async function geriBildirimYanitla(db: Db, kullanici: Kullanici, id: number, govde: GeriBildirimYanitlaGovdesi): Promise<GeriBildirimAyrintiCevabi> {
  const takip = await takipAl(db, id, govde.surum);
  const roller = new Set((await kisininRolleri(db, kullanici.id)).map((r) => r.id));
  const imza = yanitImzasi((await rollerVeBayraklari(db)).filter((r) => roller.has(r.id)));
  await s.hareketEkle(db, id, { tur: 'yanit', metin: govde.metin.trim(), durum: null, imza, kisiId: kullanici.id });
  await yazanaBildir(db, id, kullanici.id, 'profil.geri-bildirime-yanit', `yanıt: ${imza}`, govde.metin.trim());
  const yazim = mevcutYazim(takip);
  await takipYaz(db, id, takip, { ...yazim, durum: yanitSonrasiDurum(yazim.durum) }, kullanici.id);
  return geriBildirimAyrinti(db, id);
}

// İç not yalnız merkezdedir; takip satırını değiştirmez, yalnız eklenir.
export async function geriBildirimNotEkle(db: Db, kullanici: Kullanici, id: number, govde: GeriBildirimNotGovdesi): Promise<GeriBildirimAyrintiCevabi> {
  if (!(await s.kayitVarMi(db, id))) throw bulunamadi('Geri bildirim bulunamadı.');
  await s.hareketEkle(db, id, { tur: 'not', metin: govde.metin.trim(), durum: null, imza: null, kisiId: kullanici.id });
  return geriBildirimAyrinti(db, id);
}

// Durum, kategori, sorumlu ve ana kayıt tek komutla, okunan sürümle yazılır (GBM-4, GBM-5).
export async function geriBildirimTakipDegistir(db: Db, kullanici: Kullanici, id: number, govde: GeriBildirimTakipGovdesi): Promise<GeriBildirimAyrintiCevabi> {
  const takip = await takipAl(db, id, govde.surum);
  if (govde.kategoriId !== null && govde.kategoriId !== takip?.kategoriId) {
    if (!kategoriSecilebilir(await s.kategori(db, govde.kategoriId), takip?.kategoriId ?? null)) {
      throw dogrulama('Kategori bulunamadı ya da pasif.', 'kategoriId');
    }
  }
  if (govde.sorumluKisiId !== null && govde.sorumluKisiId !== takip?.sorumluKisiId) {
    if (!(await sorumluAdaylari(db)).some((k) => k.id === govde.sorumluKisiId)) {
      throw dogrulama('Sorumlu, yanıtlama yetkisi olan etkin bir kişi olmalı.', 'sorumluKisiId');
    }
  }
  if (govde.anaKayitId !== null && govde.anaKayitId !== takip?.anaKayitId) {
    if (!(await s.kayitVarMi(db, govde.anaKayitId))) throw dogrulama(`#${govde.anaKayitId} bulunamadı.`, 'anaKayitId');
    const hata = anaKayitHatasi({
      id, anaKayitId: govde.anaKayitId, ananinAnasi: (await s.takipOku(db, govde.anaKayitId))?.anaKayitId ?? null,
      bagliSayisi: await s.bagliKayitSayisi(db, id),
    });
    if (hata !== null) throw dogrulama(hata, 'anaKayitId');
  }
  await takipYaz(db, id, takip, {
    durum: govde.durum, kategoriId: govde.kategoriId, sorumluKisiId: govde.sorumluKisiId, anaKayitId: govde.anaKayitId,
  }, kullanici.id);
  return geriBildirimAyrinti(db, id);
}

// Yanıtlama işlemi olan etkin, girişli kişiler (bayraklı rol bütün işlemleri taşır).
async function sorumluAdaylari(db: Db): Promise<{ id: number; ad: string }[]> {
  const idler = [...(await kisilerinIslemleri(db)).entries()]
    .filter(([, islemler]) => islemler.includes('profil.geri-bildirim-yanitla')).map(([id]) => id);
  const adlar = await kisiAdlari(db, idler);
  return idler.map((id) => ({ id, ad: adlar.get(id) ?? `Kişi ${id}` })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.id - b.id);
}

export async function geriBildirimSecenekleri(db: Db): Promise<GeriBildirimSecenekleriCevabi> {
  return { kategoriler: await s.kategoriler(db), sorumlular: await sorumluAdaylari(db) };
}

export async function geriBildirimOzeti(db: Db, simdi: Date): Promise<GeriBildirimOzetiCevabi> {
  const aylar = ozetAylari(tesisGunu(simdi));
  const baslangic = `${aylar[0] ?? tesisGunu(simdi).slice(0, 7)}-01`;
  const sayilar = new Map((await s.durumSayilari(db)).map((d) => [d.durum, d.n]));
  const aylik = new Map((await s.aylikHareket(db, baslangic)).map((a) => [a.ay, a]));
  return {
    durumlar: Object.fromEntries(GERI_BILDIRIM_DURUMLARI.map((d) => [d, sayilar.get(d) ?? 0])) as Record<GeriBildirimDurumu, number>,
    kategoriler: await s.kategoriDagilimi(db, baslangic),
    aylar: aylar.map((ay) => {
      const a = aylik.get(ay);
      return { ay, gelen: a?.gelen ?? 0, cozulen: a?.cozulen ?? 0, ilkYanitOrtancaSaat: ortanca(a?.ilkYanitSaatleri ?? []) };
    }),
  };
}

export async function geriBildirimKategoriEkle(db: Db, govde: GeriBildirimKategoriEkleGovdesi): Promise<GeriBildirimSecenekleriCevabi> {
  const ad = govde.ad.trim();
  if (await s.kategoriAdiVarMi(db, ad, null)) throw dogrulama('Bu adla bir kategori var.', 'ad');
  await s.kategoriEkle(db, ad, govde.konu);
  return geriBildirimSecenekleri(db);
}

export async function geriBildirimKategoriGuncelle(
  db: Db, id: number, govde: GeriBildirimKategoriGuncelleGovdesi,
): Promise<GeriBildirimSecenekleriCevabi> {
  if ((await s.kategori(db, id)) === null) throw bulunamadi('Kategori bulunamadı.');
  const ad = govde.ad.trim();
  if (await s.kategoriAdiVarMi(db, ad, id)) throw dogrulama('Bu adla bir kategori var.', 'ad');
  if (!(await s.kategoriGuncelle(db, id, { ad, konu: govde.konu, etkin: govde.etkin }, govde.surum))) throw eskiSurum();
  return geriBildirimSecenekleri(db);
}

// Tema yalnız oturumdaki kişinindir; başka kişiyi seçen girdi yoktur.
export async function temaOku(db: Db, kullanici: Kullanici): Promise<TemaCevabi> {
  return temaCevabiYap(await s.temaOku(db, kullanici.id));
}

// PRF-5: ilk seçim sürüm 0 ile, sonrakiler okunan sürümle yazılır; tutmayan sürüm eski sürüm reddidir.
export async function temaSec(db: Db, kullanici: Kullanici, govde: TemaSecGovdesi): Promise<TemaCevabi> {
  const yazilan = govde.surum === 0
    ? await s.temaEkle(db, kullanici.id, govde.tema)
    : await s.temaGuncelle(db, kullanici.id, govde.tema, govde.surum);
  if (yazilan === null) throw eskiSurum();
  return temaCevabiYap(yazilan);
}

// Mini pano seçimi de yalnız oturumdaki kişinindir (PRF-6); tema gibi sürümle yazılır.
export async function miniPanoOku(db: Db, kullanici: Kullanici): Promise<MiniPanoCevabi> {
  return miniPanoCevabiYap(await s.miniPanoOku(db, kullanici.id));
}

export async function miniPanoSec(db: Db, kullanici: Kullanici, govde: MiniPanoSecGovdesi): Promise<MiniPanoCevabi> {
  const kapali = [...govde.kapali].sort();
  const yazilan = govde.surum === 0
    ? await s.miniPanoEkle(db, kullanici.id, kapali, govde.acilistaOner)
    : await s.miniPanoGuncelle(db, kullanici.id, kapali, govde.acilistaOner, govde.surum);
  if (yazilan === null) throw eskiSurum();
  return miniPanoCevabiYap(yazilan);
}

const MENU_SAYFALARI: ReadonlySet<string> = new Set(SAYFALAR.map((sayfa) => sayfa.yol));
// Kişinin bu oturumda açabildiği sayfalar: istemcinin menüsüyle aynı ölçü (sayfanın işlemi kişinin listesinde).
const acabildigiYollar = (kullanici: Kullanici): ReadonlySet<string> =>
  new Set(SAYFALAR.filter((sayfa) => islemVarMi(kullanici, sayfa.islem)).map((sayfa) => sayfa.yol));

// Sık kullanılanlar kişinin kendi menüsüdür (2951): okuma ve seçme yalnız oturumdaki kişinin kendi kaydınadır; mini pano gibi
// sürümle yazılır. Liste kişinin açabildiği sayfalara süzülür (PRF-9); yetki modeli değişmez.
export async function menuTercihiOku(db: Db, kullanici: Kullanici): Promise<MenuTercihiCevabi> {
  return menuCevabiYap(await s.menuTercihiOku(db, kullanici.id), acabildigiYollar(kullanici));
}

export async function menuTercihiSec(db: Db, kullanici: Kullanici, govde: MenuSecGovdesi): Promise<MenuTercihiCevabi> {
  if (bilinmeyenMenuSayfalari(govde.sayfalar, MENU_SAYFALARI).length > 0) throw dogrulama('Seçilen sayfa menüde yok.', 'sayfalar');
  const acabildigi = acabildigiYollar(kullanici);
  const sayfalar = acabildigiSayfalar(govde.sayfalar, acabildigi);
  const yazilan = govde.surum === 0
    ? await s.menuTercihiEkle(db, kullanici.id, sayfalar)
    : await s.menuTercihiGuncelle(db, kullanici.id, sayfalar, govde.surum);
  if (yazilan === null) throw eskiSurum();
  return menuCevabiYap(yazilan, acabildigi);
}
