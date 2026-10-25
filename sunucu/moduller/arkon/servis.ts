import { createHash, randomUUID } from 'node:crypto';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { kayitNoktasi, vtHataIzi, vtSureDoldu, vtUlasilamadi } from '#cekirdek/db.ts';
import { ACIK_EMIR_DURUMLARI, makineDoluAyrintisi, sayimGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { UygulamaHatasi, bulunamadi, cakisma, cokIstek, dogrulama, eskiSurum, gecersiz, kapsamDisi, yetkiYok } from '#cekirdek/hata.ts';
import { kapsamSuzgeci, kapsamdaMi, kisininKapsami } from '#cekirdek/kapsam.ts';
import type { Kapsam } from '#cekirdek/kapsam.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Istasyon } from '#paylasilan/sozlesme/istasyonlar.ts';
import type {
  ArkonDeposu, ArkonRefakatKarti, ArkonKayitTuru, ArkonOzetiCevabi, ArkonKisi, ArkonRolu, BelgeYazCevabi, IletilerCevabi, KayitEkleCevabi, MakineAyrimlariCevabi, MakineDevralGovdesi, MakineDoluRedAyrintisi, YansimalarCevabi, YansimaYenidenCevabi, YansimaSonucu as ListeSonucu,
  MerkezBelgelerCevabi, MerkezEkleCevabi, MerkezKontrolCevabi, SonOlaylarCevabi, AnomaliCevabi, AnomaliIstasyonSatiri, AnomaliIstatistikCevabi, OperatorOzetiCevabi, OzetDonemi, AnomaliKisiSatiri, AnomaliMakineSatiri,
} from '#paylasilan/sozlesme/arkon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { AZAMI_DOSYA, DOSYA_PARCASI } from '#paylasilan/sozlesme/arkon.ts';
import type { KuyrukSiralaGovdesi } from '#paylasilan/sozlesme/arkon.ts';
import { durusNedenleriniListele, hurdaNedenleriniListele } from '../durus-nedenleri/disari.ts';
import { aletlerVeKayitlari, olcumAletiGecerliMi } from '../kalibrasyon/disari.ts';
import { ilkParcaKararlari } from '../kalite-merkezi/disari.ts';
import {
  eskiKoddanKimlikCoz, isMerkezleri, istasyonGetir, istasyonKisiAtamalari, istasyonYetkinlikleri, makineGetir, istasyondakiMakineler, istasyonKisileri, istasyonlar, kisininIzinliIsMerkezleri, kisilerinIzinliIsMerkezleri, aktifMakineler,
  istasyonKapasitesi, kapasiteKaynaklari, makineKisiAtamalari, planAyarlari, makineler, makineDurumlari, makineDurumuYaz,
} from '../istasyonlar/disari.ts';
import { kisiAdlari, kisileriListele, kisilerinIslemleri, kisilerinRolIslemleri, kullaniciYukle } from '../kisiler/disari.ts';
import { malzemeAra } from '../malzemeler/disari.ts';
import { malzemeIstegiAc, malzemeIstekleri, numuneTeslimi, emrinRefakatKartlari, uretimGirdiUyarisi } from '../stok/disari.ts';
import { bekleyenSiralar, canliSira, kuyruguSirala, taslaktakiler } from '../plan/disari.ts';
import { adimEtkinSureleriToplu, gecerliTalimat, girdisiEksikRevizyonlar, revizyonGetir } from '../rota/disari.ts';
import { basladigiGunTakvimi, basladigiGunTakvimleri, calismaTakvimi, calismaTakvimleri, takvimGunleri, vardiyaTanimlari } from '../vardiya/disari.ts';
import { izinliKisiler, kisininFazlaMesaisi, kisininIzinleri, kisininKalanIzni } from '../ik/disari.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { ekipCagrisiBildir } from '../bildirim/disari.ts';
import { yayindakiBelgeDosyasi, yayindakiBelgeler } from '../cizimler/disari.ts';
import { isEmriHazirlikDurumlari } from '../cnc-kurulum/disari.ts';
import {
  acikEmir, acikEmirler, emirAyar, emirBaslat, emirBitir, emirDevam, emirDurdur, emirDuraklat, emirDurumlari, emirOzeti, emirSayim, isEmriOzeti, katil, katilimAyril, katilimDuraklat, katilimlar,
  makineDevral, partiKomutuReddi, planlanacakIsEmirleri, rotasizIsEmirleri, uretimEmriOzeti, aralikAdetleri, katilimSureleri, sonGirisler,
  bitenIsEmirleri, gunlukAralikAdetleri, isEmriPlanBilgileri, kisininGunlukIsEmirleri, kisininHurdaNedenleri, kisininIsEmirleri, komutOnbellegiyle, standartSureler,
  makineAyrimlari as emrinMakineAyrimlari,
} from '../uretim-emirleri/disari.ts';
import type { Emir, Katilim } from '../uretim-emirleri/disari.ts';
import { planliDuruslarinHepsi, planliDurusSilArkon, planliDurusYaz } from '../vardiya/disari.ts';
import type { ArkonDurusHedefi, PlanliDurusKaydi } from '../vardiya/disari.ts';
import {
  ILETILER, ILETI_YENIDEN_YUKLE, cagriBildirimi, belgedenDurusa, durusBelgeKimligi, durusBelgeKimligindenId, durustenBelgeye, iletiBasi, iletiKacirildi, KONUMLU_DEPOLAR, KONUMLU_KAYITLAR, KONUMSUZ, arkonRoluSec, belgeBicimiHatasi, belgeKonumu, kayitBicimiHatasi, durusNedenleriniCevir,
  adimSirasiBaslatmaReddi, emirPaketKimligi, hazirlikEksigi, parcaPaketKimligi, paketParcasi, butunPaketSablonu, parcaYayini, parcaSayimReddi, parcaOlayKarari, emirdenTaslakPaket, isEmriPaketKimligi, isEmrindenTaslakPaket, paketinEmri, paketIsEmri, PAKET_ADIM_SIRASI, ROTALI_EMIR_PAKETI,
  ADIMSIZ_YAYIN, ISTASYONSUZ_YAYIN, PLANSIZ, partiKomutu, planBaslatmaReddi, planDurumlari, planSiralayabilirMi, planSirasiReddi, planSirasiTasinacaklar, siraOnaylari, siraOnayiniYaz,
  KUYRUK_ILETILERI, kuyrukAlanlariniEkle, kuyrukSirasiReddi, planSaatleri,
  plansizKaynak, sablonPaket, tabanCoz, tmiAlanlariniYaz, tmiBirlesikSurum, hurdaNedenleriniCevir, stokaBagliMi, stokDurumuyla, stokIstegiKaynagi, stokIstegiKarari, numuneTeslimGirdisi, numuneTesliminiKoru,
  icerikSurumu, uyariBirlestir, guvensizCizimleriAyikla, iletiKonumu, kapsamdaMiKisitli, konumBosMu, kayitKonumu, kayitSutunlari, konumKimlikleri, ikinciKontrolEksik, ilkParcaOlculeri, gizliYansimaTuru, gecikmeliSayimReddi, tmiRetIletisi, ilkParcaSayimiAsildi, kararBekleyenAdet, KARAR_BEKLIYOR_ALANI, yenidenIlkParcaTabani, ILK_PARCA_ADEDI, ilkParcaYenidenSorulur, yenidenIlkParcaAcik, yenidenKarariDamgala, yenidenKarariDegisti, kodlarAyir, konumCoz, okuyabilirMi, paketEmri, paketIstasyonuReddi, paketKonumu, paketMakinesi, tesisHaritasiKur, kayitGovdesi, kayitReddi, gunlukSatirlari, paketSuzgeciVar, silmeCakisiyorMu, sunucuIletisiMi, tesisKur, tmiAyariMi, yazimCakisiyorMu, arkonVardiyalari, arkonTatilleri, arkonAletleri, TMI_AYARLARI,
  BITMIS_BITIR, DOSYA_KOTASI, olcumAletleri, islemImzasi, yoklamaDenetimiGecerli, katilimYolu, tmidekiDurum, ZATEN_CALISIYOR, GIZLI_YANSIMA_TURLERI, ILETI_HIZI, ISTEK_KILIT_BUTCESI_MS, KILIT_BEKLEME_MS, KUYRUK_DEGISIKLIK_YOK, HAZIRLIK_DEGISIKLIK_YOK, arizaCagrisi, SAYIM_ERTELEME, yansimaNedeni, yansimaSirasi, YANSIYAN_KAYITLAR, yansimaKarari, yenidenDenemeReddi, YENIDEN_YALNIZ_HATALI, alanYetkisiReddi, belgeRoluReddi, onayEskidiMi, onayIcerigi, onayOzetiDamgala, bitenEmirIsareti, bitmisIsReddi, onayZorunluMu, hizSiniriAsildi, iletiReddi, kayitRoluReddi, kisiAlanlariniDoldur, yazmaReddi, yayinEksigi, yerelPaketReddi, yeniSurum, yetkiMatrisi, yuklemeKotasiHatasi,
  cizimRevizyonuReddi, merkezDosyaAdi, merkezDosyaTipi, merkezDurumu, paketMerkezDosyalari, merkezTuruMu, merkezdenAlabilirMi, merkezDurumunuOkuyabilirMi,
  bakimAcikMi, hazirlikBekliyorMu, kaliteBekliyorMu, arizaMakineGecisi, acikArizaMi, ARIZA_ACIKLAMASI,
  adetEksikMi, araliklariBirlestir, araliklariKes, beklenenTopla, bitenIsBeklenen, girisYokAktifDakika, girisYokMu, isEmriBeklenenAdet, kaynakKarsilastir, kesinBeklenen, kisiBeklenen, makineIzinliMi, toplamOran, uretimOrani,
  donemAraligi, donemTopla, etkinGun, gunEkle, gunSiniri, isEmriBeklenenBirlestir, istasyonIsaretli, kalanAdet, kapanacakGunler, performansOrani, planliUretim,
  donemBaslangici, donemBasarisi, ekipOrtalamasi, fazlaMesaiSaati, mesaiGunleri, ozetOranlari, ozetRozetleri, tarihEkle,
  emekVerimi, mesaiSaniyesi,
} from './kurallar.ts';
import type { AnomaliDonemi, YoklamaDenetimi, DonemSatiri, IsEmriPaketGirdisi, DonemToplami, NetAralik, OzetGunu, TmiPlanDurumu } from './kurallar.ts';
import type { ArkonDurumu, BelgeEylemi, DurusKimlikleri, DurusKodlari, GunlukSatiri, KatilimDurumu, KatilimYolu, KayitSutunlari, Konum, KonumKimlikleri, NumuneTeslimGirdisi, StokIstegiGirdisi, TmiAyari, YansimaKarari } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

export const SURUM = '26';

// Arkon verisine yalnız Arkon rolü olan kişi ulaşır; rol kişinin TMI rolünden çözülür (arkonRoluSec).
export async function rolGerekli(db: Db, kullanici: Kullanici): Promise<ArkonRolu> {
  const rol = arkonRoluSec((await kisilerinRolIslemleri(db, kullanici.id)).get(kullanici.id) ?? [], kullanici.islemler);
  if (rol === null) throw yetkiYok(ILETILER.rolYok);
  return rol;
}

type MerkezListesi = Awaited<ReturnType<typeof isMerkezleri>>;

async function isMerkeziKodlari(db: Db, kisiId: number, merkezler?: MerkezListesi): Promise<string[]> {
  return izinliKodlar(await kisininIzinliIsMerkezleri(db, kisiId), merkezler ?? (await isMerkezleri(db, { pasiflerDahil: true })));
}

function izinliKodlar(izinli: readonly number[], merkezler: MerkezListesi): string[] {
  if (izinli.length === 0) return [];
  return merkezler.filter((m) => izinli.includes(m.id)).map((m) => m.kod);
}

// Makineye bakan kişi o makinenin istasyonunda çalışır (Kaynaklar'da operatör çoğu kez makineye atanır, istasyona değil).
// Kişi başına makine atamalarının istasyonları, yüzdesi büyük önce; pasif makine sayılmaz.
async function makineIstasyonlari(db: Db, kisiId: number | null, tarih?: string): Promise<Map<number, number[]>> {
  const makineIstasyonu = new Map((await aktifMakineler(db)).map((m) => [m.id, m.istasyonId]));
  const atamalar = (await makineKisiAtamalari(db, kisiId === null ? { tarih } : { kisiId, tarih })).sort((a, b) => Number(b.yuzde) - Number(a.yuzde));
  const sonuc = new Map<number, number[]>();
  for (const a of atamalar) {
    const istasyonId = makineIstasyonu.get(a.makineId);
    if (istasyonId !== undefined && istasyonId !== null) sonuc.set(a.kisiId, [...(sonuc.get(a.kisiId) ?? []), istasyonId]);
  }
  return sonuc;
}

// Kişi başına tek istasyon, Arkon'un istasyon kimliği olan kodla: en yüksek yüzdeli aktif istasyon ataması (istasyonlar
// `istasyonKisileri`); istasyon ataması yoksa en yüksek yüzdeli makine atamasının istasyonu.
async function kisiIstasyonlari(db: Db): Promise<Map<number, string>> {
  const kodlar = new Map((await istasyonlar(db, { pasiflerDahil: false })).map((i) => [i.id, i.kod]));
  const sonuc = new Map<number, string>();
  for (const [kisiId, [istasyonId]] of await makineIstasyonlari(db, null)) {
    const kod = istasyonId === undefined ? undefined : kodlar.get(istasyonId);
    if (kod !== undefined) sonuc.set(kisiId, kod);
  }
  for (const a of await istasyonKisileri(db)) {
    const kod = kodlar.get(a.istasyonId);
    if (kod !== undefined) sonuc.set(a.kisiId, kod);
  }
  return sonuc;
}

// Kişinin yetkili istasyonları: bugün geçerli istasyon atamaları ve yetkinlikler birlikte (tek kaynak istasyonlar modülüdür).
// Pasif istasyon listede yer almaz.
async function yetkiliIstasyonIdleri(db: Db, kisiId: number | null, tarih?: string): Promise<Map<number, Set<number>>> {
  const sonuc = new Map<number, Set<number>>();
  const ekle = (k: number, i: number) => {
    const kume = sonuc.get(k) ?? new Set<number>();
    kume.add(i);
    sonuc.set(k, kume);
  };
  for (const a of await istasyonKisiAtamalari(db, kisiId === null ? { tarih } : { kisiId, tarih })) ekle(a.kisiId, a.istasyonId);
  for (const y of await istasyonYetkinlikleri(db)) if (kisiId === null || y.kisiId === kisiId) ekle(y.kisiId, y.istasyonId);
  return sonuc;
}

// Terminalin seçebileceği istasyonlar: yetkili istasyonlar ve makine atamalarının istasyonları (makineye bakan kişi o istasyonda
// çalışır). Operatör özetinde makine ataması ayrı listededir, bu yüzden yetkiliIstasyonIdleri'ne katılmaz.
async function yetkiliIstasyonKodlari(db: Db, kisiId: number | null): Promise<Map<number, string[]>> {
  const kodlar = new Map((await istasyonlar(db, { pasiflerDahil: false })).map((i) => [i.id, i.kod]));
  const sonuc = new Map<number, string[]>();
  const tum = await yetkiliIstasyonIdleri(db, kisiId);
  for (const [k, makinelerinkiler] of await makineIstasyonlari(db, kisiId)) tum.set(k, new Set([...(tum.get(k) ?? []), ...makinelerinkiler]));
  for (const [k, idler] of tum) {
    sonuc.set(k, [...idler].flatMap((id) => { const kod = kodlar.get(id); return kod === undefined ? [] : [kod]; }).sort((a, b) => a.localeCompare(b)));
  }
  return sonuc;
}

export async function ben(db: Db, kullanici: Kullanici): Promise<ArkonKisi> {
  const rol = await rolGerekli(db, kullanici);
  return {
    kimlik: String(kullanici.id), ad: kullanici.ad, rol, isMerkezleri: await isMerkeziKodlari(db, kullanici.id),
    istasyon: (await kisiIstasyonlari(db)).get(kullanici.id) ?? null,
    istasyonlar: (await yetkiliIstasyonKodlari(db, kullanici.id)).get(kullanici.id) ?? [], aktif: true,
  };
}

// Arkon'un kişi listesi: Arkon rolü olan aktif TMI kişileri. Kişi ve rol TMI'de yönetilir. Bütün liste yalnız TMI kişi listesini
// okuyabilene (`kisiler.oku`) döner; öteki Arkon kullanıcısı yalnız kendi kaydını alır (ad, rol ve iş merkezi kişisel veridir).
export async function kisiler(db: Db, kullanici: Kullanici): Promise<ArkonKisi[]> {
  if (!islemVarMi(kullanici, 'kisiler.oku')) return [await ben(db, kullanici)];
  await rolGerekli(db, kullanici);
  const merkezler = await isMerkezleri(db, { pasiflerDahil: true });
  // Pasif ve girişsiz kişi işlem haritasında yoktur; listeye girmez.
  const islemler = await kisilerinIslemleri(db);
  const roldenIslemler = await kisilerinRolIslemleri(db);
  const atamalar = await kisiIstasyonlari(db);
  const yetkililer = await yetkiliIstasyonKodlari(db, null);
  const izinliler = await kisilerinIzinliIsMerkezleri(db);
  const sonuc: ArkonKisi[] = [];
  for (const kisi of await kisileriListele(db)) {
    const kisininIslemleri = islemler.get(kisi.id);
    const rol = kisininIslemleri === undefined ? null : arkonRoluSec(roldenIslemler.get(kisi.id) ?? [], kisininIslemleri);
    if (rol === null) continue;
    sonuc.push({ kimlik: String(kisi.id), ad: kisi.ad, rol, isMerkezleri: izinliKodlar(izinliler.get(kisi.id) ?? [], merkezler), istasyon: atamalar.get(kisi.id) ?? null,
      istasyonlar: yetkililer.get(kisi.id) ?? [], aktif: true });
  }
  return sonuc;
}

async function tmiAyari(db: Db, kimlik: TmiAyari): Promise<unknown> {
  // Yetkiler TMI'dedir (rol x işlem) ve sunucu tablolarından türer; kv/perms'e önceden yazılmış değer yok sayılır.
  if (kimlik === 'perms') return yetkiMatrisi();
  if (kimlik === 'shifts') return arkonVardiyalari(await vardiyaTanimlari(db));
  if (kimlik === 'holidays') return arkonTatilleri(await takvimGunleri(db));
  if (kimlik === 'plant') {
    return tesisKur(
      await isMerkezleri(db, { pasiflerDahil: true }),
      await istasyonlar(db, { pasiflerDahil: true }),
      await aktifMakineler(db),
    );
  }
  // Neden listesi TMI'de boşsa ayar yoktur; Arkon kendi varsayılanıyla açılır.
  if (kimlik === 'reasons') {
    const nedenler = await durusNedenleriniListele(db, { yalnizAktif: false });
    return nedenler.length === 0 ? null : durusNedenleriniCevir(nedenler);
  }
  const nedenler = await hurdaNedenleriniListele(db, { yalnizAktif: false });
  return nedenler.length === 0 ? null : hurdaNedenleriniCevir(nedenler);
}

// TMI'den türeyen belge Arkon'un kv biçimindedir ({ v }); sürümü içeriğinden gelir.
const kvBelgesi = (kimlik: string, deger: unknown) => {
  const govde = { v: deger };
  return { kimlik, surum: icerikSurumu(govde), govde };
};

// A7 (#518): ölçü aletleri Kalibrasyon modülündendir; Arkon'da kayıtlı `gauges` belgeleri okunmaz (ilk geçişte kopyalandı).
// Arkon en çok son 40 kalibrasyonu tutuyordu (bakim-raporlar.ts saveCal).
const ARKON_KAL_ADEDI = 40;
async function tmiAletleri(db: Db): Promise<{ kimlik: string; surum: number; govde: unknown }[]> {
  return arkonAletleri(await aletlerVeKayitlari(db, ARKON_KAL_ADEDI)).map((govde) => ({ kimlik: String(govde['id']), surum: icerikSurumu(govde), govde }));
}

interface KayitliPaket { kimlik: string; surum: number; govde: unknown }

// TMI'den türeyen taslaklar: rotasız açık emir başına `tmi-ue`, rotalı açık emrin iş emri başına `tmi-ie` (kurallar.ts `isEmrindenTaslakPaket`).
// `yeni` kayıtlı olmayanlardır; `isEmri` kayıtlı paketin TMI alanlarını yazmak için bütün iş emri taslaklarıdır. Kayıtlı `tmi-ue` paketi olan
// rotalı emir kapanana dek eski biçimde kalır: o emre iş emri paketi açılmaz.
async function tmiTaslaklari(db: Db, kayitli: readonly KayitliPaket[], acik?: readonly Emir[], yalniz?: number) {
  const istasyonlarById = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  const kayitliKimlik = new Set(kayitli.map((b) => b.kimlik));
  const emirler = acik ?? (await acikEmirler(db));
  const yeni = yalniz !== undefined ? [] : emirler.flatMap((emir) => {
    const istasyon = istasyonlarById.get(emir.istasyon.id);
    if ((emir.malzemeNo ?? null) !== null || istasyon === undefined || kayitliKimlik.has(emirPaketKimligi(emir.id))) return [];
    const govde = emirdenTaslakPaket(emir, istasyon);
    return [{ kimlik: govde.id, surum: icerikSurumu(govde), govde: govde as unknown }];
  });
  const isEmri = await isEmriTaslaklari(db, kayitli, kayitliKimlik, emirler, istasyonlarById, yalniz);
  // Bölünmüş işin bütün paketi taslak olarak açılmaz: operatöre parçaları düşer.
  for (const [kimlik, govde] of isEmri) {
    const tmi = govde['tmi'] as { bolunmus?: boolean } | undefined;
    if (!kayitliKimlik.has(kimlik) && tmi?.bolunmus !== true) yeni.push({ kimlik, surum: icerikSurumu(govde), govde });
  }
  return { yeni, isEmri };
}

// İş emirleri tek okumadır; istasyon makine kaynağından (aktif makineler tek okuma), kişi kaynağında, kaynaksızda ve bulunamayan makinede iş emrinin
// kendisinden okunur. Revizyon harfi revizyon başına, talimat yalnız kayıtsız ve şablonsuz pakette (malzeme, operasyon) başına bir kez okunur. Plan
// durumu bütün açık rotalı iş emirleri için tek okumadır (tek paket okumasında da): sıra kaynaktaki öteki işlere göredir. Kart #1257: rotasız emrin
// adımları da pakettir (plan durumu yok); istasyonu bilinmeyen iş emri istasyonsuz paket olur, Hazırlık nedenini gösterir ve yayınlanamaz.
async function isEmriTaslaklari(
  db: Db, kayitli: readonly KayitliPaket[], kayitliKimlik: ReadonlySet<string>, acik: readonly Emir[], istasyonlarById: ReadonlyMap<number, Istasyon>, yalniz?: number,
): Promise<Map<string, Record<string, unknown>>> {
  const emirler = new Map(acik.map((e) => [e.id, e]));
  const rotali = (await planlanacakIsEmirleri(db)).filter((i) => emirler.has(i.uretimEmriId));
  const tumu = [...rotali, ...(await rotasizIsEmirleri(db)).filter((i) => emirler.has(i.uretimEmriId))];
  const isEmirleri = tumu.filter((i) => (yalniz === undefined || i.id === yalniz) && !kayitliKimlik.has(emirPaketKimligi(i.uretimEmriId)));
  const sonuc = new Map<string, Record<string, unknown>>();
  if (isEmirleri.length === 0) return sonuc;
  const zorunlu = await sistemAyariOku(db, 'arkon.yalniz-canli-plan');
  const { yerlesimler } = await canliSira(db, rotali.map((i) => i.id));
  const saatler = planSaatleri(yerlesimler);
  const kuyruk = new Map((await sorgular.kuyrukSiralari(db)).map((k) => [k.parcaNo === 0 ? isEmriPaketKimligi(k.isEmriId) : parcaPaketKimligi(k.isEmriId, k.parcaNo), k]));
  const parcaPlanlari = new Map<string, TmiPlanDurumu>();
  const planlar = planDurumlari(yerlesimler, new Map(rotali.map((i) => [i.id, i.kaynak])), zorunlu, parcaPlanlari);
  siraOnayiniYaz(planlar, siraOnaylari(await bekleyenSiralar(db, [...planlar.keys()])));
  const bolmeler = new Map(yerlesimler.flatMap((y) => (y.parcalar?.length ? [[y.isEmriId, y.parcalar] as const] : [])));
  const taslakta = await taslaktakiler(db, rotali.filter((i) => !planlar.has(i.id)).map((i) => i.id));
  const makineler = new Map((await aktifMakineler(db)).map((m) => [m.id, m]));
  const rotaEksik = await girdisiEksikRevizyonlar(db, isEmirleri.flatMap((i) => (i.kaynakRotaRevizyonId === null ? [] : [i.kaynakRotaRevizyonId])));
  const revizyonlar = new Map<number, string | null>();
  const talimatlar = new Map<string, string | null>();
  const govdeler = kayitli.map((b) => b.govde);
  const kayitliGovde = new Map(kayitli.map((b) => [b.kimlik, b.govde]));
  const girdiler: IsEmriPaketGirdisi[] = [];
  for (const ie of isEmirleri) {
    const emir = emirler.get(ie.uretimEmriId);
    const makine = ie.kaynak?.tur === 'makine' ? makineler.get(ie.kaynak.id) : undefined;
    const istasyonId = makine?.istasyonId ?? (await isEmriOzeti(db, ie.id))?.istasyonId ?? null;
    const istasyon = istasyonId === null ? null : istasyonlarById.get(istasyonId);
    if (emir === undefined || istasyon === undefined) continue;
    const revizyonId = ie.kaynakRotaRevizyonId;
    if (revizyonId !== null && !revizyonlar.has(revizyonId)) revizyonlar.set(revizyonId, (await revizyonGetir(db, revizyonId))?.harf ?? null);
    const revizyon = revizyonId === null ? null : revizyonlar.get(revizyonId) ?? null;
    const kayitsiz = !kayitliKimlik.has(isEmriPaketKimligi(ie.id));
    const sablon = kayitsiz ? sablonPaket(govdeler, ie.malzemeNo, ie.opNo, revizyon) : null;
    const anahtar = `${ie.malzemeNo}:${ie.opNo}`;
    if (kayitsiz && sablon === null && !talimatlar.has(anahtar)) talimatlar.set(anahtar, (await gecerliTalimat(db, ie.malzemeNo, ie.opNo))?.metin ?? null);
    const girdi: IsEmriPaketGirdisi = {
      isEmri: ie, emir, istasyon, makineKodu: makine?.kod ?? null, revizyon, talimat: talimatlar.get(anahtar) ?? null, sablon,
      plan: revizyonId === null ? null : planlar.get(ie.id) ?? { ...PLANSIZ, zorunlu, ...(taslakta.has(ie.id) ? { taslakta: true as const } : {}) }, ekAciklama: ie.ekAciklama ?? null,
      rotaEksik: revizyonId === null ? null : rotaEksik.get(revizyonId) ?? null,
    };
    const parcalar = bolmeler.get(ie.id);
    girdiler.push(parcalar === undefined ? girdi : { ...girdi, bolunmus: true });
    // Parça kendi kaynağının istasyonundadır (kişi kaynağında iş emrininki). Bütün paket kayıtlı ve yayındaysa parça onun hazırlığıyla yayında
    // açılır: parça planın kararıdır, Hazırlık'ı yeniden istemez.
    const butun = kayitliGovde.get(isEmriPaketKimligi(ie.id));
    for (const p of parcalar ?? []) {
      const kimlik = parcaPaketKimligi(ie.id, p.no);
      const parcaMakinesi = p.kaynak.tur === 'makine' ? makineler.get(p.kaynak.id) : undefined;
      const parcaIstasyonu = parcaMakinesi?.istasyonId == null ? istasyon : istasyonlarById.get(parcaMakinesi.istasyonId) ?? istasyon;
      const parcaSablonu = kayitliKimlik.has(kimlik) ? null : (butunPaketSablonu(butun) ?? sablon);
      girdiler.push({
        ...girdi, istasyon: parcaIstasyonu, makineKodu: parcaMakinesi?.kod ?? (p.kaynak.tur === 'makine' ? null : girdi.makineKodu),
        sablon: parcaSablonu, parca: { no: p.no, adet: p.adet, toplam: parcalar!.length },
        plan: revizyonId === null ? null : parcaPlanlari.get(kimlik) ?? girdi.plan,
      });
    }
  }
  const hazirliklar = await isEmriHazirlikDurumlari(db, girdiler.flatMap((g) => (g.istasyon?.tip === 'talasli' ? [g.isEmri.id] : [])));
  const ilkParcalar = await ilkParcaKararlari(db, girdiler.map((g) => g.isEmri.uretimEmriId));
  for (const g of girdiler) {
    const hazirlik = g.istasyon === null ? null : hazirlikEksigi(g.istasyon.tip, hazirliklar.get(g.isEmri.id)?.durum);
    const taslak = isEmrindenTaslakPaket({ ...g, hazirlik, ilkParca: ilkParcalar.get(g.isEmri.uretimEmriId) ?? null });
    const butun = g.parca ? kayitliGovde.get(isEmriPaketKimligi(g.isEmri.id)) : undefined;
    const govde = g.sablon !== null && g.sablon === butun ? parcaYayini(taslak, butun) : taslak;
    const kimlik = String(govde['id']);
    // Hazırlık sırası işin bugünkü istasyonundaysa geçerlidir: plan işi başka istasyona aldıysa iş orada sırasız (plan sırasıyla) durur.
    const sira = kuyruk.get(kimlik);
    const kuyrukSirasi = sira !== undefined && g.istasyon?.id === sira.istasyonId ? { sira: sira.sira, kisi: sira.kisi, zaman: sira.zaman } : null;
    sonuc.set(kimlik, kuyrukAlanlariniEkle(govde, { kuyruk: kuyrukSirasi, planSaati: saatler.get(kimlik) ?? null }));
  }
  return sonuc;
}

// Biten emrin paketi (AR-BI-2): sürüm kayıtlı satırdan hesaplanır, yazımdaki taban çözümü (`tabanCoz`) okumadakiyle aynı sürümü bulur.
function bitenIsaretle(kayitli: KayitliPaket, birlesik: KayitliPaket, bitti: boolean): KayitliPaket {
  if (!bitti) return birlesik;
  const govde = bitenEmirIsareti(birlesik.govde);
  return govde === birlesik.govde ? birlesik : { ...birlesik, govde, surum: tmiBirlesikSurum(kayitli.surum, kayitli.govde, govde) };
}

async function paketEmriBitti(db: Db, paketId: string): Promise<boolean> {
  const isEmriId = paketIsEmri(paketId);
  const emirId = isEmriId === null ? paketEmri(paketId) : ((await isEmriOzeti(db, isEmriId))?.uretimEmriId ?? null);
  return emirId !== null && (await emirDurumlari(db, [emirId])).get(emirId) === 'bitti';
}

// Kayıtlı iş emri paketine TMI alanları yazılır; değiştiyse sürüm de değişir (kurallar.ts `tmiBirlesikSurum`).
function tmiIleBirlestir<T extends KayitliPaket>(b: T, isEmri: ReadonlyMap<string, Record<string, unknown>>): T {
  if (paketIsEmri(b.kimlik) === null) return b;
  const taslak = isEmri.get(b.kimlik) ?? plansizKaynak(b.govde);
  const govde = tmiAlanlariniYaz(b.govde, taslak);
  return govde === b.govde ? b : { ...b, govde, surum: tmiBirlesikSurum(b.surum, b.govde, govde) };
}

// Açık iş emri paketinin yeri (taslaktaki gibi: makine kaynağında makinenin istasyonu, kişi kaynağında iş emrininki). Kayıt ve ileti kapsamı
// kayıtlı satırın değil bunun üzerinden gider: plan iş emrini başka istasyona aldıysa kayıtlı makine eskidir. Bitmiş iş emrinde null (kayıtlı satır geçerli).
async function isEmriYeri(db: Db, isEmriId: number): Promise<{ machine: string; mc: string } | null> {
  const ie = await isEmriOzeti(db, isEmriId);
  if (ie === null || ie.durum === 'tamam' || ie.kaynak === null || ie.kaynak.tur === 'fason') return null;
  const makine = ie.kaynak.tur === 'makine' ? await makineGetir(db, ie.kaynak.id) : null;
  const istasyonId = makine?.istasyonId ?? ie.istasyonId;
  const istasyon = istasyonId === null ? null : await istasyonGetir(db, istasyonId);
  return istasyon === null ? null : { machine: istasyon.kod, mc: makine?.kod ?? '' };
}

// Paketin yeri: parça paketi kendi kaynağındadır (plandaki parça), öteki iş emri paketi iş emrinin bugünkü yerindedir. Parça plandan kalkmışsa null.
async function paketYeri(db: Db, kimlik: string): Promise<{ machine: string; mc: string } | null> {
  const parca = paketParcasi(kimlik);
  if (parca === null) return null;
  if (parca.no === null) return isEmriYeri(db, parca.isEmriId);
  const taslak = await isEmriTaslagi(db, kimlik);
  return taslak === null || typeof taslak['machine'] !== 'string' ? null : { machine: taslak['machine'], mc: typeof taslak['mc'] === 'string' ? taslak['mc'] : '' };
}

// Tek iş emri paketinin (ya da parçasının) taslağı (kayıtlı olsa da); iş emri açık değilse ya da parça artık yoksa null.
async function isEmriTaslagi(db: Db, kimlik: string): Promise<Record<string, unknown> | null> {
  const isEmriId = paketIsEmri(kimlik);
  if (isEmriId === null) return null;
  return (await tmiTaslaklari(db, await sorgular.belgeler(db, 'pkgs'), undefined, isEmriId)).isEmri.get(kimlik) ?? null;
}

// Veri kapsamı: kişinin iş merkezi kısıtı (kart #91) Arkon belge ve kayıtlarına kodlar üzerinden uygulanır. Kısıtı olmayan
// kişide null döner ve hiçbir çözümleme yapılmaz; kısıtlı kişide kural kurallar.ts `kapsamdaMiKisitli`dir.
interface KapsamSiniri {
  // Kapsam dışı, konumsuz ya da tanımsız kodlu kayıt için 403 fırlatır.
  reddet(konum: Konum): Promise<void>;
  disinda(konum: Konum): Promise<boolean>;
  // İleti için: kod taşımayan ileti ve bulunamayan paket başvurusu (silinmiş paketin iletisi yalnız kimlik taşır) süzülmez.
  iletiDisinda(konum: Konum): Promise<boolean>;
  // Liste okuması için paket konumlarını tek sorguyla önbelleğe alır.
  paketleriOnYukle(): Promise<void>;
  // İleti süzgeci için: yalnız anılan paketlerin konumunu tek sorguyla önbelleğe alır (bulunamayanlar önbelleğe girmez).
  paketleriAnanlariOnYukle(kimlikler: readonly string[]): Promise<void>;
  yasak: Konum;
  izinli: Konum;
}

// Kapsamın TMI'den okunan tabanı; kısıtsız kişide null. Bağlantıya bağlı değildir: ileti yoklaması bunu kısa süre önbellekte tutar.
interface KapsamTemeli {
  kapsam: Awaited<ReturnType<typeof kisininKapsami>>;
  istasyonListesi: Awaited<ReturnType<typeof istasyonlar>>;
  merkezler: MerkezListesi;
  makineler: Awaited<ReturnType<typeof aktifMakineler>>;
}

async function kapsamTemeli(db: Db, kisiId: number): Promise<KapsamTemeli | null> {
  const kapsam = await kisininKapsami(db, kisiId, kisininIzinliIsMerkezleri);
  if (kapsamSuzgeci(kapsam) === null) return null;
  return { kapsam, istasyonListesi: await istasyonlar(db, { pasiflerDahil: true }), merkezler: await isMerkezleri(db, { pasiflerDahil: true }), makineler: await aktifMakineler(db) };
}

async function kapsamSiniri(db: Db, kullanici: Kullanici, hazirTemel?: KapsamTemeli | null): Promise<KapsamSiniri | null> {
  const temel = hazirTemel === undefined ? await kapsamTemeli(db, kullanici.id) : hazirTemel;
  if (temel === null) return null;
  const { kapsam, istasyonListesi } = temel;
  let tesis = tesisHaritasiKur(temel.merkezler, istasyonListesi, temel.makineler);
  let pasifYuklendi = false;
  const icinde = (id: number) => kapsamdaMi(kapsam, id);
  const paketOnbellek = new Map<string, Konum | null>();
  const noOnbellek = new Map<string, Konum[]>();
  let taslaklar: Map<string, Konum> | null = null;

  const taslakKonumu = async (kimlik: string): Promise<Konum | null> => {
    if (paketEmri(kimlik) === null) return null;
    taslaklar ??= new Map((await tmiTaslaklari(db, await sorgular.belgeler(db, 'pkgs'))).yeni.map((b) => [b.kimlik, belgeKonumu('pkgs', b.kimlik, b.govde)]));
    return taslaklar.get(kimlik) ?? null;
  };
  const paketBul = async (kimlik: string): Promise<Konum | null> => {
    if (paketOnbellek.has(kimlik)) return paketOnbellek.get(kimlik) ?? null;
    const isEmriId = paketIsEmri(kimlik);
    const yer = isEmriId === null ? null : await paketYeri(db, kimlik);
    const satir = yer === null ? await sorgular.paketKonumu(db, kimlik) : null;
    const konum = yer !== null ? paketKonumu(yer.machine, yer.mc) : satir === null ? await taslakKonumu(kimlik) : paketKonumu(satir.machine, satir.mc);
    paketOnbellek.set(kimlik, konum);
    return konum;
  };
  const noIleBul = async (no: string): Promise<Konum[]> => {
    const onceki = noOnbellek.get(no);
    if (onceki !== undefined) return onceki;
    const satirlar = await sorgular.paketKonumlariNoIle(db, no);
    const konumlar = satirlar.map((s) => paketKonumu(s.machine, s.mc));
    noOnbellek.set(no, konumlar);
    return konumlar;
  };
  // Pasif makine kodu da çözülür; pasif makineler yalnız aktif listede bulunamayan kod için bir kez okunur.
  const pasifMakineleriYukle = async (): Promise<void> => {
    if (pasifYuklendi) return;
    pasifYuklendi = true;
    const tumu = [...(await aktifMakineler(db))];
    for (const i of istasyonListesi) tumu.push(...(await istasyondakiMakineler(db, i.id, { pasiflerDahil: true })));
    tesis = tesisHaritasiKur(await isMerkezleri(db, { pasiflerDahil: true }), istasyonListesi, tumu);
  };

  const birlestir = async (konum: Konum): Promise<{ bilesik: Konum; tanimsizPaket: boolean }> => {
    const ekler: Konum[] = [];
    let tanimsizPaket = false;
    for (const kimlik of konum.paket) {
      const p = await paketBul(kimlik);
      if (p === null) tanimsizPaket = true; else ekler.push(p);
    }
    for (const no of konum.paketNo) {
      const ps = await noIleBul(no);
      if (ps.length === 0) tanimsizPaket = true; else ekler.push(...ps);
    }
    const hepsi = [konum, ...ekler];
    return {
      tanimsizPaket,
      bilesik: {
        ...KONUMSUZ,
        merkez: hepsi.flatMap((k) => k.merkez), istasyon: hepsi.flatMap((k) => k.istasyon), makine: hepsi.flatMap((k) => k.makine),
        gecersiz: hepsi.some((k) => k.gecersiz), tesisGeneli: konum.tesisGeneli,
      },
    };
  };
  const kapsamdaMiBilesik = async (bilesik: Konum): Promise<boolean> => {
    let cozum = konumCoz(bilesik, tesis);
    if (cozum.tanimsiz && !pasifYuklendi) {
      await pasifMakineleriYukle();
      cozum = konumCoz(bilesik, tesis);
    }
    return kapsamdaMiKisitli(bilesik, cozum, icinde);
  };
  const kabulMu = async (konum: Konum): Promise<boolean> => {
    const { bilesik, tanimsizPaket } = await birlestir(konum);
    return !tanimsizPaket && kapsamdaMiBilesik(bilesik);
  };
  const { yasak, izinli } = kodlarAyir(tesis, icinde);
  return {
    reddet: async (konum) => {
      if (!(await kabulMu(konum))) throw kapsamDisi();
    },
    disinda: async (konum) => !(await kabulMu(konum)),
    iletiDisinda: async (konum) => {
      const { bilesik } = await birlestir(konum);
      return !konumBosMu(bilesik) && !(await kapsamdaMiBilesik(bilesik));
    },
    paketleriOnYukle: async () => {
      for (const s of await sorgular.paketKonumlari(db)) if (paketIsEmri(s.kimlik) === null) paketOnbellek.set(s.kimlik, paketKonumu(s.machine, s.mc));
    },
    paketleriAnanlariOnYukle: async (kimlikler) => {
      const eksik = [...new Set(kimlikler)].filter((k) => !paketOnbellek.has(k));
      if (eksik.length === 0) return;
      for (const s of await sorgular.paketKonumlariKimlikle(db, eksik)) if (paketIsEmri(s.kimlik) === null) paketOnbellek.set(s.kimlik, paketKonumu(s.machine, s.mc));
    },
    yasak,
    izinli,
  };
}

// AR2: TMI'de iptal edilen emrin paketi Arkon'da görünmez, yazılmaz ve işine kayıt alınmaz (operatör iptal edilmiş işte çalışmasın).
// Tek paket için; liste `belgelerHam` içinde toplu okunur.
async function iptalEmriMi(db: Db, paketId: unknown): Promise<boolean> {
  const isEmriId = paketIsEmri(paketId);
  const emirId = isEmriId === null ? paketEmri(paketId) : ((await isEmriOzeti(db, isEmriId))?.uretimEmriId ?? null);
  return emirId !== null && (await emirOzeti(db, emirId))?.durum === 'iptal';
}


async function belgelerHam(db: Db, depo: ArkonDeposu) {
  if (depo === 'gauges') return tmiAletleri(db);
  const kayitli = await sorgular.belgeler(db, depo);
  if (depo === 'pkgs') {
    const acik = await acikEmirler(db);
    const acikKimlikler = new Set(acik.map((e) => e.id));
    // Açık emir iptal değildir: yalnız kapanmış emirlerin durumu tek sorguda okunur.
    const kapanmis = kayitli.map((b) => paketinEmri(b.kimlik, b.govde)).filter((id): id is number => id !== null && !acikKimlikler.has(id));
    const durumlar = await emirDurumlari(db, kapanmis);
    const gorunen = kayitli.filter((b) => {
      const emirId = paketinEmri(b.kimlik, b.govde);
      return emirId === null || durumlar.get(emirId) !== 'iptal';
    });
    const { yeni, isEmri } = await tmiTaslaklari(db, kayitli, acik);
    return [...gorunen.map((b) => bitenIsaretle(b, tmiIleBirlestir(b, isEmri), durumlar.get(paketinEmri(b.kimlik, b.govde) ?? -1) === 'bitti')), ...yeni];
  }
  if (depo === 'logi') return stokDurumlariyla(db, kayitli);
  if (depo === 'downs') return durusBelgeleri(db);
  if (depo !== 'kv') return kayitli;
  const tmiden = [];
  for (const kimlik of TMI_AYARLARI) {
    const deger = await tmiAyari(db, kimlik);
    if (deger !== null) tmiden.push(kvBelgesi(kimlik, deger));
  }
  return [...kayitli.filter((b) => !tmiAyariMi(b.kimlik)), ...tmiden];
}

// Stoka bağlı malzeme isteğinin durumu stoktan okunur; sürüm Arkon belgesininkidir (belge Arkon'dan yazılmaz, sürüm yalnız silmede kullanılır).
async function stokDurumlariyla<T extends { kimlik: string; govde: unknown }>(db: Db, belgeler: readonly T[]): Promise<T[]> {
  const bagli = belgeler.filter((b) => stokaBagliMi(b.govde)).map((b) => stokIstegiKaynagi(b.kimlik));
  if (bagli.length === 0) return [...belgeler];
  const durumlar = await malzemeIstekleri(db, bagli);
  return belgeler.map((b) => (stokaBagliMi(b.govde) ? { ...b, govde: stokDurumuyla(b.govde, durumlar.get(stokIstegiKaynagi(b.kimlik))) } : b));
}

// Okumada çizim denetimi her belge sürümü için bir kez yapılır: temiz bulunan sürüm yeniden ayrıştırılmaz (süreç belleğinde, sınırlı).
const temizSurumler = new Set<string>();
const TEMIZ_SURUM_SINIRI = 20_000;
function cizimDenetle<T extends { surum: number; govde: unknown }>(depo: ArkonDeposu, kimlik: string, belge: T): T {
  const anahtar = `${depo}\u0000${kimlik}\u0000${belge.surum}`;
  if (temizSurumler.has(anahtar)) return belge;
  const govde = guvensizCizimleriAyikla(belge.govde);
  if (govde !== belge.govde) return { ...belge, govde };
  if (temizSurumler.size >= TEMIZ_SURUM_SINIRI) temizSurumler.clear();
  temizSurumler.add(anahtar);
  return belge;
}

async function okuyabilir(db: Db, kullanici: Kullanici, depo: ArkonDeposu): Promise<void> {
  if (!okuyabilirMi(depo, await rolGerekli(db, kullanici))) throw yetkiYok(ILETILER.okumaRolu);
}

export async function belgeler(db: Db, kullanici: Kullanici, depo: ArkonDeposu) {
  await okuyabilir(db, kullanici, depo);
  const tumu = (await belgelerHam(db, depo)).map((b) => cizimDenetle(depo, b.kimlik, b));
  const sinir = await kapsamSiniri(db, kullanici);
  if (sinir === null || !KONUMLU_DEPOLAR.has(depo)) return tumu;
  await sinir.paketleriOnYukle();
  const gorunen: typeof tumu = [];
  for (const b of tumu) if (!(await sinir.disinda(belgeKonumu(depo, b.kimlik, b.govde)))) gorunen.push(b);
  return gorunen;
}

// Var olan belge: kayıtlı satır, yoksa emirden türeyen taslak paket. Kapsam denetimi çağırana aittir.
async function belgeBul(db: Db, depo: ArkonDeposu, kimlik: string) {
  if (depo === 'kv' && tmiAyariMi(kimlik)) {
    const deger = await tmiAyari(db, kimlik);
    if (deger === null) return null;
    const { surum, govde } = kvBelgesi(kimlik, deger);
    return { surum, govde };
  }
  if (depo === 'downs') return (await durusBelgeleri(db)).find((b) => b.kimlik === kimlik) ?? null;
  if (depo === 'gauges') {
    const alet = (await tmiAletleri(db)).find((b) => b.kimlik === kimlik);
    return alet === undefined ? null : { surum: alet.surum, govde: alet.govde };
  }
  const satir = await sorgular.belge(db, depo, kimlik);
  if (satir !== null && depo === 'logi') return (await stokDurumlariyla(db, [satir]))[0]!;
  if (satir !== null) return { surum: satir.surum, govde: satir.govde };
  const isEmriId = depo === 'pkgs' ? paketIsEmri(kimlik) : null;
  if (isEmriId !== null) {
    const taslak = await isEmriTaslagi(db, kimlik);
    return taslak === null ? null : { surum: icerikSurumu(taslak), govde: taslak as unknown };
  }
  if (depo !== 'pkgs' || paketEmri(kimlik) === null) return null;
  return (await tmiTaslaklari(db, await sorgular.belgeler(db, 'pkgs'))).yeni.find((b) => b.kimlik === kimlik) ?? null;
}

export async function belge(db: Db, kullanici: Kullanici, depo: ArkonDeposu, kimlik: string) {
  await okuyabilir(db, kullanici, depo);
  let bulunan = await belgeBul(db, depo, kimlik);
  if (bulunan === null || (depo === 'pkgs' && (await iptalEmriMi(db, kimlik)))) return null;
  // Kayıtlı iş emri paketinin TMI alanları ekrana giden okumada yazılır; iç denetimler (ilk parça, istek) kayıtlı satırla yetinir.
  const isEmriId = depo === 'pkgs' ? paketIsEmri(kimlik) : null;
  const taslak = isEmriId === null ? null : await isEmriTaslagi(db, kimlik);
  if (isEmriId !== null) {
    const { surum, govde } = tmiIleBirlestir({ kimlik, surum: bulunan.surum, govde: bulunan.govde }, new Map(taslak === null ? [] : [[kimlik, taslak]]));
    bulunan = { surum, govde };
  }
  if (depo === 'pkgs' && (await paketEmriBitti(db, kimlik))) {
    const kayitli = await sorgular.belge(db, depo, kimlik);
    if (kayitli !== null) bulunan = bitenIsaretle({ kimlik, surum: kayitli.surum, govde: kayitli.govde }, { kimlik, surum: bulunan.surum, govde: bulunan.govde }, true);
  }
  const sinir = KONUMLU_DEPOLAR.has(depo) ? await kapsamSiniri(db, kullanici) : null;
  if (sinir !== null && (await sinir.disinda(belgeKonumu(depo, kimlik, bulunan.govde)))) return null;
  return cizimDenetle(depo, kimlik, bulunan);
}

function yazabilirMi(depo: ArkonDeposu, kimlik: string, rol: ArkonRolu, eylem: BelgeEylemi): void {
  const ret = yazmaReddi(depo, kimlik, rol, eylem);
  if (ret !== null) throw yetkiYok(depo === 'gauges' ? ILETILER.aletTmide : kimlik === 'perms' && ret === 'tmiYonetir' ? ILETILER.yetkiTmide : ILETILER[ret]);
}

// Kapsam için yalnız konum gerekir: taslak paketin konumu emrinin istasyonudur, bütün açık emirlerden taslak kurulmaz.
// Taslak, `taslakPaketler` ile aynı koşulda vardır: kayıtlı satır yok, emir açık, istasyonu var.
async function konumGovdesi(db: Db, depo: ArkonDeposu, kimlik: string): Promise<unknown> {
  // Açık iş emri paketinin konumu iş emrinin bugünkü yeridir (kayıt kapsamıyla aynı); plan taşıdıysa kayıtlı makine eskidir.
  const isEmriId = depo === 'pkgs' ? paketIsEmri(kimlik) : null;
  const yer = isEmriId === null ? null : await paketYeri(db, kimlik);
  if (yer !== null) return yer;
  const emirId = depo === 'pkgs' ? paketEmri(kimlik) : null;
  if (emirId === null) return (await belgeBul(db, depo, kimlik))?.govde ?? null;
  const satir = await sorgular.belge(db, depo, kimlik);
  if (satir !== null) return satir.govde;
  const emir = await emirOzeti(db, emirId);
  if (emir === null || !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(emir.durum)) return null;
  const istasyon = await istasyonGetir(db, emir.istasyonId);
  return istasyon === null ? null : { machine: istasyon.kod };
}

// Yazma ve silme kilitten sonra, durum kurallarından önce: hem var olan belgenin hem yazılacak gövdenin iş merkezi kapsamda olmalı.
async function kapsaminda(db: Db, kullanici: Kullanici, depo: ArkonDeposu, kimlik: string, yeniGovde: unknown): Promise<void> {
  if (!KONUMLU_DEPOLAR.has(depo)) return;
  const sinir = await kapsamSiniri(db, kullanici);
  if (sinir === null) return;
  const eski = await konumGovdesi(db, depo, kimlik);
  if (eski !== null) await sinir.reddet(belgeKonumu(depo, kimlik, eski));
  if (yeniGovde !== undefined) await sinir.reddet(belgeKonumu(depo, kimlik, yeniGovde));
}

export async function belgeYaz(
  db: Db, kullanici: Kullanici, depo: ArkonDeposu, kimlik: string,
  g: { taban: number | null; govde?: unknown; kaynak: string },
): Promise<BelgeYazCevabi> {
  const rol = await rolGerekli(db, kullanici);
  yazabilirMi(depo, kimlik, rol, 'yaz');
  if (depo === 'pkgs' && (await iptalEmriMi(db, kimlik))) throw yetkiYok(ILETILER.emirIptal);
  if (g.govde === undefined || g.govde === null) throw dogrulama('Belge gövdesi yok.', 'govde');
  const bicim = belgeBicimiHatasi(depo, g.govde, kimlik);
  if (bicim !== null) throw dogrulama(bicim.ileti, bicim.alan);
  if (depo === 'downs') return durusBelgesiYaz(db, kullanici, kimlik, { ...g, govde: g.govde });
  const mevcut = await sorgular.surumKilitle(db, depo, kimlik);
  if (yerelPaketReddi(depo, kimlik, mevcut)) throw yetkiYok(ILETILER.yerelPaket);
  const guncel = mevcut === null ? null : await sorgular.belge(db, depo, kimlik);
  // İş emri paketinde TMI alanları istemciden alınmaz: açık iş emrinden, iş emri kapanmışsa kayıtlı paketten yazılır.
  const isEmriId = depo === 'pkgs' ? paketIsEmri(kimlik) : null;
  const tmiKaynagi = isEmriId === null ? null : await isEmriTaslagi(db, kimlik);
  if (isEmriId !== null && tmiKaynagi === null && guncel === null) throw dogrulama(ILETILER.isEmriYok, 'id');
  g = isEmriId === null ? g : { ...g, govde: tmiAlanlariniYaz(g.govde, tmiKaynagi ?? plansizKaynak(guncel?.govde)) };
  await kapsaminda(db, kullanici, depo, kimlik, g.govde);
  if (belgeRoluReddi(depo, g.govde, guncel?.govde, rol)) throw yetkiYok(ILETILER.kaliteKarari);
  if (bitmisIsReddi(depo, g.govde, guncel?.govde)) throw yetkiYok(ILETILER.bitmisIs);
  const birlesik = guncel === null || isEmriId === null ? guncel
    : tmiIleBirlestir({ kimlik, surum: guncel.surum, govde: guncel.govde }, new Map(tmiKaynagi === null ? [] : [[kimlik, tmiKaynagi]]));
  const okunan = guncel === null || birlesik === null || depo !== 'pkgs' ? birlesik
    : bitenIsaretle({ kimlik, surum: guncel.surum, govde: guncel.govde }, { kimlik, surum: birlesik.surum, govde: birlesik.govde }, await paketEmriBitti(db, kimlik));
  if (yazimCakisiyorMu(mevcut, tabanCoz(g.taban, guncel, okunan?.govde)) && okunan !== null) {
    return { sonuc: 'cakisma', guncel: cizimDenetle(depo, kimlik, { surum: okunan.surum, govde: okunan.govde }) };
  }
  // Çakışmadan sonra: eski sürüme dayanan yazım alan farkından değil çakışmadan döner, ekran güncel belgeyle yeniden dener.
  const yayinReddi = yayinEksigi(depo, g.govde, guncel?.govde);
  if (yayinReddi !== null) throw dogrulama(yayinReddi, yayinReddi === ISTASYONSUZ_YAYIN ? 'machine' : yayinReddi === ADIMSIZ_YAYIN ? 'steps' : 'tmi');
  if (depo === 'pkgs' && (await tmiMakinesiDegisti(db, kimlik, g.govde, guncel?.govde))) throw dogrulama(ILETILER.tmiIstasyonu, 'machine');
  const onayZorunlu = depo === 'pkgs' && onayZorunluMu((await sorgular.belge(db, 'kv', 'policy'))?.govde);
  const alanReddi = alanYetkisiReddi(depo, g.govde, guncel?.govde, rol, onayZorunlu);
  if (alanReddi !== null) throw yetkiYok(ILETILER[alanReddi]);
  const olcumAleti = olcumAletleri(depo, g.govde, guncel?.govde);
  if (olcumAleti?.eksik === true) throw dogrulama(ILETILER.aletZorunlu, 'gid');
  for (const id of olcumAleti?.aletler ?? []) if (!(await olcumAletiGecerliMi(db, id))) throw dogrulama(ILETILER.aletGecersiz, 'gid');
  const icerikOzeti = depo === 'pkgs' ? createHash('sha256').update(onayIcerigi(g.govde)).digest('hex') : '';
  if (onayEskidiMi(depo, g.govde, guncel?.govde, rol, onayZorunlu, icerikOzeti)) throw yetkiYok(ILETILER.onayEskidi);
  if (depo === 'requests' && ikinciKontrolEksik(g.govde, guncel?.govde, await istekPaketi(db, g.govde))) throw dogrulama(ILETILER.ikinciKontrol, 'c2');
  const stok = depo === 'logi' ? stokIstegiKarari(g.govde, guncel?.govde) : null;
  const numune = depo === 'requests' ? numuneTeslimGirdisi(kimlik, g.govde, guncel?.govde) : null;
  if (stok !== null && 'ret' in stok) throw stok.ret === 'stokIstegi' ? yetkiYok(ILETILER.stokIstegi) : dogrulama(ILETILER[stok.ret], stok.alan);
  const yeniKarar = depo === 'pkgs' && yenidenKarariDegisti(g.govde, guncel?.govde);
  const surum = yeniSurum(mevcut, Date.now());
  let govde = await arizayiAcanaBagla(db, depo, guncel?.govde, kisiAlanlariniDoldur(depo, kimlik, guncel?.govde, onayOzetiDamgala(depo, yenidenKarariDamgala(depo, stokBaginiAt(depo, g.govde), guncel?.govde, Date.now(), yeniKarar ? await sorgular.paketIstekleri(db, kimlik) : [], yeniKarar ? await sorgular.parcaSaglami(db, kimlik, null) : 0), guncel?.govde, icerikOzeti), kullanici.ad));
  if (stok !== null) govde = { ...(govde as object), stokIstek: await stoktaIstekAc(db, kullanici, kimlik, stok.girdi) };
  if (depo === 'requests') govde = numuneTesliminiKoru(govde, guncel?.govde);
  if (numune !== null) { const teslim = await numuneyiTeslimEt(db, kullanici, numune); if (teslim !== null) govde = { ...(govde as object), numuneTeslim: teslim }; }
  await sorgular.belgeYaz(db, depo, kimlik, govde, surum, kullanici.id);
  await sorgular.iletiEkle(db, g.kaynak, { type: '$db', store: depo, id: kimlik });
  await arizayiMakineyeYansit(db, kullanici, depo, kimlik, govde, guncel?.govde);
  await gunlugeYaz(db, kullanici, g.kaynak, gunlukSatirlari(depo, kimlik, guncel?.govde, govde, mevcut !== null, false));
  return { sonuc: 'yazildi', surum };
}

// AR-15: arıza açılınca makine TMI'de arızalı, kapanınca çalışır olur (istasyonlar makine durumu; plan, Saat ve başlatma denetimi oradan okur).
// Durumu istasyonların kendi yetkisiyle yazar (`istasyonlar.makine-durumu`): yetkisi olmayan kişinin arıza kaydı yine yazılır, makine durumu
// değişmez (borç: UYUM-BORCU "Arıza yansıması"). Yetki denetimi disari.ts'te sorgudan öncedir; yakalanınca transaction bozulmaz.
async function arizayiMakineyeYansit(db: Db, kullanici: Kullanici, depo: ArkonDeposu, kimlik: string, govde: unknown, onceki: unknown): Promise<void> {
  const gecis = arizaMakineGecisi(depo, govde, onceki);
  if (gecis === null) return;
  const liste = await makineler(db, { pasiflerDahil: false });
  let makine = gecis.makine === null ? undefined : liste.find((m) => m.kod === gecis.makine);
  if (makine === undefined && gecis.makine === null && gecis.istasyon !== null) {
    const istasyon = (await istasyonlar(db, { pasiflerDahil: true })).find((i) => i.kod === gecis.istasyon);
    const tek = istasyon === undefined ? [] : liste.filter((m) => m.istasyonId === istasyon.id);
    if (tek.length === 1) makine = tek[0];
  }
  if (makine === undefined) return;
  const simdiki = (await makineDurumlari(db)).find((d) => d.makineId === makine.id);
  if (gecis.durum === 'ariza' && simdiki?.durum === 'ariza') return;
  if (gecis.durum === 'calisir') {
    if (simdiki?.durum !== 'ariza') return;
    const digerleri = (await sorgular.belgeler(db, 'maint')).filter((b) => b.kimlik !== kimlik && acikArizaMi(b.govde, makine.kod));
    if (digerleri.length > 0) return;
  }
  try {
    await makineDurumuYaz(db, kullanici, makine.id, { durum: gecis.durum, aciklama: gecis.durum === 'ariza' ? ARIZA_ACIKLAMASI(gecis.baslik) : null });
  } catch (hata) {
    if (!(hata instanceof UygulamaHatasi && hata.kod === 'YETKI_YOK')) throw hata;
  }
}

// Rotalı (malzeme kartlı) açık emrin şimdiki istasyon kodu; rotasız ya da açık olmayan emirde null: koruma uygulanmaz.
// Paketin makinesi emrin şimdiki istasyonu değilse ve emir rotalıysa (malzeme kartlı, açık) ret nedeni; rotasız emrin paketi taşınabilir.
// Rotalılık yalnız makine farklıyken okunur: emrin tam okuması her yansımada yapılmasın.
async function paketIstasyonDenetimi(db: Db, emirId: number, istasyonId: number, makine: unknown, onbellek?: OkumaOnbellegi): Promise<string | null> {
  const kod = (onbellek === undefined ? await istasyonGetir(db, istasyonId) : await onbellek.oku(`istasyon:${istasyonId}`, () => istasyonGetir(db, istasyonId)))?.kod;
  if (kod === undefined || makine === kod) return null;
  const emir = onbellek === undefined ? await acikEmir(db, emirId) : await acikEmirOku(db, onbellek, emirId);
  return emir === null || (emir.malzemeNo ?? null) === null ? null : paketIstasyonuReddi(makine, kod);
}

// Rotalı emrin paketinde makine TMI planından gelir: kayıtlı makinesi (kayıt yoksa taslağınki) kalır ya da emrin şimdiki istasyonu olur.
// Şimdiki istasyona taşıma serbesttir: emir sonraki adıma geçince paket o istasyonda yeniden kullanılabilir.
async function tmiMakinesiDegisti(db: Db, kimlik: string, yeni: unknown, onceki: unknown): Promise<boolean> {
  const emirId = paketEmri(kimlik);
  const makine = paketMakinesi(yeni);
  if (emirId === null || (onceki !== undefined && makine === paketMakinesi(onceki))) return false;
  const emir = await emirOzeti(db, emirId);
  if (emir === null || !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(emir.durum)) return false;
  return (await paketIstasyonDenetimi(db, emirId, emir.istasyonId, makine)) !== null;
}

// Stok bağını yalnız sunucu yazar: istemcinin gönderdiği `stokIstek` atılır.
function stokBaginiAt(depo: ArkonDeposu, govde: unknown): unknown {
  if (depo !== 'logi' || typeof govde !== 'object' || govde === null || !('stokIstek' in govde)) return govde;
  const { stokIstek: _atilan, ...gerisi } = govde as Record<string, unknown>;
  return gerisi;
}

async function stoktaIstekAc(db: Db, kullanici: Kullanici, kimlik: string, g: StokIstegiGirdisi): Promise<{ id: number; no: string }> {
  const istasyon = (await istasyonlar(db, { pasiflerDahil: false })).find((i) => i.kod === g.istasyonKodu);
  if (istasyon === undefined) throw dogrulama(ILETILER.stokIstasyonu, 'st');
  const { id, no } = await malzemeIstegiAc(db, kullanici, {
    malzemeId: g.malzemeId, miktar: g.miktar, istasyonId: istasyon.id, not: g.not, kaynakKimligi: stokIstegiKaynagi(kimlik),
    uretimEmriId: g.uretimEmriId ?? (g.isEmriId === null ? null : ((await isEmriOzeti(db, g.isEmriId))?.uretimEmriId ?? null)),
  });
  return { id, no };
}

// Teslim açılmazsa (stok atladı, istasyon bilinmiyor ya da paket iş emrine bağlı değil) numune isteği yine yazılır: numune stok yüzünden durmaz.
// Stok iş emrini ister; üretim emri paketinde (tmi-ue) iş emri bilinmediği için teslim açılmaz.
async function numuneyiTeslimEt(db: Db, kullanici: Kullanici, g: NumuneTeslimGirdisi): Promise<{ id: number; no: string } | null> {
  if (g.isEmriId === null) return null;
  const istasyon = (await istasyonlar(db, { pasiflerDahil: false })).find((i) => i.kod === g.istasyonKodu);
  const uretimEmriId = (await isEmriOzeti(db, g.isEmriId))?.uretimEmriId ?? null;
  if (istasyon === undefined || uretimEmriId === null) return null;
  const sonuc = await numuneTeslimi(db, { uretimEmriId, isEmriId: g.isEmriId, istasyonId: istasyon.id, kisiId: kullanici.id, adet: g.miktar, kaynakKimligi: g.kaynakKimligi });
  return 'teslim' in sonuc ? sonuc.teslim : null;
}

// İstek formunun malzeme seçicisi: stoklanan, aktif kartlar (hizmet stoklanmaz).
export async function malzemeler(db: Db, kullanici: Kullanici, metin: string | null) {
  await rolGerekli(db, kullanici);
  const { satirlar } = await malzemeAra(db, { metin, turler: STOKLANAN_TURLER, yalnizAktif: true, sayfa: 1, sayfaBoyu: 20 });
  return satirlar.map((m) => ({ id: m.id, kod: m.kod, ad: m.ad, birim: m.birim }));
}
const STOKLANAN_TURLER = ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas'] as const;

// Değişiklik günlüğü (Arkon'un `audit` kaydı) sunucuda, yazan kişinin oturumuyla ve sunucu saatiyle üretilir.
async function gunlugeYaz(db: Db, kullanici: Kullanici, kaynak: string, satirlar: readonly GunlukSatiri[]): Promise<void> {
  for (const satir of satirlar) await gunlukSatiriYaz(db, kullanici, satir);
  if (satirlar.length > 0) await sorgular.iletiEkle(db, kaynak, { type: '$log', kind: 'audit' });
}

async function gunlukSatiriYaz(db: Db, kullanici: Kullanici, satir: GunlukSatiri): Promise<void> {
  const simdi = Date.now();
  const cid = randomUUID();
  const govde = { cid, at: simdi, userId: String(kullanici.id), userName: kullanici.ad, machine: null, ...satir };
  const sutunlar = { cid, zaman: new Date(simdi), makine: null, isMerkezi: null, emirNo: null, paketId: null, maddeId: null };
  await sorgular.kayitEkle(db, 'audit', sutunlar, govde, kullanici.id, { istasyonId: null, isMerkeziId: null });
}

async function arizayiAcanaBagla(db: Db, depo: ArkonDeposu, onceki: unknown, govde: unknown): Promise<unknown> {
  const cagri = arizaCagrisi(depo, govde, onceki);
  if (cagri === null || typeof govde !== 'object' || govde === null) return govde;
  const acan = await sorgular.cagriAcan(db, cagri);
  const ad = acan === null ? undefined : (await kisiAdlari(db, [acan])).get(acan);
  return ad === undefined ? govde : { ...govde, openedBy: ad };
}

export async function belgeSil(
  db: Db, kullanici: Kullanici, depo: ArkonDeposu, kimlik: string, g: { kaynak: string; taban?: number | undefined },
): Promise<void> {
  yazabilirMi(depo, kimlik, await rolGerekli(db, kullanici), 'sil');
  if (depo === 'downs') return durusBelgesiSil(db, kullanici, kimlik, g);
  const mevcut = await sorgular.surumKilitle(db, depo, kimlik);
  await kapsaminda(db, kullanici, depo, kimlik, undefined);
  if (g.taban === undefined) throw dogrulama(ILETILER.silmeSurumu, 'taban');
  const onceki = mevcut === null ? null : await sorgular.belge(db, depo, kimlik);
  const isEmriId = depo === 'pkgs' ? paketIsEmri(kimlik) : null;
  const tmiKaynagi = isEmriId === null || onceki === null ? null : await isEmriTaslagi(db, kimlik);
  const okunan = onceki === null || isEmriId === null ? onceki
    : tmiIleBirlestir({ kimlik, surum: onceki.surum, govde: onceki.govde }, new Map(tmiKaynagi === null ? [] : [[kimlik, tmiKaynagi]]));
  if (silmeCakisiyorMu(mevcut, tabanCoz(g.taban, onceki, okunan?.govde) ?? g.taban)) throw eskiSurum();
  if (depo === 'logi' && stokaBagliMi(onceki?.govde)) throw yetkiYok(ILETILER.stokIstegi);
  await sorgular.belgeSil(db, depo, kimlik);
  await sorgular.iletiEkle(db, g.kaynak, { type: '$db', store: depo, id: kimlik, del: true });
  if (mevcut !== null) await gunlugeYaz(db, kullanici, g.kaynak, gunlukSatirlari(depo, kimlik, onceki?.govde, undefined, true, true));
}

// Planlı duruş (kart #519): `downs` deposu Vardiya'nın planlı duruş kayıtlarıdır (kurallar.ts `durustenBelgeye`). Sürüm belgenin içeriğindendir;
// Arkon'un tabanı Vardiya kaydı kilitlendikten sonra denetlenir. Yazma ve silme Vardiya'nın yetkisi (`vardiya.durus-yaz`), kapsamı ve
// kurallarıyla yapılır; Arkon rolü ve belge kapsamı ayrıca aranır.
async function durusKodlari(db: Db) {
  const merkezler = await isMerkezleri(db, { pasiflerDahil: true });
  const istasyonListesi = await istasyonlar(db, { pasiflerDahil: true });
  const nedenler = await durusNedenleriniListele(db, { yalnizAktif: false });
  const kodlar: DurusKodlari = {
    merkez: new Map(merkezler.map((m) => [m.id, m.kod])), istasyon: new Map(istasyonListesi.map((i) => [i.id, i.kod])),
    neden: new Map(nedenler.map((n) => [n.id, n.kod])),
  };
  const kimlikler: DurusKimlikleri = {
    merkez: new Map(merkezler.map((m) => [m.kod, m.id])), istasyon: new Map(istasyonListesi.map((i) => [i.kod, i.id])),
    neden: new Map(nedenler.map((n) => [n.kod, n.id])),
  };
  return { kodlar, kimlikler };
}

const durusBelgesi = (d: PlanliDurusKaydi, kodlar: DurusKodlari) => {
  const govde = durustenBelgeye(d, kodlar);
  return { kimlik: durusBelgeKimligi(d), surum: icerikSurumu(govde), govde };
};

async function durusBelgeleri(db: Db) {
  const { kodlar } = await durusKodlari(db);
  return (await planliDuruslarinHepsi(db)).map((d) => durusBelgesi(d, kodlar));
}

function durusHedefi(kimlik: string, kodlar: DurusKodlari, cakisiyor: (mevcut: number | null) => boolean) {
  const onceki: { belge: ReturnType<typeof durusBelgesi> | null } = { belge: null };
  const hedef: ArkonDurusHedefi = {
    id: durusBelgeKimligindenId(kimlik), kaynakKimligi: kimlik,
    guncelMi: (k) => {
      onceki.belge = k === null ? null : durusBelgesi(k, kodlar);
      return !cakisiyor(onceki.belge?.surum ?? null);
    },
  };
  return { hedef, onceki };
}

async function durusBelgesiYaz(
  db: Db, kullanici: Kullanici, kimlik: string, g: { taban: number | null; govde: unknown; kaynak: string },
): Promise<BelgeYazCevabi> {
  await kapsaminda(db, kullanici, 'downs', kimlik, g.govde);
  const { kodlar, kimlikler } = await durusKodlari(db);
  // Kilitten önce okunan aktiflik araya giren yazımla eskirse kaydın sürümü de değişir ve yazım çakışma alır (`guncelMi`).
  const mevcut = (await planliDuruslarinHepsi(db)).find((d) => durusBelgeKimligi(d) === kimlik);
  const cevrim = belgedenDurusa(g.govde, kimlikler, mevcut?.aktif ?? null);
  if ('hata' in cevrim) throw dogrulama(cevrim.hata.ileti, cevrim.hata.alan);
  const { hedef, onceki } = durusHedefi(kimlik, kodlar, (mevcut) => yazimCakisiyorMu(mevcut, g.taban));
  const sonuc = await planliDurusYaz(db, kullanici, hedef, cevrim.girdi);
  if (sonuc.sonuc === 'cakisma' || sonuc.kayit === null) {
    if (onceki.belge === null) throw eskiSurum();
    return { sonuc: 'cakisma', guncel: { surum: onceki.belge.surum, govde: onceki.belge.govde } };
  }
  const yeni = durusBelgesi(sonuc.kayit, kodlar);
  await sorgular.iletiEkle(db, g.kaynak, { type: '$db', store: 'downs', id: kimlik });
  await gunlugeYaz(db, kullanici, g.kaynak, gunlukSatirlari('downs', kimlik, onceki.belge?.govde, yeni.govde, onceki.belge !== null, false));
  return { sonuc: 'yazildi', surum: yeni.surum };
}

async function durusBelgesiSil(db: Db, kullanici: Kullanici, kimlik: string, g: { kaynak: string; taban?: number | undefined }): Promise<void> {
  await kapsaminda(db, kullanici, 'downs', kimlik, undefined);
  const taban = g.taban;
  if (taban === undefined) throw dogrulama(ILETILER.silmeSurumu, 'taban');
  const { kodlar } = await durusKodlari(db);
  const { hedef, onceki } = durusHedefi(kimlik, kodlar, (mevcut) => silmeCakisiyorMu(mevcut, taban));
  const sonuc = await planliDurusSilArkon(db, kullanici, hedef);
  if (sonuc.sonuc === 'cakisma') throw eskiSurum();
  await sorgular.iletiEkle(db, g.kaynak, { type: '$db', store: 'downs', id: kimlik, del: true });
  if (onceki.belge !== null) await gunlugeYaz(db, kullanici, g.kaynak, gunlukSatirlari('downs', kimlik, onceki.belge.govde, undefined, true, true));
}

// Yeni yazılan üretim kaydı (olay, sayım) TMI üretim emri komutuna yansır (ADR 0006: üst modül alttakini çağırır). Arkon kaydı HER ZAMAN yazılır
// ve TMI'nin hatası onu geri alamaz: kayıt ve `bekliyor` yansıma satırı aynı işlemde yazılır, ardından bekleyenler işlenir. Her TMI komutu kayıt
// noktasında koşar; kural reddi (durum, yetki, kapsam, kısıt) "reddedildi" nedeniyle saklanır, geçici hata (süre aşımı, kilitlenme, beklenmeyen)
// satırı `bekliyor` bırakır (deneme sayısı ve son hata saklanır, aralık denemeyle uzar, kayıp olmaz). Sıra korunur: emrin öndeki bekleyeni sonuçlanmadan
// ardındaki işlenmez; emir başına kilit iki işleyicinin aynı satırı iki kez yazmasını önler. Yeniden deneme her kayıt isteğinde (o isteğin emirleri ve en eski
// bekleyen emirler) ve arka plan işinde (`isler.ts`) yapılır. TMI komutu ve satırın sonucu aynı işlemdedir: sonuç yazılamazsa komut da geri alınır, iz
// bırakmayan yazım olmaz. Komutu yapan kişi kayıt anındaki oturum kişisidir; yeniden denemede güncel yetkileriyle çözülür (pasif ya da yetkisiz ise
// "reddedildi: yetki"). Yinelenen kayıt (ON CONFLICT) buraya gelmez.
const NEDEN_SINIRI = 300;
const SUPURME_EMIR_SAYISI = 10;

// Kullanıcıya o istekte söylenecek ekler: yazılan komutun uyarısı (katılımda başkası çalışıyor) ve makine dolu retinde devralma ayrıntısı.
// Satıra yazılmaz (yazıldı satırı nedensiz olmalıdır, kısıt); yalnız istekte bekleyen kullanıcıya dönen cevaba girer.
interface YansimaEki { uyari?: string | null; makineDolu?: MakineDoluRedAyrintisi }
type EkToplayici = Map<string, YansimaEki>;
type YansimaSonucu =
  | ({ sonuc: 'yazildi' | 'reddedildi' | 'eslenemedi'; neden: string | null } & YansimaEki)
  | { sonuc: 'ertelendi'; neden: null }
  | null;

// İstek içi okuma önbelleği: aynı istekte aynı emir, kişi ya da istasyon için ikinci okuma yapılmaz. Yalnız başarılı okuma saklanır
// (fırlayan okuma her seferinde yeniden denenir). İki ömür vardır:
// - kalıcı anahtarlar (belge, kişi, istasyon, tanım listeleri) istek boyunca değişmez;
// - `durum:` anahtarları TMI emir durumunu okur ve emri değiştirebilecek bir komuttan sonra, ya da yazma evresinden okuma evresine
//   geçerken temizlenir (`durumuTemizle`). Sağlam ve hurda sayımı emir durumunu değiştirmez, bu yüzden arka arkaya sayımlar okumayı paylaşır.
const DURUM_ONEKI = 'durum:';
interface OkumaOnbellegi {
  bul<T>(anahtar: string): { deger: T } | undefined;
  koy<T>(anahtar: string, deger: T): void;
  oku<T>(anahtar: string, oku: () => Promise<T>): Promise<T>;
  durumuTemizle(): void;
}
function okumaOnbellegiKur(): OkumaOnbellegi {
  const harita = new Map<string, unknown>();
  const onbellek: OkumaOnbellegi = {
    bul: <T>(anahtar: string) => (harita.has(anahtar) ? { deger: harita.get(anahtar) as T } : undefined),
    koy: (anahtar, deger) => { harita.set(anahtar, deger); },
    oku: async <T>(anahtar: string, oku: () => Promise<T>) => {
      const kayitli = onbellek.bul<T>(anahtar);
      if (kayitli !== undefined) return kayitli.deger;
      const deger = await oku();
      harita.set(anahtar, deger);
      return deger;
    },
    durumuTemizle: () => { for (const anahtar of [...harita.keys()]) if (anahtar.startsWith(DURUM_ONEKI)) harita.delete(anahtar); },
  };
  return onbellek;
}

// Sayım komutları emrin durumunu, istasyonunu ve sıradaki iş emrini değiştirmez; başka her komut değiştirebilir.
const DURUMU_DEGISTIRMEYEN_KOMUTLAR: ReadonlySet<string> = new Set(['saglam', 'hurda']);
const emirOzetiAnahtari = (emirId: number): string => `${DURUM_ONEKI}emirOzeti:${emirId}`;
const emirOzetiOku = (db: Db, onbellek: OkumaOnbellegi, emirId: number) => onbellek.oku(emirOzetiAnahtari(emirId), () => emirOzeti(db, emirId));
const acikEmirOku = (db: Db, onbellek: OkumaOnbellegi, emirId: number) => onbellek.oku(`${DURUM_ONEKI}acikEmir:${emirId}`, () => acikEmir(db, emirId));
const uretimEmriOzetiOku = (db: Db, onbellek: OkumaOnbellegi, emirId: number) => onbellek.oku(`${DURUM_ONEKI}uretimEmriOzeti:${emirId}`, () => uretimEmriOzeti(db, emirId));
const isEmriOzetiOku = (db: Db, onbellek: OkumaOnbellegi, isEmriId: number) => onbellek.oku(`${DURUM_ONEKI}isEmriOzeti:${isEmriId}`, () => isEmriOzeti(db, isEmriId));
const paketBelgesiOku = (db: Db, onbellek: OkumaOnbellegi, kimlik: string) => onbellek.oku(`belge:pkgs:${kimlik}`, () => sorgular.belge(db, 'pkgs', kimlik));

// Makine kodları TMI makine kimliğine çevrilir; istasyona ait olup olmadığını ve çalışırlığını TMI başlatırken denetler.
async function makineKodlariniCoz(db: Db, kodlar: readonly string[], onbellek: OkumaOnbellegi): Promise<{ idler: number[] } | { neden: string }> {
  if (kodlar.length === 0) return { idler: [] };
  const harita = new Map((await onbellek.oku('aktifMakineler', () => aktifMakineler(db))).map((m) => [m.kod, m.id]));
  const idler: number[] = [];
  for (const kod of kodlar) {
    const id = harita.get(kod);
    if (id === undefined) return { neden: `Makine TMI'de yok ya da pasif: ${kod}.` };
    idler.push(id);
  }
  return { idler };
}

// Kişinin bu işteki son katılımı ve şu an çalışan öteki kişiler (uretim-emirleri katılım okuması).
async function katilimDurumu(db: Db, kisiId: number, emirId: number, onbellek?: OkumaOnbellegi): Promise<KatilimDurumu> {
  const son = new Map<number, Katilim>();
  const katilim = onbellek === undefined ? await katilimlar(db, emirId) : await onbellek.oku(`${DURUM_ONEKI}katilimlar:${emirId}`, () => katilimlar(db, emirId));
  for (const k of katilim.katilimlar) son.set(k.kisi.id, k);
  const benim = son.get(kisiId);
  return {
    benim: benim === undefined ? 'yok' : benim.cikis === null ? 'acik' : benim.kapanis === 'duraklat' ? 'duraklamis' : 'yok',
    digerleriAcik: [...son.values()].filter((k) => k.kisi.id !== kisiId && k.cikis === null).map((k) => k.kisi.ad),
    emirCalisiyor: (onbellek === undefined ? await acikEmir(db, emirId) : await acikEmirOku(db, onbellek, emirId))?.canli?.calisma === 'calisiyor',
  };
}

// Reddedilen durum kaydından sonra işin TMI'deki hâli (kişinin gözünden): ekran duraklamış, TMI çalışıyor kalmasın.
async function tmidekiHal(db: Db, kisiId: number, emirId: number, onbellek: OkumaOnbellegi): Promise<ArkonDurumu | null> {
  const ozet = await emirOzetiOku(db, onbellek, emirId);
  if (ozet === null) return null;
  if (ozet.durum !== 'basladi') return tmidekiDurum(ozet.durum, null, 'yok');
  const calisma = (await acikEmirOku(db, onbellek, emirId))?.canli?.calisma ?? null;
  return tmidekiDurum(ozet.durum, calisma, calisma === 'calisiyor' ? (await katilimDurumu(db, kisiId, emirId, onbellek)).benim : 'yok');
}

// Komutu yürütür. Kural reddi sonuç olarak döner; geçici hata fırlar (çağıran satırı bekliyor bırakır).
// Denetim #25: TMI satırları Arkon kaydının zamanıyla yazılır (çevrimdışı kuyruktan gelen kayıt sunucunun aldığı ana yığılmaz).
// Zaman emrin son anından eskiyse ya da sunucu saatinden ilerideyse sayım kaybolmasın diye sunucu saatiyle yazılır.
async function kayitAniyla<T>(db: Db, an: string, is: (an: string | undefined) => Promise<T>): Promise<T> {
  const ilk = await kayitNoktasi(db, () => is(an));
  if (ilk.tamam) return ilk.deger;
  if (ilk.hata instanceof UygulamaHatasi && ilk.hata.kod === 'DOGRULAMA' && ilk.hata.alan === 'an') return is(undefined);
  throw ilk.hata;
}

async function tmiKomutuYurut(db: Db, kullanici: Kullanici, karar: YansimaKarari, emirId: number, kayitAni: string, onbellek: OkumaOnbellegi): Promise<NonNullable<YansimaSonucu>> {
  if (karar.komut === null) return { sonuc: 'eslenemedi', neden: karar.neden ?? 'Karşılığı yok.' };
  const emir = await emirOzetiOku(db, onbellek, emirId);
  if (emir === null) return { sonuc: 'eslenemedi', neden: `TMI üretim emri bulunamadı: ${emirId}.` };
  // Ertelemeden önce: başka adımın ya da istasyonun paketinden gelen sayım bekletilirse sonraki adım başlayınca ona yazılırdı.
  const ret = karar.isEmriId === null ? await emirPaketiReddi(db, emirId, emir.istasyonId, onbellek) : await adimSirasiReddi(db, emirId, karar.isEmriId, karar.komut, onbellek);
  if (ret !== null) return { sonuc: 'eslenemedi', neden: ret };
  const komut = karar.komut;
  if ((komut.komut === 'saglam' || komut.komut === 'hurda') && emir.durum === 'planli') return { sonuc: 'ertelendi', neden: null };
  // Aynı işte birden çok kişi: kişi yalnız kendi çalışmasını duraklatır ve bitirir; insanlı istasyonda çalışan işe başlatma katılımdır.
  let yol: KatilimYolu = { yol: 'emir' };
  if (emir.durum === 'basladi' && (komut.komut === 'basla-ya-da-devam' || komut.komut === 'duraklat' || komut.komut === 'kuyruga-al' || komut.komut === 'durdur' || komut.komut === 'bitir')) {
    const kaynak = komut.komut === 'basla-ya-da-devam' ? ((await onbellek.oku(`istasyonKapasitesi:${emir.istasyonId}`, () => istasyonKapasitesi(db, emir.istasyonId)))?.kaynak ?? 'makine') : 'makine';
    yol = katilimYolu(komut.komut, emir.durum, kaynak, await katilimDurumu(db, kullanici.id, emir.id));
    if (yol.yol === 'ret') return { sonuc: 'reddedildi', neden: yol.neden };
    if (yol.yol === 'degisiklik-yok') return { sonuc: 'eslenemedi', neden: ZATEN_CALISIYOR };
  }
  const ek: YansimaEki = {};
  let is: () => Promise<unknown>;
  switch (komut.komut) {
    // Planlı emir başlar; başlamış emir (duraklamış ya da durmuş) devam eder: çalışan emre devam TMI'de reddedilir.
    case 'basla-ya-da-devam': {
      if (yol.yol === 'katil') {
        is = async () => { ek.uyari = (await kayitAniyla(db, kayitAni, (an) => katil(db, kullanici, emir.id, an))).uyari; };
        break;
      }
      const secim = await makineKodlariniCoz(db, komut.makineKodlari, onbellek);
      if ('neden' in secim) return { sonuc: 'reddedildi', neden: secim.neden };
      const makineler = secim.idler.length === 0 ? undefined : secim.idler;
      is = () => kayitAniyla<unknown>(db, kayitAni, (an) => (emir.durum === 'planli' ? emirBaslat(db, kullanici, emir.id, makineler, an) : emirDevam(db, kullanici, emir.id, makineler, an)));
      break;
    }
    // Başlamış işte (yeniden hazırlık) ya da ayarı zaten yazılmış işte TMI'de değişecek bir şey yoktur.
    case 'ayar':
      if (emir.durum !== 'planli') return { sonuc: 'eslenemedi', neden: HAZIRLIK_DEGISIKLIK_YOK };
      is = () => kayitAniyla(db, kayitAni, (an) => emirAyar(db, kullanici, emir.id, an));
      break;
    case 'duraklat': case 'kuyruga-al': is = () => kayitAniyla<unknown>(db, kayitAni, (an) => (yol.yol === 'katilim-duraklat' ? katilimDuraklat(db, kullanici, emir.id, an) : emirDuraklat(db, kullanici, emir.id, an))); break;
    case 'bitir': is = () => kayitAniyla<unknown>(db, kayitAni, (an) => (yol.yol === 'katilim-ayril' ? katilimAyril(db, kullanici, emir.id, an) : emirBitir(db, kullanici, emir.id, undefined, an))); break;
    case 'saglam': {
      // Karar bekleyen kısım (131 b) TMI'de ayrı satırdır; ikisi aynı kayıt noktasında yazılır, biri reddedilirse ikisi de yazılmaz.
      const kart = komut.refakatPartisiId === null ? {} : { refakatPartisiId: komut.refakatPartisiId };
      const saglam = sayimGovdesi.safeParse({ tur: 'saglam', adet: komut.adet - komut.kararBekliyor, ...kart });
      const bekleyen = sayimGovdesi.safeParse({ tur: 'saglam', adet: komut.kararBekliyor, ...kart });
      // Sayımın yönlendiren uyarısı (#157, örn. kartın malzemesi başka konumda) operatöre kaydın uyarısı olarak döner; sayımı durdurmaz.
      const uyariyla = async (c: Promise<{ uyari: string | null }>) => { ek.uyari = uyariBirlestir(ek.uyari, (await c).uyari); };
      if (komut.kararBekliyor === 0 || !bekleyen.success) {
        if (!saglam.success) return { sonuc: 'reddedildi', neden: saglam.error.issues[0]?.message ?? 'Sayım geçersiz.' };
        is = () => kayitAniyla(db, kayitAni, (an) => uyariyla(emirSayim(db, kullanici, emir.id, saglam.data, { an })));
        break;
      }
      is = () => kayitAniyla(db, kayitAni, async (an) => {
        if (saglam.success) await uyariyla(emirSayim(db, kullanici, emir.id, saglam.data, { an }));
        await uyariyla(emirSayim(db, kullanici, emir.id, bekleyen.data, { kararBekliyor: true, an }));
      });
      break;
    }
    case 'durdur': {
      const neden = (await onbellek.oku('durusNedenleri', () => durusNedenleriniListele(db, { yalnizAktif: false }))).find((n) => n.kod === komut.nedenKodu);
      if (neden === undefined) return { sonuc: 'eslenemedi', neden: `Duruş nedeni TMI'de yok: ${komut.nedenKodu}.` };
      is = () => kayitAniyla(db, kayitAni, (an) => emirDurdur(db, kullanici, emir.id, neden.id, an));
      break;
    }
    case 'hurda': {
      const neden = komut.nedenKodu === null ? null : (await onbellek.oku('hurdaNedenleri', () => hurdaNedenleriniListele(db, { yalnizAktif: false }))).find((n) => n.kod === komut.nedenKodu);
      if (neden === undefined) return { sonuc: 'eslenemedi', neden: `Hurda nedeni TMI'de yok: ${komut.nedenKodu}.` };
      const govde = sayimGovdesi.safeParse({
        tur: 'hurda', adet: komut.adet, ...(neden === null ? {} : { hurdaNedeniId: neden.id }), ...(komut.refakatPartisiId === null ? {} : { refakatPartisiId: komut.refakatPartisiId }),
      });
      if (!govde.success) return { sonuc: 'reddedildi', neden: govde.error.issues[0]?.message ?? 'Sayım geçersiz.' };
      is = () => kayitAniyla(db, kayitAni, (an) => emirSayim(db, kullanici, emir.id, govde.data, { an }));
      break;
    }
  }
  // Bitmiş emre yeniden gelen bitirme (Arkon ekranı sonucu yeniden gönderir): yapılacak değişiklik yoktur, ret değildir.
  if (komut.komut === 'bitir' && emir.durum === 'bitti') return { sonuc: 'eslenemedi', neden: BITMIS_BITIR };
  const sonuc = await kayitNoktasi(db, is);
  if (sonuc.tamam) {
    // Sayım stoktan malzeme düşemeyecekse operatör başlatırken (girdisiz rota ya da stokta olmayan girdi) ve sayarken (stokta yok) görür.
    if (komut.komut === 'basla-ya-da-devam' || komut.komut === 'saglam') {
      const isEmriId = karar.isEmriId ?? (await (komut.komut === 'saglam' ? uretimEmriOzetiOku(db, onbellek, emirId) : uretimEmriOzeti(db, emirId)))?.siradakiIsEmriId ?? null;
      const girdi = await uretimGirdiUyarisi(db, { uretimEmriId: emirId, isEmriId, istasyonId: emir.istasyonId, stokYok: komut.komut === 'saglam' });
      ek.uyari = uyariBirlestir(ek.uyari, girdi);
    }
    return { sonuc: 'yazildi', neden: null, ...ek };
  }
  // Kuyruğa alınan emir zaten duraklamış, durmuş ya da başlamamışsa TMI durum kuralı (çakışma) reddeder: yapılacak değişiklik yoktur, ret değildir.
  if (komut.komut === 'ayar' && sonuc.hata instanceof UygulamaHatasi && sonuc.hata.kod === 'CAKISMA') {
    return { sonuc: 'eslenemedi', neden: `${HAZIRLIK_DEGISIKLIK_YOK} TMI: ${sonuc.hata.mesaj}` };
  }
  if (komut.komut === 'kuyruga-al' && sonuc.hata instanceof UygulamaHatasi && sonuc.hata.kod === 'CAKISMA') {
    return { sonuc: 'eslenemedi', neden: `${KUYRUK_DEGISIKLIK_YOK} TMI: ${sonuc.hata.mesaj}` };
  }
  // Makine başka işte doluysa kullanıcı o işi durdurup kendi işini başlatabilir; aynı işin aynı makinede yeniden başlatılması devralınamaz.
  const dolu = komut.komut === 'basla-ya-da-devam' && sonuc.hata instanceof UygulamaHatasi && sonuc.hata.kod === 'CAKISMA' ? makineDoluAyrintisi.safeParse(sonuc.hata.ayrinti) : null;
  const makineDolu = dolu?.success && dolu.data.emir.id !== emir.id ? { devralEmirId: emir.id, doluOlan: dolu.data } : undefined;
  return { sonuc: 'reddedildi', neden: sonuc.hata instanceof UygulamaHatasi ? sonuc.hata.mesaj : 'TMI kuralı reddetti.', ...(makineDolu === undefined ? {} : { makineDolu }) };
}

// `tmi-ue` paketi: kayıtlıysa makinesi emrin şimdiki istasyonu olmalı (#501); kayıtsızsa emir rotasız olmalı (rotalı emrin taslağı iş emri başınadır).
async function emirPaketiReddi(db: Db, emirId: number, istasyonId: number, onbellek: OkumaOnbellegi): Promise<string | null> {
  const kayitliPaket = await paketBelgesiOku(db, onbellek, emirPaketKimligi(emirId));
  if (kayitliPaket !== null) return paketIstasyonDenetimi(db, emirId, istasyonId, paketMakinesi(kayitliPaket.govde), onbellek);
  return ((await acikEmirOku(db, onbellek, emirId))?.malzemeNo ?? null) === null ? null : ROTALI_EMIR_PAKETI;
}

// `tmi-ie` paketi: iş emri emrin sıradaki iş emri olmalı. Bitmiş adımın yeniden gelen bitirmesi ret değildir (BITMIS_BITIR gibi gizlenir).
async function adimSirasiReddi(db: Db, emirId: number, isEmriId: number, komut: YansimaKarari['komut'], onbellek: OkumaOnbellegi): Promise<string | null> {
  const sira = (await uretimEmriOzetiOku(db, onbellek, emirId))?.siradakiIsEmriId ?? null;
  if (sira === null || sira === isEmriId) return null;
  if (komut?.komut === 'bitir' && (await isEmriOzetiOku(db, onbellek, isEmriId))?.durum === 'tamam') return BITMIS_BITIR;
  return PAKET_ADIM_SIRASI;
}

// Bekleyen adımın başlatması: adım emrin sıradaki adımı değilse ret (sıradaki adım adıyla).
async function baslatmaSirasiReddi(db: Db, emirId: number, isEmriId: number, onbellek: OkumaOnbellegi): Promise<string | null> {
  const sira = (await uretimEmriOzetiOku(db, onbellek, emirId))?.siradakiIsEmriId ?? null;
  if (sira === null || sira === isEmriId) return null;
  const siradaki = await isEmriOzetiOku(db, onbellek, sira);
  return siradaki === null ? PAKET_ADIM_SIRASI : adimSirasiBaslatmaReddi(siradaki);
}

// Kaydın emri: `tmi-ue` paketinde kimlikten, `tmi-ie` paketinde iş emrinden (istek başına iş emri başına bir okuma); bulunamayan iş emrinde null.
// Okuma kayıt noktasındadır: TMI okunamazsa Arkon kaydı yine yazılır, iş emri haritada olmaz ve yansıma "okunamadı" nedeniyle eşlenemez.
type IsEmriBagi = { emirId: number; emirNo: string; durum: string; kaynak: { tur: string; id: number } | null } | null;
async function isEmirlerininEmirleri(db: Db, satirlar: readonly Readonly<Record<string, unknown>>[], gunluk: Gunluk): Promise<Map<number, IsEmriBagi>> {
  const sonuc = new Map<number, IsEmriBagi>();
  for (const satir of satirlar) {
    const id = paketIsEmri(satir['pkgId']);
    if (id === null || sonuc.has(id)) continue;
    try {
      const okuma = await kayitNoktasi(db, () => isEmriOzeti(db, id));
      const d = okuma.tamam ? okuma.deger : null;
      if (okuma.tamam) sonuc.set(id, d === null ? null : { emirId: d.uretimEmriId, emirNo: d.emirNo, durum: d.durum, kaynak: d.kaynak });
      else gunluk.hata(`Arkon: TMI iş emri okunamadı (iş emri ${id}); kayıt eşlenmeden yazılır`, okuma.hata);
    } catch (hata) {
      gunluk.hata(`Arkon: TMI iş emri okunamadı (iş emri ${id}); kayıt eşlenmeden yazılır`, hata);
    }
  }
  return sonuc;
}

// Arkon Planlama'da TMI işinin sırası (A4, kullanıcı kararı "b"): plan modülünde kişinin taslağına yazılır, müdür canlıya alınca Arkon ve
// operatör yeni sırayı canlı plandan okur. Arkon rolünde `plan.edit`, TMI'de `plan.yaz` ister (ikincisini plan denetler); plan kuralları
// (başlamış, kilitli, dondurulmuş, başka kaynak, kapsam) plandadır.
// Planlama ekranı yüklenirken canlı plan sürümünü okur; sıralama isteği bu sürümü taşır (ekran açıkken kuyruğa giren yeni iş de yakalanır).
export async function planSiraSurumu(db: Db, kullanici: Kullanici): Promise<{ planSurumu: number }> {
  await rolGerekli(db, kullanici);
  return { planSurumu: (await canliSira(db, [])).planSurumu };
}

// Refakat kartları (kart #156): istasyon kişinin kapsamında olmalı; kart emir başına stoktan okunur, istasyonda satırı olup olmadığıyla.
export async function refakatKartlari(db: Db, kullanici: Kullanici, istasyonKodu: string, emirIdler: readonly number[]): Promise<{ kartlar: ArkonRefakatKarti[] }> {
  await rolGerekli(db, kullanici);
  const istasyon = (await istasyonlar(db, { pasiflerDahil: false })).find((i) => i.kod === istasyonKodu);
  if (istasyon === undefined) throw bulunamadi('İstasyon bulunamadı.');
  if (!kapsamdaMi(await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri), istasyon.isMerkeziId)) throw kapsamDisi();
  const kartlar: ArkonRefakatKarti[] = [];
  for (const emirId of emirIdler) {
    for (const k of await emrinRefakatKartlari(db, emirId, istasyon.id)) {
      kartlar.push({
        id: k.id, uretimEmriId: emirId, etiket: k.etiket, lotNo: k.lotNo, malzemeKod: k.malzemeKod, malzemeAd: k.malzemeAd, birim: k.birim,
        verilen: k.verilen, istasyondaSatirVar: k.istasyondaSatirVar, sayilan: k.sayilan, sinir: k.sinir,
      });
    }
  }
  return { kartlar };
}
// 393 d sonrası makine seçicisi: emrin istasyonundaki makinelerin ayrımı, başlatma denetimiyle aynı kuraldan (uretim-emirleri). Ayrım başka
// emrin numarasını ve saatini taşır: kapsam dışındaki istasyonun ayrımı okunmaz. Emir yoksa ya da istasyonsuzsa seçici bugünkü gibi kalır.
export async function makineAyrimlari(db: Db, kullanici: Kullanici, emirId: number): Promise<MakineAyrimlariCevabi> {
  await rolGerekli(db, kullanici);
  const emir = await emirOzeti(db, emirId);
  const istasyon = emir === null ? null : await istasyonGetir(db, emir.istasyonId);
  if (istasyon === null) return { planMakinesi: null, ayrimlar: [] };
  if (!kapsamdaMi(await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri), istasyon.isMerkeziId)) throw kapsamDisi();
  const kodlar = new Map((await istasyondakiMakineler(db, istasyon.id)).map((m) => [m.id, m.kod]));
  const { atanan, ayrimlar } = await emrinMakineAyrimlari(db, emirId, [...kodlar.keys()]);
  return {
    planMakinesi: atanan === null ? null : kodlar.get(atanan) ?? null,
    ayrimlar: ayrimlar.flatMap((a) => { const mc = kodlar.get(a.makineId); return mc === undefined ? [] : [{ mc, emirNo: a.emirNo, opNo: a.opNo, baslangic: a.baslangic }]; }),
  };
}

export async function planSirasiYaz(
  db: Db, kullanici: Kullanici,
  g: { kaynak: { tur: 'makine' | 'kisi'; id: number }; onceki: readonly number[]; yeni: readonly number[]; planSurumu: number },
): Promise<{ taslakId: number; taslakAcildi: boolean }> {
  if (!planSiralayabilirMi(await rolGerekli(db, kullanici))) throw yetkiYok(ILETILER.planSiraYetki);
  const { planSurumu, yerlesimler } = await canliSira(db, g.onceki);
  if (g.planSurumu !== planSurumu) throw cakisma(ILETILER.planSiraEski);
  const canli = yerlesimler.filter((y) => y.kaynak.tur === g.kaynak.tur && y.kaynak.id === g.kaynak.id).map((y) => y.isEmriId);
  const ret = planSirasiReddi(g.onceki, g.yeni, canli);
  if (ret === 'planSiraGecersiz') throw dogrulama(ILETILER.planSiraGecersiz, 'yeni');
  if (ret === 'planSiraEski') throw cakisma(ILETILER.planSiraEski);
  const durum = new Map((await planlanacakIsEmirleri(db, { taslakDahil: true })).map((i) => [i.id, i.durum]));
  const sabit = new Set(yerlesimler.filter((y) => y.kilitli || y.dondurulmus || !['planli', 'taslak', 'basladi'].includes(durum.get(y.isEmriId) ?? '')).map((y) => y.isEmriId));
  const tasinacak = planSirasiTasinacaklar(g.onceki, g.yeni, sabit);
  if (tasinacak === 'planSiraSabit') throw cakisma(ILETILER.planSiraSabit);
  if (tasinacak === 'planSiraDegismedi') throw dogrulama(ILETILER.planSiraDegismedi, 'yeni');
  return kuyruguSirala(db, kullanici, { kaynak: g.kaynak, isEmriIdleri: tasinacak, planSurumu });
}

// Üretim Hazırlık kuyruk sırası (kart 527, 519 1 c, 522): istasyonun TMI iş emri paketleri Hazırlık'ın sırasıyla dizilir, operatör onu izler;
// canlı plan değişmez. Uç `arkon.kuyruk-sirala` ister; Arkon rolü ve istasyonun iş merkezi kapsamı burada denetlenir. Kilitli ya da dondurulmuş
// iş (plan) yerinde kalır, başlamış iş taşınır (A4 ile aynı kural).
export async function kuyrukSirasiYaz(db: Db, kullanici: Kullanici, g: KuyrukSiralaGovdesi): Promise<{ surum: number }> {
  const istasyon = await kuyrukIstasyonu(db, kullanici, g.istasyon);
  if ([...g.onceki, ...g.yeni].some((k) => paketIsEmri(k) === null)) throw dogrulama(KUYRUK_ILETILERI.pakete, 'yeni');
  await sorgular.kuyrukKilitle(db, istasyon.id);
  const mevcut = [...(await tmiTaslaklari(db, await sorgular.belgeler(db, 'pkgs'))).isEmri.values()].filter((p) => {
    const tmi = p['tmi'] as { bolunmus?: boolean } | undefined;
    return p['machine'] === istasyon.kod && tmi?.bolunmus !== true;
  }).map((p) => ({ kimlik: String(p['id']), sira: (p['tmi'] as { kuyruk?: { sira: number } } | undefined)?.kuyruk?.sira ?? null }));
  const ret = kuyrukSirasiReddi(g.onceki, g.yeni, mevcut);
  if (ret === 'gecersiz') throw dogrulama(KUYRUK_ILETILERI.gecersiz, 'yeni');
  if (ret === 'eski') throw cakisma(KUYRUK_ILETILERI.eski);
  const { yerlesimler } = await canliSira(db, [...new Set(g.onceki.map((k) => paketIsEmri(k)!))]);
  const sabitIsler = new Set(yerlesimler.filter((y) => y.kilitli || y.dondurulmus).map((y) => y.isEmriId));
  const tasinacak = planSirasiTasinacaklar(g.onceki, g.yeni, new Set(g.onceki.filter((k) => sabitIsler.has(paketIsEmri(k)!))));
  if (tasinacak === 'planSiraSabit') throw cakisma(KUYRUK_ILETILERI.sabit);
  if (tasinacak === 'planSiraDegismedi') throw dogrulama(KUYRUK_ILETILERI.degismedi, 'yeni');
  const surum = Date.now();
  await sorgular.kuyrukSirasiYaz(db, istasyon.id, g.yeni.map((k) => {
    const p = paketParcasi(k)!;
    return { isEmriId: p.isEmriId, parcaNo: p.no ?? 0 };
  }), surum, kullanici.id);
  for (const kimlik of g.yeni) await sorgular.iletiEkle(db, g.kaynak, { type: '$db', store: 'pkgs', id: kimlik });
  await gunlugeYaz(db, kullanici, g.kaynak, [{ area: 'plan', action: 'kuyruk sırası', target: istasyon.kod, detail: `${g.yeni.length} iş` }]);
  return { surum };
}

// "Plan sırasına dön": istasyonun Hazırlık sırası kalkar, işler yeniden canlı plan sırasıyla dizilir.
export async function kuyrukPlanaDon(db: Db, kullanici: Kullanici, g: { istasyon: string; kaynak: string }): Promise<{ silinen: number }> {
  const istasyon = await kuyrukIstasyonu(db, kullanici, g.istasyon);
  await sorgular.kuyrukKilitle(db, istasyon.id);
  const silinen = await sorgular.kuyrukSirasiSil(db, istasyon.id);
  if (silinen.length === 0) throw cakisma(KUYRUK_ILETILERI.bos);
  for (const s of silinen) {
    await sorgular.iletiEkle(db, g.kaynak, { type: '$db', store: 'pkgs', id: s.parcaNo === 0 ? isEmriPaketKimligi(s.isEmriId) : parcaPaketKimligi(s.isEmriId, s.parcaNo) });
  }
  await gunlugeYaz(db, kullanici, g.kaynak, [{ area: 'plan', action: 'kuyruk plan sırasına döndü', target: istasyon.kod, detail: `${silinen.length} iş` }]);
  return { silinen: silinen.length };
}

async function kuyrukIstasyonu(db: Db, kullanici: Kullanici, kod: string): Promise<Istasyon> {
  await rolGerekli(db, kullanici);
  const istasyon = (await istasyonlar(db, { pasiflerDahil: false })).find((i) => i.kod === kod);
  if (istasyon === undefined) throw bulunamadi('İstasyon bulunamadı.');
  if (!kapsamdaMi(await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri), istasyon.isMerkeziId)) throw kapsamDisi();
  return istasyon;
}

// Bekleyen iş emrini başlatan olayların plan durumu; başlatma yoksa plan okunmaz. Okunamayan iş emri burada değil yansımada eşlenmez.
// Ayar (`arkon.yalniz-canli-plan`, kart #1257) kapalıyken plan okunmaz. Açıkken rotasız emrin adımı plana girmediği için serbesttir.
async function baslatilacaklarinPlani(
  db: Db, tur: ArkonKayitTuru, satirlar: readonly Readonly<Record<string, unknown>>[], isEmriEmirleri: ReadonlyMap<number, IsEmriBagi>,
): Promise<{ zorunlu: boolean; planlar: Map<number, TmiPlanDurumu>; parcaPlanlari: Map<string, TmiPlanDurumu> }> {
  const kaynaklar = new Map<number, { tur: string; id: number } | null>();
  for (const satir of satirlar) {
    const id = paketIsEmri(satir['pkgId']);
    const bag = id === null ? undefined : isEmriEmirleri.get(id);
    if (id !== null && bag && planBaslatmaReddi(tur, satir, bag.durum, undefined)) kaynaklar.set(id, bag.kaynak);
  }
  const parcaPlanlari = new Map<string, TmiPlanDurumu>();
  if (kaynaklar.size === 0 || !(await sistemAyariOku(db, 'arkon.yalniz-canli-plan'))) return { zorunlu: false, planlar: new Map(), parcaPlanlari };
  const rotali = new Set((await planlanacakIsEmirleri(db)).map((i) => i.id));
  const planlar = planDurumlari((await canliSira(db, [...kaynaklar.keys()])).yerlesimler, kaynaklar, true, parcaPlanlari);
  for (const id of kaynaklar.keys()) if (!rotali.has(id)) planlar.set(id, { ...PLANSIZ, zorunlu: false });
  return { zorunlu: true, planlar, parcaPlanlari };
}

// Yansıma satırını Arkon kaydıyla birlikte yazar: karşılığı olmayan kayıt hemen "eslenemedi", yansıtılabilir kayıt "bekliyor".
async function tmiyeKuyrugaAl(
  db: Db, kullanici: Kullanici, kayitId: number, karar: YansimaKarari, emirNo: number | null, isEmriOkunamadi: boolean, gunluk: Gunluk, onbellek: OkumaOnbellegi,
): Promise<void> {
  const eslenemedi = (neden: string) => sorgular.yansimaYaz(db, kayitId, null, kullanici.id, 'eslenemedi', neden.slice(0, NEDEN_SINIRI));
  if (karar.komut !== null && isEmriOkunamadi) {
    await eslenemedi(`TMI iş emri okunamadı: ${karar.isEmriId}; kayıt TMI'ye işlenmedi.`);
    return;
  }
  // Emrin okuması noktanın içindedir: TMI tablosu okunamazsa (süre aşımı) Arkon kaydı düşmez, satır karar.emirId ile bekliyor yazılır;
  // emrin yokluğunu yeniden denemede tmiKomutuYurut "eslenemedi" yapar. AR2: iptal edilmiş emre kayıt alınmaz (karşılığı olmayan
  // kurulum kaydı da); ret işlemi geri alır, Arkon kaydı da yazılmaz. Okunamazsa TMI komutu yansımada reddedilir.
  let emirYok = false;
  let iptalEdildi = false;
  if (emirNo !== null) {
    try {
      // Önbellekteki okuma aynı istekte daha önce başarıyla yapılmıştır; kayıt noktası yalnız ilk okumada açılır.
      const onceki = onbellek.bul<Awaited<ReturnType<typeof emirOzeti>>>(emirOzetiAnahtari(emirNo));
      const okuma = onceki !== undefined ? { tamam: true as const, deger: onceki.deger } : await kayitNoktasi(db, () => emirOzeti(db, emirNo));
      if (okuma.tamam && onceki === undefined) onbellek.koy(emirOzetiAnahtari(emirNo), okuma.deger);
      emirYok = okuma.tamam && okuma.deger === null;
      iptalEdildi = okuma.tamam && okuma.deger?.durum === 'iptal';
    } catch (hata) {
      gunluk.hata(`Arkon: TMI emri okunamadı (emir ${emirNo}); kayıt bekliyor yazıldı`, hata);
      emirYok = false;
    }
  }
  if (iptalEdildi) throw yetkiYok(ILETILER.emirIptal);
  if (karar.komut !== null && emirNo === null && karar.isEmriId !== null) {
    await eslenemedi(`TMI iş emri bulunamadı: ${karar.isEmriId}.`);
    return;
  }
  if (karar.komut === null || emirNo === null) {
    await eslenemedi(karar.neden ?? 'Karşılığı yok.');
    return;
  }
  if (emirYok) {
    await eslenemedi(`TMI üretim emri bulunamadı: ${emirNo}.`);
    return;
  }
  await sorgular.yansimaYaz(db, kayitId, emirNo, kullanici.id, 'bekliyor', null);
}

// Geçici hata: kilit ya da süre aşımı, kilitlenme, serileştirme, bağlantı, sunucu hatası sınıfı. Çekirdekte süre aşımı ve bağlantı için yardımcı
// vardır (vtSureDoldu, vtUlasilamadi); kilitlenme ve serileştirme SQLSTATE'i (40P01, 40001) için yoktur ve burada listelenir. Satır bekliyor kalır,
// sınırsız yeniden denenir. Başka her hata (P0001, sınıf 22 ve 42, TypeError) beklemekle geçmez: HATALI_DENEME denemeden sonra "hatali" olur.
const GECICI_SQLSTATE: ReadonlySet<string> = new Set(['40001', '40P01']);
const HATALI_DENEME = 5;

export function geciciHataMi(hata: unknown): boolean {
  if (vtSureDoldu(hata) || vtUlasilamadi(hata)) return true;
  if (hata instanceof UygulamaHatasi) return hata.durum >= 500;
  const kod = vtHataIzi(hata)?.code;
  return kod !== undefined && GECICI_SQLSTATE.has(kod);
}

// Saklanan hata özeti: SQLSTATE, kısıt ya da tablo adı ve çekirdeğin günlükte kullandığı ayıklanmış ileti (sınıf 22'de reddedilen değer ileti yerine sabit
// metindir). PostgreSQL dışı hatada yalnız tür adı: iletisi değer taşıyabilir.
function hataOzeti(hata: unknown): string {
  const izi = vtHataIzi(hata);
  if (izi === null) return `${hata instanceof Error ? hata.name : 'Hata'}: beklenmeyen hata`.slice(0, NEDEN_SINIRI);
  const yer = izi.constraint ?? izi.table;
  return `${izi.code ?? '?'}${yer === undefined ? '' : ` ${yer}`}: ${izi.message}`.slice(0, NEDEN_SINIRI);
}

// Emir başına işleme kilidi işlem sonuna kadar tutulur; sorgu bekletmez: kilit yoklanır (en çok KILIT_BEKLEME_MS), alınamazsa false döner.
// Kilit alma hatası isteği düşürmez (alınamamış sayılır).
async function emirKilidiniDene(db: Db, emirId: number, beklemeMs: number, gunluk: Gunluk): Promise<boolean> {
  const bitis = Date.now() + beklemeMs;
  for (;;) {
    try {
      const s = await kayitNoktasi(db, () => sorgular.emirKilidiniDene(db, emirId));
      if (s.tamam && s.deger) return true;
      if (Date.now() >= bitis) return false;
      await kayitNoktasi(db, () => sorgular.kisaBekle(db));
    } catch (hata) {
      gunluk.hata(`Arkon: emir kilidi denenemedi (emir ${emirId}); alınamamış sayıldı`, hata);
      return false;
    }
  }
}

// İsteğin dokunduğu emirlerin kilitleri Arkon kaydı ve yansıma satırı yazılmadan ÖNCE, emir kimliğine göre ARTAN sırada alınır (iki istek ters sırada
// istese de çevrim oluşmaz). Alınamayan emrin satırları yine yazılır ve bekliyor kalır. Toplam bekleme ISTEK_KILIT_BUTCESI_MS ile sınırlıdır.
async function emirKilitleriniAl(db: Db, emirler: readonly number[], gunluk: Gunluk): Promise<Set<number>> {
  const alinan = new Set<number>();
  const bitis = Date.now() + ISTEK_KILIT_BUTCESI_MS;
  for (const id of [...new Set(emirler)].sort((a, b) => a - b)) {
    if (await emirKilidiniDene(db, id, Math.max(0, Math.min(KILIT_BEKLEME_MS, bitis - Date.now())), gunluk)) alinan.add(id);
  }
  return alinan;
}

// Emrin bekleyenlerini kayıt sırasıyla işler (emir kilidi çağıranda tutulur). Öndeki geçici hatayla ya da aralığı dolmadan kalırsa ardındakilere dokunulmaz;
// öndeki geçici olmayan hatadan "hatali" olunca ardındakilere geçilir. Başlamamış emre sayım bekler ama ardındaki olayları tıkamaz: olaylar sırayla işlenir,
// başlama yazılınca bekleyen sayımlar ardındakilerden önce yazılır. Satır işi kayıt noktasındadır: okuma ve komut hatası işlemi bozmaz.
async function emrinBekleyenleriniIsle(db: Db, emirId: number, onbellek: OkumaOnbellegi, ekler?: EkToplayici, buIstek?: ReadonlySet<number>): Promise<void> {
  const satirlar = await sorgular.bekleyenYansimalar(db, emirId);
  const sira = yansimaSirasi(satirlar.map((y) => ({ ertelendi: y.son_hata === SAYIM_ERTELEME, komut: yansimaKarari(y.tur, y.govde).komut?.komut ?? null })));
  const ertelenen: sorgular.BekleyenYansima[] = [];
  let basladi: boolean | null = null;
  for (const i of sira) {
    const y = satirlar[i];
    if (y === undefined) return;
    if (y.son_hata === SAYIM_ERTELEME) {
      basladi ??= await emirBasladiMi(db, emirId);
      if (!basladi) {
        ertelenen.push(y);
        continue;
      }
    } else if (!y.uygun) {
      return;
    }
    const adim = await bekleyeniIsle(db, y, emirId, onbellek, ekler, buIstek);
    if (adim === 'dur') return;
    if (adim === 'ertelendi') {
      ertelenen.push(y);
      continue;
    }
    if (adim === 'basladi') {
      basladi = true;
      for (const e of ertelenen.splice(0)) if ((await bekleyeniIsle(db, e, emirId, onbellek, ekler, buIstek)) === 'dur') return;
    }
  }
}

// Tek bekleyen satırın denemesi. 'dur': emrin ardındakilere geçilmez; 'basladi': başlama ya da devam yazıldı.
async function bekleyeniIsle(
  db: Db, y: sorgular.BekleyenYansima, emirId: number, onbellek: OkumaOnbellegi, ekler?: EkToplayici, buIstek?: ReadonlySet<number>,
): Promise<'devam' | 'dur' | 'ertelendi' | 'basladi'> {
  try {
    return await bekleyeniDene(db, y, emirId, onbellek, ekler, buIstek);
  } finally {
    // Emri değiştirebilecek komuttan sonra durum okumaları eskir; sayım komutundan sonra eskimez.
    if (!DURUMU_DEGISTIRMEYEN_KOMUTLAR.has(yansimaKarari(y.tur, y.govde).komut?.komut ?? '')) onbellek.durumuTemizle();
  }
}

async function bekleyeniDene(
  db: Db, y: sorgular.BekleyenYansima, emirId: number, onbellek: OkumaOnbellegi, ekler?: EkToplayici, buIstek?: ReadonlySet<number>,
): Promise<'devam' | 'dur' | 'ertelendi' | 'basladi'> {
  const karar = yansimaKarari(y.tur, y.govde);
  let sonuc: NonNullable<YansimaSonucu>;
  try {
    const s = await kayitNoktasi(db, async (): Promise<NonNullable<YansimaSonucu>> => {
      const kisi = await onbellek.oku(`kisi:${y.kisi_id}`, () => kullaniciYukle(db, y.kisi_id));
      if (kisi === null) return { sonuc: 'reddedildi', neden: 'Yetki yok: kişi pasif ya da kullanıcı değil.' };
      return tmiKomutuYurut(db, kisi, karar, emirId, y.zaman, onbellek);
    });
    sonuc = s.tamam ? s.deger : { sonuc: 'reddedildi', neden: s.hata instanceof UygulamaHatasi ? s.hata.mesaj : 'TMI kuralı reddetti.' };
  } catch (hata) {
    if (geciciHataMi(hata)) {
      await sorgular.yansimaGecici(db, y.id, hataOzeti(hata));
      return 'dur';
    }
    if ((await sorgular.yansimaGeciciOlmayan(db, y.id, hataOzeti(hata), HATALI_DENEME)) !== 'hatali') return 'dur';
    await gecikmeliRetBildir(db, y, 'hatali', null, buIstek);
    return 'devam';
  }
  if (sonuc.sonuc === 'ertelendi') {
    await sorgular.yansimaGecici(db, y.id, SAYIM_ERTELEME);
    return 'ertelendi';
  }
  await sorgular.yansimaSonuclandir(db, y.id, sonuc.sonuc, sonuc.neden === null ? null : sonuc.neden.slice(0, NEDEN_SINIRI));
  await gecikmeliRetBildir(db, y, sonuc.sonuc, sonuc.neden, buIstek);
  if (ekler !== undefined && (sonuc.uyari != null || sonuc.makineDolu !== undefined)) ekler.set(y.cid, { uyari: sonuc.uyari ?? null, ...(sonuc.makineDolu === undefined ? {} : { makineDolu: sonuc.makineDolu }) });
  return sonuc.sonuc === 'yazildi' && karar.komut?.komut === 'basla-ya-da-devam' ? 'basladi' : 'devam';
}

async function gecikmeliRetBildir(db: Db, y: sorgular.BekleyenYansima, sonuc: string, neden: string | null, buIstek?: ReadonlySet<number>): Promise<void> {
  const ileti = gecikmeliSayimReddi(y.tur, sonuc, neden, buIstek?.has(y.kayit_id) === true);
  if (ileti !== null) await sorgular.iletiEkle(db, SUNUCU_KAYNAGI, tmiRetIletisi(y, ileti));
}

async function emirBasladiMi(db: Db, emirId: number): Promise<boolean> {
  const okuma = await kayitNoktasi(db, () => emirOzeti(db, emirId));
  return okuma.tamam && okuma.deger !== null && okuma.deger.durum !== 'planli';
}

// Emrin tüm işlemesi her hatayı yakalayan sargıdadır: kilit sonrası ne olursa olsun Arkon kaydı ve bekliyor satırı düşmez.
// Geri alınan işlemenin nedeni bekleyen satırlara yazılır, yoksa satır nedensiz bekler ve yansıma listesinde kimse göremez.
// Kalan sınır: kayıt noktası geri alınamazsa (bağlantı koptu) işlem ölür; neden de yazılamaz.
async function korumaliIsle(
  db: Db, emirId: number, ekler?: EkToplayici, onbellek: OkumaOnbellegi = okumaOnbellegiKur(), buIstek?: ReadonlySet<number>,
): Promise<void> {
  let hata: unknown = null;
  try {
    const s = await kayitNoktasi(db, () => emrinBekleyenleriniIsle(db, emirId, onbellek, ekler, buIstek));
    if (!s.tamam) hata = s.hata;
  } catch (e) {
    hata = e;
  }
  if (hata === null) return;
  try {
    await kayitNoktasi(db, () => sorgular.bekleyenlereNedenYaz(db, emirId, hataOzeti(hata), SAYIM_ERTELEME));
  } catch {
    // işlem kullanılamaz: yazılacak yer yok
  }
}

// Arka plan işinin turu: aralığı dolmuş bekleyeni olan en eski emirler; kilidi başkası tutuyorsa atlanır (beklenmez).
// İstek başka emirlerin birikmişini işlemez (operatörün isteği onları beklemesin); bu tur işler. Dış hata zamanlayıcının kaydına düşer.
export async function bekleyenleriYinele(db: Db, gunluk: Gunluk): Promise<void> {
  const adaylar = await kayitNoktasi(db, () => sorgular.bekleyenEmirler(db, SUPURME_EMIR_SAYISI));
  if (!adaylar.tamam) throw adaylar.hata;
  for (const id of adaylar.deger) {
    if (!(await emirKilidiniDene(db, id, 0, gunluk))) continue;
    await korumaliIsle(db, id);
  }
}

async function istekPaketi(db: Db, istek: unknown): Promise<unknown> {
  const paketId = istek !== null && typeof istek === 'object' ? (istek as Record<string, unknown>)['pkgId'] : undefined;
  return typeof paketId === 'string' && paketId !== '' ? (await belgeBul(db, 'pkgs', paketId))?.govde : undefined;
}

async function paketinUretimEmri(db: Db, paketId: unknown): Promise<number | null> {
  const isEmriId = paketIsEmri(paketId);
  return isEmriId === null ? paketEmri(paketId) : ((await isEmriOzeti(db, isEmriId))?.uretimEmriId ?? null);
}

// B-006 (kullanıcı kararları 129, 131 b): Başlat serbesttir; ilk parça normal sayılır, kalite kararına kadar ondan sonraki sağlam sayım
// karar bekleyen sayılır (dönen adet). Karar Kalite Merkezi'nindir (229 a, denetim #12: emrin son kararı onay değilse bekler; ret sonrası
// da bekler, 136 a); Arkon numunesi ya da tezgah ölçümü kapıyı kapatmaz. Kural `kurallar.ts kararBekleyenAdet`; yeniden ilk parça (hazırlık kararı)
// beklenirken sayım reddedilir (VARSAYIM: 131 b ilk ilk parçanın kararıdır), tabanı hazırlık kararının damgasıdır, kapanışı kararın ardından
// gelen Kalite Merkezi onayıdır (`yenidenIlkParcaAcik`).
async function ilkParcaKapisi(db: Db, satir: Readonly<Record<string, unknown>>, onbellek: OkumaOnbellegi): Promise<number> {
  const paketId = satir['pkgId'];
  if (typeof paketId !== 'string' || paketId === '' || !ilkParcaSayimiAsildi(satir, ILK_PARCA_ADEDI)) return 0;
  // Yalnız kayıtlı paket: tablet taslak paketi göstermez (arkon/web/src/data/tmi-plan.ts operatoreAcik), TMI'den taslak kurmak emri okurdu.
  const paket = await onbellek.oku(`belge:pkgs:${paketId}`, () => sorgular.belge(db, 'pkgs', paketId));
  const olculer = ilkParcaOlculeri(paket?.govde);
  if (olculer.length === 0) return 0;
  const cid = typeof satir['cid'] === 'string' ? satir['cid'] : null;
  const sayilan = await sorgular.parcaSaglami(db, paketId, cid);
  const emirId = await paketinUretimEmri(db, paketId);
  // Emri olmayan paketin sayımı TMI'ye yansımaz ve Kalite Merkezi kararı olamaz: iki kapı da yoktur.
  if (emirId === null) return 0;
  const karar = (await ilkParcaKararlari(db, [emirId])).get(emirId);
  if (karar?.karar !== 'onay') return kararBekleyenAdet(satir, sayilan);
  const sorulur = ilkParcaYenidenSorulur((await onbellek.oku('belge:kv:policy', () => sorgular.belge(db, 'kv', 'policy')))?.govde);
  if (sorulur && yenidenIlkParcaAcik(paket?.govde, karar) && ilkParcaSayimiAsildi(satir, sayilan - yenidenIlkParcaTabani(paket?.govde))) {
    throw cakisma(ILETILER.ilkParcaYeniden);
  }
  return 0;
}

// Denetim #34: pakette kayıtlı merkez çizimi yayında yeni revizyona geçtiyse ya da yayından kalktıysa iş başlatılmaz ve sürdürülmez;
// duraklatma, durdurma ve bitirme serbesttir (yarım işi kapatmak kayıp üretir). Yerel dosya merkeze bağlı olmadığından sorulmaz.
async function cizimRevizyonuKapisi(db: Db, satir: Readonly<Record<string, unknown>>, onbellek: OkumaOnbellegi): Promise<void> {
  const paketId = satir['pkgId'];
  if (satir['state'] !== 'running' || typeof paketId !== 'string' || paketId === '') return;
  const paket = await onbellek.oku(`belge:pkgs:${paketId}`, () => sorgular.belge(db, 'pkgs', paketId));
  const dosyalar = paketMerkezDosyalari(paket?.govde);
  if (dosyalar.length === 0) return;
  const yayinda = new Map<number, string | null>();
  for (const { belgeId } of dosyalar) {
    if (!yayinda.has(belgeId)) yayinda.set(belgeId, (await yayindakiBelgeDosyasi(db, belgeId))?.ozet ?? null);
  }
  const ret = cizimRevizyonuReddi(dosyalar, yayinda);
  if (ret !== null) throw cakisma(ret);
}

// Kod, kaydın zamanındaki sahibine çözülür: tablet çevrimdışıyken kod değişse de kayıt eski kodun istasyonuna bağlanır (kırpma, büyük harf
// ve kod geçmişi istasyonlar modülündedir). Aynı zamanlı satırlar tek çağrıdadır ve bir zaman ilk gerektiğinde çözülür: reddedilen satırdan
// sonrakiler için okuma yapılmaz. Kodsuz satır okuma yapmaz.
function konumKimlikCozucu(db: Db, sutunlar: readonly (KayitSutunlari | null)[]): (s: KayitSutunlari) => Promise<KonumKimlikleri> {
  const gruplar = new Map<number, { istasyon: Set<string>; merkez: Set<string> }>();
  for (const s of sutunlar) {
    if (s === null || (s.makine === null && s.isMerkezi === null)) continue;
    const g = gruplar.get(s.zaman.getTime()) ?? { istasyon: new Set<string>(), merkez: new Set<string>() };
    if (s.makine !== null) g.istasyon.add(s.makine);
    if (s.isMerkezi !== null) g.merkez.add(s.isMerkezi);
    gruplar.set(s.zaman.getTime(), g);
  }
  const cozulen = new Map<number, [Map<string, number>, Map<string, number>]>();
  return async (s) => {
    const an = s.zaman.getTime();
    const g = gruplar.get(an);
    if (g === undefined) return { istasyonId: null, isMerkeziId: null };
    let haritalar = cozulen.get(an);
    if (haritalar === undefined) {
      const zaman = new Date(an);
      haritalar = [await eskiKoddanKimlikCoz(db, 'istasyon', [...g.istasyon], zaman), await eskiKoddanKimlikCoz(db, 'is_merkezi', [...g.merkez], zaman)];
      cozulen.set(an, haritalar);
    }
    return konumKimlikleri(s, ...haritalar);
  };
}

// Parça paketinin adedi ve parça sayısı plandaki parçadandır (istek başına paket başına bir okuma); parça plandan kalktıysa null.
function parcaOkuyucu(db: Db) {
  const onbellek = new Map<string, { no: number; adet: number; toplam: number } | null>();
  return {
    bilgi: async (kimlik: string) => {
      if (!onbellek.has(kimlik)) {
        const p = (await isEmriTaslagi(db, kimlik))?.['tmi'] as { parca?: { no: number; adet: number; toplam: number } } | undefined;
        onbellek.set(kimlik, p?.parca ?? null);
      }
      return onbellek.get(kimlik) ?? null;
    },
  };
}

export async function kayitEkle(
  db: Db, kullanici: Kullanici, tur: ArkonKayitTuru, satirlar: readonly Record<string, unknown>[], kaynak: string, gunluk: Gunluk,
): Promise<KayitEkleCevabi> {
  const rol = await rolGerekli(db, kullanici);
  const sinir = KONUMLU_KAYITLAR.has(tur) ? await kapsamSiniri(db, kullanici) : null;
  // Kilitler kayıt yazılmadan önce alınır (kimlik sırasıyla); alınamayan emrin satırları bekliyor kalır.
  const kararlar = YANSIYAN_KAYITLAR.has(tur) ? satirlar.map((s) => yansimaKarari(tur, s)) : [];
  const isEmriEmirleri = await isEmirlerininEmirleri(db, satirlar, gunluk);
  const kararinEmri = (k: YansimaKarari): number | null => k.emirId ?? (k.isEmriId === null ? null : isEmriEmirleri.get(k.isEmriId)?.emirId ?? null);
  const okunamadi = (k: YansimaKarari): boolean => k.isEmriId !== null && !isEmriEmirleri.has(k.isEmriId);
  const { zorunlu: planZorunlu, planlar, parcaPlanlari } = await baslatilacaklarinPlani(db, tur, satirlar, isEmriEmirleri);
  const parcalar = parcaOkuyucu(db);
  const onbellek = okumaOnbellegiKur();
  const kilitli = await emirKilitleriniAl(db, kararlar.flatMap((k) => kararinEmri(k) ?? []), gunluk);
  let eklenen = 0;
  const yazilanlar: number[] = [];
  const yazilanCidler = new Set<string>();
  const ekler: EkToplayici = new Map();
  const simdi = Date.now();
  const tumSutunlar = satirlar.map((s) => kayitSutunlari(s, simdi));
  const kimlikCoz = konumKimlikCozucu(db, tumSutunlar);
  for (const [sira, satir] of satirlar.entries()) {
    const ret = kayitReddi(tur, satir);
    if (ret !== null) throw dogrulama(ILETILER[ret], ret === 'gunlukSunucu' ? 'tur' : `satirlar.${sira}.${ret === 'hazirliktaSayim' ? 'state' : 'src'}`);
    const rolRet = kayitRoluReddi(tur, satir, rol);
    if (rolRet === 'rolYetmez') throw yetkiYok(ILETILER.kayitRolYetmez);
    if (rolRet !== null) throw dogrulama(ILETILER.olcumKaynagi, `satirlar.${sira}.src`);
    const bicim = kayitBicimiHatasi(satir);
    if (bicim !== null) throw dogrulama(bicim.ileti, `satirlar.${sira}.${bicim.alan}`);
    // İş emri paketinin kaydında emir numarası kapsamda aranmaz (kurallar.ts `paketNoKonumu`): numara iş emrininki olmalı.
    const isEmriId = paketIsEmri(satir['pkgId']);
    const no = satir['orderNo'];
    const bag = isEmriId === null ? undefined : isEmriEmirleri.get(isEmriId);
    if (typeof no === 'string' && no !== '' && bag !== undefined && bag?.emirNo !== no) throw dogrulama(ILETILER.isEmriNo, `satirlar.${sira}.orderNo`);
    const parca = paketParcasi(satir['pkgId']);
    const plan = parca?.no == null ? planlar.get(isEmriId ?? -1) : parcaPlanlari.get(String(satir['pkgId'])) ?? planlar.get(parca.isEmriId);
    if (isEmriId !== null && planBaslatmaReddi(tur, satir, bag?.durum ?? null, plan, planZorunlu)) throw dogrulama(ILETILER.planCanliDegil, `satirlar.${sira}.state`);
    const parcaBilgisi = parca?.no == null ? null : await parcalar.bilgi(String(satir['pkgId']));
    if (tur === 'counts' && parca?.no != null) {
      const cid = typeof satir['cid'] === 'string' ? satir['cid'] : null;
      const ret = parcaSayimReddi(satir, parcaBilgisi, await sorgular.parcaSaglami(db, String(satir['pkgId']), cid));
      if (ret !== null) throw cakisma(ret);
    }
    // Parti kuralı (kol önceki adım bitmeden, birleşme adımı kol gelmeden) kayıttan önce sorulur: kayıt yazılmaz, operatör nedeni hemen görür.
    const parti = isEmriId === null ? null : partiKomutu(tur, satir);
    const partiRet = parti === null || isEmriId === null ? null : await partiKomutuReddi(db, isEmriId, parti);
    if (partiRet !== null) throw cakisma(partiRet);
    const siraRet = isEmriId !== null && parti === 'baslat' && bag?.durum === 'bekliyor' ? await baslatmaSirasiReddi(db, bag.emirId, isEmriId, onbellek) : null;
    if (siraRet !== null) throw cakisma(siraRet);
    if (sinir !== null) await sinir.reddet(kayitKonumu(satir));
    if (tur === 'events') await cizimRevizyonuKapisi(db, satir, onbellek);
    const kararBekleyen = tur === 'counts' ? await ilkParcaKapisi(db, satir, onbellek) : 0;
    const sutunlar = tumSutunlar[sira] ?? null;
    if (sutunlar === null) throw dogrulama('Kayıt kimliği (cid) yok.', `satirlar.${sira}.cid`);
    const temel = kayitGovdesi(satir, kullanici, simdi);
    const govde = kararBekleyen > 0 ? { ...temel, [KARAR_BEKLIYOR_ALANI]: kararBekleyen } : temel;
    const kayitId = await sorgular.kayitEkle(db, tur, sutunlar, govde, kullanici.id, await kimlikCoz(sutunlar));
    if (kayitId === null) continue;
    eklenen++;
    yazilanlar.push(kayitId);
    yazilanCidler.add(sutunlar.cid);
    const cagri = tur === 'calls' ? cagriBildirimi(govde) : null;
    if (cagri !== null) await ekipCagrisiBildir(db, { ...cagri, haric: kullanici.id });
    // Sayımın kararı kaydedilen gövdeden yeniden kurulur: karar bekleyen kısmı yalnız sunucu yazar (istemcinin alanı `kayitGovdesi`nde atılır).
    let karar = kararlar[sira] !== undefined && tur === 'counts' ? yansimaKarari(tur, govde) : kararlar[sira];
    if (karar !== undefined && tur === 'events' && parca?.no != null) {
      const kardesler = await sorgular.kardesParcaDurumlari(db, `${isEmriPaketKimligi(parca.isEmriId)}-p`, String(satir['pkgId']));
      karar = parcaOlayKarari(karar, parcaBilgisi?.toplam ?? kardesler.length + 1, kardesler.map((k) => k.durum));
    }
    if (karar !== undefined) await tmiyeKuyrugaAl(db, kullanici, kayitId, karar, kararinEmri(karar), okunamadi(karar), gunluk, onbellek);
  }
  if (eklenen > 0) await sorgular.iletiEkle(db, kaynak, { type: '$log', kind: tur });
  // Art arda TMI komutları kişi kapsamını ve ad tablolarını bir kez okusun (uretim-emirleri komut önbelleği); Arkon bu kapsamda yalnız kendi tablolarına yazar.
  const buIstek = new Set(yazilanlar);
  await komutOnbellegiyle(db, async () => { for (const id of [...kilitli].sort((a, b) => a - b)) await korumaliIsle(db, id, ekler, onbellek, buIstek); });
  // Yansıma kayıtla aynı istekte işlenir; ret operatörün ekranına dönsün diye sonuç cevaba konur (sessiz kalırsa iş başlamadı sanılır).
  // İşleme emirleri değiştirmiş olabilir: ret sonrası hâl yeni durumdan okunur.
  onbellek.durumuTemizle();
  const reddedilen = [];
  for (const r of await sorgular.reddedilenYansimalar(db, yazilanlar)) {
    // Eşlenemeyen sayımın adedi TMI'ye girmedi: ekran onu geri çevirsin diye ret olarak döner; sıfır sayım gibi beklenenler dönmez.
    if (r.sonuc === 'eslenemedi' && gizliYansimaTuru(r.sonuc, r.neden) !== null) continue;
    const makineDolu = ekler.get(r.cid)?.makineDolu;
    const tmiDurum = r.tur === 'events' && r.emirId !== null ? await tmidekiHal(db, kullanici.id, r.emirId, onbellek) : null;
    reddedilen.push({ cid: r.cid, ileti: r.neden, ...(makineDolu === undefined ? {} : { makineDolu }), ...(tmiDurum === null ? {} : { tmiDurum }) });
  }
  const uyarilar = [...ekler].flatMap(([cid, e]) => (yazilanCidler.has(cid) && typeof e.uyari === 'string' ? [{ cid, ileti: e.uyari }] : []));
  return { eklenen, reddedilen, uyarilar };
}

// Makine dolu retinden sonra kullanıcının onayı: TMI o işi durdurup kullanıcının işini orada başlatır (tek işlemde). Yazma yetkisi, kapsam ve durum
// kuralı TMI komutundadır; burada yalnız kayıt yazabilen Arkon rolü aranır. Reddedilmiş başlatma kaydının yansıması çözülmüş sayılır.
export async function makineDevralOnayla(db: Db, kullanici: Kullanici, g: MakineDevralGovdesi): Promise<void> {
  if (kayitRoluReddi('events', {}, await rolGerekli(db, kullanici)) !== null) throw yetkiYok(ILETILER.kayitRolYetmez);
  await makineDevral(db, kullanici, g.emirId, g.kullanimId);
  if (g.cid !== undefined) await sorgular.yansimaDevralindi(db, g.cid, kullanici.id, g.emirId);
  await devralmaHaliniYay(db, g.emirId, g.durdurulanEmirId);
}

// Devralma iki işin hâlini TMI'de değiştirir; istasyonun tabletleri (durdurulan işin tableti dahil) kendiliğinden eşitlensin diye hâl
// `$durum` iletisiyle yayılır. Durdurulan emir aynı istasyonda değilse yayılmaz (gövdedeki kimlik başka emrin hâlini duyurmasın).
const SUNUCU_KAYNAGI = 'tmi';
async function devralmaHaliniYay(db: Db, emirId: number, durdurulanEmirId: number | undefined): Promise<void> {
  const devralinan = await emirOzeti(db, emirId);
  if (devralinan === null) return;
  const kod = (await istasyonlar(db, { pasiflerDahil: true })).find((i) => i.id === devralinan.istasyonId)?.kod;
  if (kod === undefined) return;
  const durdurulan = durdurulanEmirId === undefined || durdurulanEmirId === emirId ? null : await emirOzeti(db, durdurulanEmirId);
  for (const ozet of [devralinan, durdurulan]) {
    if (ozet === null || ozet.istasyonId !== devralinan.istasyonId) continue;
    const calisma = ozet.durum === 'basladi' ? (await acikEmir(db, ozet.id))?.canli?.calisma ?? null : null;
    const state = tmidekiDurum(ozet.durum, calisma, 'yok');
    if (state !== null) await sorgular.iletiEkle(db, SUNUCU_KAYNAGI, { type: '$durum', machine: kod, orderNo: ozet.emirNo, state });
  }
}

export interface KayitIstegi {
  makine?: string | undefined;
  isMerkezi?: string | undefined;
  baslangic?: number | undefined;
  bitis?: number | undefined;
  emirNo?: string | undefined;
  paketId?: string | undefined;
  madde?: number | undefined;
  sinir?: number | undefined;
}

export const VARSAYILAN_KAYIT_SINIRI = 5000;
export async function kayitlar(db: Db, kullanici: Kullanici, tur: ArkonKayitTuru, f: KayitIstegi) {
  const rol = await rolGerekli(db, kullanici);
  // Matristeki `adm.audit` yalnız yöneticidedir (yetkiMatrisi); değişiklik günlüğünü başkası okumaz.
  if (tur === 'audit' && rol !== 'admin') throw yetkiYok(ILETILER.gunlukOkuma);
  const paket = paketSuzgeciVar(tur);
  const sinir = KONUMLU_KAYITLAR.has(tur) ? await kapsamSiniri(db, kullanici) : null;
  const satirlar = await sorgular.kayitlar(db, tur, {
    makine: f.makine ?? null,
    isMerkezi: f.isMerkezi ?? null,
    baslangic: f.baslangic === undefined ? null : new Date(f.baslangic),
    bitis: f.bitis === undefined ? null : new Date(f.bitis),
    emirNo: f.emirNo ?? null,
    paketId: paket ? f.paketId ?? null : null,
    madde: paket ? f.madde ?? null : null,
    sinir: f.sinir ?? VARSAYILAN_KAYIT_SINIRI,
    yasak: sinir?.yasak ?? KONUMSUZ,
    izinli: sinir?.izinli ?? null,
  });
  return satirlar.map((s) => ({ ...s.govde, at: s.zaman.getTime() }));
}

export async function eksikDosyalar(db: Db, kullanici: Kullanici, ozetler: readonly string[]): Promise<string[]> {
  await rolGerekli(db, kullanici);
  const olan = new Set(await sorgular.olanDosyalar(db, ozetler));
  return [...new Set(ozetler)].filter((o) => !olan.has(o));
}

// Yükleme parçaları KİŞİ BAŞINA şerittir (anahtar: özet + kişi + sıra): kimse başkasının aynı özetli yüklemesini engelleyemez. Tutarsız ya da
// özeti tutmayan yüklemede kişinin kendi şeridi atılır ve atma, hata cevabında bile kalıcıdır (yazilarKalir). Tamamlanan dosya özetle tekildir:
// ilk tamamlayan yazar, sonrakiler "zaten var" alır ve kendi şeridi silinir.
async function yuklemeyiReddet(db: Db, ozet: string, sahipId: number, ileti: string, alan: string): Promise<never> {
  await sorgular.yuklemeyiAt(db, ozet, sahipId);
  throw new UygulamaHatasi('DOGRULAMA', ileti, { alan, yazilarKalir: true });
}

export async function dosyaParcasi(
  db: Db, kullanici: Kullanici, ozet: string, g: { sira: number; toplam: number; veri: string },
  // Sınırlar testte küçük verilebilsin diye enjekte edilir; uç varsayılanı kullanır.
  sinir: Readonly<Record<keyof typeof DOSYA_KOTASI, number>> = DOSYA_KOTASI,
): Promise<boolean> {
  await rolGerekli(db, kullanici);
  // Kilit sırası tek yönlüdür: önce kişi (şerit ve kota), depo yalnız toplam okunurken, özet kilidi yalnız tamamlama anında. Kişi başka kişinin satırını silmez.
  await sorgular.kisiKilitle(db, kullanici.id);
  if (await sorgular.dosyaVarMi(db, ozet)) {
    await sorgular.yuklemeyiAt(db, ozet, kullanici.id);
    return true;
  }
  await sorgular.eskiParcalariSil(db);
  const parca = Buffer.from(g.veri, 'base64');
  const seritVar = (await sorgular.seritParcaSayisi(db, ozet, kullanici.id)) > 0;
  const ekleyecegi = parca.length - (seritVar ? await sorgular.parcaBoyutu(db, ozet, g.sira, kullanici.id) : 0);
  // Sınır aşılınca yeni parça açık bir hatayla (429) reddedilir; hiçbir yükleme kendiliğinden silinmez.
  const acik = await sorgular.kisiAcikYuklemeleri(db, kullanici.id);
  await sorgular.depoKilitle(db);
  const kota = yuklemeKotasiHatasi({ kisiAdet: seritVar ? 0 : acik.adet, kisiBayt: acik.bayt, depoBayt: await sorgular.depoBayti(db), yeniBayt: ekleyecegi }, sinir);
  if (kota !== null) throw cokIstek(ILETILER[kota]);
  await sorgular.parcaYaz(db, ozet, g.sira, g.toplam, parca, kullanici.id);
  const parcalar = await sorgular.parcalar(db, ozet, kullanici.id);
  if (parcalar.some((p) => p.toplam !== g.toplam)) return yuklemeyiReddet(db, ozet, kullanici.id, ILETILER.parcaUyusmuyor, 'toplam');
  if (parcalar.length < g.toplam) return false;
  const icerik = Buffer.concat(parcalar.map((p) => p.icerik));
  if (createHash('sha256').update(icerik).digest('hex') !== ozet) return yuklemeyiReddet(db, ozet, kullanici.id, ILETILER.ozetTutmuyor, 'ozet');
  // Tamamlama: aynı özeti iki kişi birden tamamlarsa özet kilidi sıraya koyar; ikincisi dosyayı hazır bulur.
  await sorgular.ozetKilitle(db, ozet);
  if (!(await sorgular.dosyaVarMi(db, ozet))) await sorgular.dosyaEkle(db, ozet, icerik, kullanici.id);
  await sorgular.yuklemeyiAt(db, ozet, kullanici.id);
  return true;
}

// Özeti bilmek okumaya yetmez: kişi dosyayı ya kendisi yüklemiştir ya da onu anan bir belgeyi okuyabilir (rol ve iş merkezi kapsamı
// belge okumasıyla aynı). Okuyamadığı dosya "yok" döner, varlığı da söylenmez. Yükleyen kuralı, belge yazılmadan önce yüklenen
// dosyanın yazana geri okunabilmesi içindir.
export async function dosya(db: Db, kullanici: Kullanici, ozet: string): Promise<IkiliCevap> {
  await rolGerekli(db, kullanici);
  const bilgi = await sorgular.dosyaBilgisi(db, ozet);
  if (bilgi === null || !(await dosyayiOkuyabilir(db, kullanici, ozet, bilgi.yukleyenId))) throw bulunamadi(ILETILER.dosyaYok);
  return { tur: 'application/octet-stream', ad: ozet, boyut: bilgi.boyut, akis: (vt) => dosyaDilimleri(vt, ozet, bilgi.boyut) };
}

async function dosyayiOkuyabilir(db: Db, kullanici: Kullanici, ozet: string, yukleyenId: number): Promise<boolean> {
  if (yukleyenId === kullanici.id) return true;
  for (const { depo, kimlik } of await sorgular.dosyayiAnanBelgeler(db, ozet)) {
    try {
      if ((await belge(db, kullanici, depo, kimlik)) !== null) return true;
    } catch (hata) {
      if (!(hata instanceof UygulamaHatasi && hata.kod === 'YETKI_YOK')) throw hata;
    }
  }
  return false;
}

// Okuma transaction'ının dışında koşar (ikili cevap). Dosya özetle adreslenir ve değişmez; okunurken silinirse akış kısa kalır ve uç
// katmanı bağlantıyı keser.
async function* dosyaDilimleri(db: Db, ozet: string, boyut: number): AsyncGenerator<Buffer> {
  for (let bas = 0; bas < boyut; bas += DOSYA_PARCASI) {
    const dilim = await sorgular.dosyaDilimi(db, ozet, bas, DOSYA_PARCASI);
    if (dilim === null) return;
    yield dilim;
  }
}

async function merkezRoluGerekli(db: Db, kullanici: Kullanici): Promise<void> {
  if (!merkezdenAlabilirMi(await rolGerekli(db, kullanici))) throw yetkiYok(ILETILER.merkezRolu);
}

// Yalnız yayındaki ve Arkon'un okuyabildiği türdeki (PDF, 3B model) belgeler listelenir; taslak ve arşiv merkezde zaten dışarıdadır.
export async function merkezBelgeleri(db: Db, kullanici: Kullanici, ara: string | null): Promise<MerkezBelgelerCevabi> {
  await merkezRoluGerekli(db, kullanici);
  const belgeler = await yayindakiBelgeler(db, ara === null ? {} : { ara });
  return {
    belgeler: belgeler.flatMap((b) => {
      const tip = merkezDosyaTipi(b.dosyaTuru);
      if (tip === null || !merkezTuruMu(b.dosyaTuru)) return [];
      return [{ id: b.id, ad: b.ad, tur: b.tur, harf: b.harf, tip, dosyaAdi: merkezDosyaAdi(b.ad, b.dosyaTuru), ozet: b.ozet }];
    }),
  };
}

// Merkezdeki yayındaki dosya Arkon'un kendi dosya deposuna girer (yerel yüklemenin vardığı yer: arkon_dosya, özetle tekil). Dosya
// merkeze geri gitmez. Aynı özet zaten varsa yeniden yazılmaz; paketin dosya kaydını ekran bu cevapla kurar.
export async function merkezdenDosyaEkle(db: Db, kullanici: Kullanici, belgeId: number): Promise<MerkezEkleCevabi> {
  await merkezRoluGerekli(db, kullanici);
  const kaynak = await yayindakiBelgeDosyasi(db, belgeId);
  if (kaynak === null) throw bulunamadi(ILETILER.merkezYok);
  const tip = merkezDosyaTipi(kaynak.dosyaTuru);
  if (tip === null || !merkezTuruMu(kaynak.dosyaTuru)) throw gecersiz(ILETILER.merkezTur);
  if (kaynak.dosya.boyut > AZAMI_DOSYA) throw gecersiz(ILETILER.merkezBuyuk);
  const parcalar: Buffer[] = [];
  for await (const parca of kaynak.dosya.akis(db)) parcalar.push(parca);
  const icerik = Buffer.concat(parcalar);
  if (createHash('sha256').update(icerik).digest('hex') !== kaynak.ozet) throw gecersiz(ILETILER.merkezOzet);
  // Kilit sırası parça yüklemesiyle aynı: depo, sonra özet.
  await sorgular.depoKilitle(db);
  await sorgular.ozetKilitle(db, kaynak.ozet);
  if (!(await sorgular.dosyaVarMi(db, kaynak.ozet))) {
    const kota = yuklemeKotasiHatasi({ kisiAdet: 0, kisiBayt: 0, depoBayt: await sorgular.depoBayti(db), yeniBayt: icerik.length });
    if (kota === 'kotaDepo') throw cokIstek(ILETILER.kotaDepo);
    await sorgular.dosyaEkle(db, kaynak.ozet, icerik, kullanici.id);
  }
  return {
    ozet: kaynak.ozet,
    boyut: icerik.length,
    kayit: { kind: tip, name: merkezDosyaAdi(kaynak.ad, kaynak.dosyaTuru), merkez: belgeId, merkezOzet: kaynak.ozet },
  };
}

// Pakette kayıtlı merkez dosyalarının merkezdeki yayındaki özetle karşılaştırması ("Yeni revizyon var", terminalde eski revizyon rozeti). Salt okuma.
export async function merkezKontrol(
  db: Db, kullanici: Kullanici, dosyalar: readonly { belgeId: number; ozet: string }[],
): Promise<MerkezKontrolCevabi> {
  if (!merkezDurumunuOkuyabilirMi(await rolGerekli(db, kullanici))) throw yetkiYok(ILETILER.okumaRolu);
  const yayinda = new Map<number, string | null>();
  for (const { belgeId } of dosyalar) {
    if (!yayinda.has(belgeId)) yayinda.set(belgeId, (await yayindakiBelgeDosyasi(db, belgeId))?.ozet ?? null);
  }
  return {
    durumlar: dosyalar.map(({ belgeId, ozet }) => {
      const guncel = yayinda.get(belgeId) ?? null;
      return { belgeId, durum: merkezDurumu(ozet, guncel), ozet: guncel };
    }),
  };
}

// Kullanıcı kararı 118 a: ileti yoklaması (cihaz başına 2 sn'de bir) Arkon rolünü ve kapsamın tabanını kişi başına kısa süre önbellekten
// okur; yazma uçları her istekte denetler. Oturumun işlemleri değişince önbellek geçmez. Rolü olmayan kişi önbelleğe girmez. Kapsam tabanı
// yalnız yeni ileti gelince okunur: boş yoklama tesise dokunmaz.
interface YoklamaGirisi { temel?: KapsamTemeli | null }
const yoklamaDenetimleri = new Map<number, YoklamaDenetimi<YoklamaGirisi>>();
async function yoklamaDenetimi(db: Db, kullanici: Kullanici): Promise<YoklamaGirisi> {
  const simdi = Date.now();
  const imza = islemImzasi(kullanici.islemler);
  for (const [kisi, d] of yoklamaDenetimleri) if (!yoklamaDenetimiGecerli(d, simdi, d.imza)) yoklamaDenetimleri.delete(kisi);
  const onceki = yoklamaDenetimleri.get(kullanici.id);
  if (onceki !== undefined && yoklamaDenetimiGecerli(onceki, simdi, imza)) return onceki.deger;
  await rolGerekli(db, kullanici);
  const deger: YoklamaGirisi = {};
  yoklamaDenetimleri.set(kullanici.id, { an: simdi, imza, deger });
  return deger;
}

export async function iletiler(db: Db, kullanici: Kullanici, son: number | undefined, kaynak: string | undefined): Promise<IletilerCevabi> {
  const giris = await yoklamaDenetimi(db, kullanici);
  const aralik = await sorgular.iletiAraligi(db);
  const tavan = iletiBasi(aralik);
  // İlk okumada geçmiş iletiler verilmez: cihaz bundan sonrasını dinler.
  if (son === undefined || son > tavan) return { son: tavan, iletiler: [] };
  if (iletiKacirildi(son, aralik)) return { son: tavan, iletiler: [ILETI_YENIDEN_YUKLE] };
  const satirlar = await sorgular.iletiler(db, son, tavan, kaynak ?? null);
  if (satirlar.length === 0) return { son: tavan, iletiler: [] };
  const yarim = satirlar.length === sorgular.AZAMI_ILETI;
  // Kısıtlı kişi yalnız kapsamındaki ve kod taşımayan iletileri alır (kayıt listesinin kuralı).
  if (giris.temel === undefined) giris.temel = await kapsamTemeli(db, kullanici.id);
  const sinir = await kapsamSiniri(db, kullanici, giris.temel);
  let gorunen = satirlar;
  if (sinir !== null) {
    const konumlar = satirlar.map((s) => iletiKonumu(s.govde));
    await sinir.paketleriAnanlariOnYukle(konumlar.flatMap((k) => k.paket));
    gorunen = [];
    for (const [i, s] of satirlar.entries()) if (!(await sinir.iletiDisinda(konumlar[i]!))) gorunen.push(s);
  }
  return { son: yarim ? (satirlar.at(-1)?.id ?? tavan) : tavan, iletiler: gorunen.map((s) => s.govde) };
}

// Kişi başına ileti hızı süreç belleğinde tutulur (tek sunucu; yeniden başlatma sayacı sıfırlar). Reddedilen istek de sayılır.
const iletiZamanlari = new Map<number, number[]>();
function iletiHiziniDenetle(kisiId: number): void {
  const simdi = Date.now();
  const son = (iletiZamanlari.get(kisiId) ?? []).filter((t) => simdi - t < ILETI_HIZI.pencereMs);
  const asildi = hizSiniriAsildi(son, simdi);
  son.push(simdi);
  iletiZamanlari.set(kisiId, son);
  if (asildi) throw cokIstek(ILETILER.iletiHizi);
}

export async function iletiGonder(db: Db, kullanici: Kullanici, ileti: Record<string, unknown>, kaynak: string): Promise<void> {
  const rol = await rolGerekli(db, kullanici);
  iletiHiziniDenetle(kullanici.id);
  if (sunucuIletisiMi(ileti)) throw dogrulama(ILETILER.sunucuIletisi, 'ileti.type');
  const ret = iletiReddi(ileti, rol);
  if (ret === 'iletiRolu') throw yetkiYok(ILETILER.iletiRolu);
  if (ret !== null) throw dogrulama(ILETILER[ret], 'ileti.type');
  const sinir = await kapsamSiniri(db, kullanici);
  if (sinir !== null && (await sinir.iletiDisinda(iletiKonumu(ileti)))) throw kapsamDisi();
  await sorgular.iletiEkle(db, kaynak, ileti);
}

// TMI'ye yazılamayan Arkon kayıtları (#243). Yetki uçtadır (arkon.yansima-oku); Arkon rolü aranmaz. Veri kapsamı kayıt listesinin kuralıdır
// (Arkon kaydının iş merkezi, istasyon ya da makine kodu); kayıt gövdesi, kişi ve iç hata özeti dönmez.
export async function yansimaListesi(
  db: Db, kullanici: Kullanici, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; sonuc?: ListeSonucu | undefined; gizlenenler?: boolean | undefined },
): Promise<YansimalarCevabi> {
  const sinir = await kapsamSiniri(db, kullanici);
  const suzgec: sorgular.YansimaSuzgeci = {
    sonuc: sorgu.sonuc ?? null, yasak: sinir?.yasak ?? KONUMSUZ, izinli: sinir?.izinli ?? null,
    gizli: GIZLI_YANSIMA_TURLERI.flatMap((t) => t.kurallar.map((k) => ({ kod: t.kod, ...k }))), gizlileriGoster: sorgu.gizlenenler ?? false,
  };
  const adlar = new Map(GIZLI_YANSIMA_TURLERI.map((t) => [t.kod, t.ad]));
  const sayilar = await sorgular.gizliYansimaSayilari(db, suzgec);
  const liste = await sayfaliListe(sorgu, {
    say: () => sorgular.yansimaSay(db, suzgec),
    satirlar: async (dilim) => (await sorgular.yansimalar(db, suzgec, dilim)).map((s) => ({
      id: s.id, sonuc: s.sonuc as ListeSonucu, neden: yansimaNedeni(s.sonuc, s.neden, s.son_hata), deneme: s.deneme, zaman: s.zaman, sonDeneme: s.son_deneme,
      emirId: s.emir_id,
      kayit: { tur: s.tur as ArkonKayitTuru, cid: s.cid, zaman: s.kayit_zamani, paketId: s.paket_id, emirNo: s.emir_no },
      gizliTur: s.gizli_tur === null ? null : adlar.get(s.gizli_tur) ?? s.gizli_tur,
    })),
  });
  return { ...liste, gizlenenler: GIZLI_YANSIMA_TURLERI.map((t) => ({ kod: t.kod, ad: t.ad, adet: sayilar.get(t.kod) ?? 0 })) };
}

// "hatali" yansımayı yeniden kuyruğa alır ve aynı istekte emrin bekleyenlerini işler (#243). Yetki uçtadır (arkon.yansima-yeniden); Arkon rolü aranmaz.
// Aynı sayım iki kez yazılamaz: TMI komutu yansıma sonucuyla aynı veritabanı işleminde, kayıt noktasında yürür; "hatali" olan denemenin TMI yazımı
// kayıt noktasıyla geri alınmıştır (yazıldı ama cevap alınamadı durumu oluşmaz). Satır FOR UPDATE ile kilitlenir ve yalnız "hatali" iken alınır:
// eşzamanlı ikinci istek ilkinin sonucunu görür ve 409 alır. İşleme emir kilidi altındadır (kayıt isteklerindeki işleyiciyle aynı).
// Komutu yapan kişi kayıt anındaki kişidir; yeniden kuyruğa alan kişi uç denetiminde kalır.
export async function yansimaYenidenDene(db: Db, kullanici: Kullanici, id: number, gunluk: Gunluk): Promise<YansimaYenidenCevabi> {
  const sinir = await kapsamSiniri(db, kullanici);
  const satir = await sorgular.yansimaKilitle(db, id, sinir?.yasak ?? KONUMSUZ, sinir?.izinli ?? null);
  if (satir === null) throw bulunamadi('Yansıma bulunamadı.');
  const sonraki = satir.tur === 'events' && satir.emir_id !== null && (await sorgular.sonrakiDurumYazildi(db, satir.emir_id, satir.kayit_id));
  const ret = yenidenDenemeReddi(satir.sonuc, satir.tur, sonraki);
  if (ret !== null) throw cakisma(ret);
  if (satir.emir_id === null) throw cakisma('Yansımanın emri yok.');
  const kilitli = await emirKilidiniDene(db, satir.emir_id, KILIT_BEKLEME_MS, gunluk);
  if (!(await sorgular.yansimaYenidenKuyruga(db, id))) throw cakisma(YENIDEN_YALNIZ_HATALI);
  // Kilit alınamazsa satır bekliyor kalır; kilidi tutan ya da sonraki kayıt isteği işler.
  if (kilitli) await korumaliIsle(db, satir.emir_id);
  const yeni = await sorgular.yansimaSonucu(db, id);
  if (yeni === null) throw bulunamadi('Yansıma bulunamadı.');
  return { sonuc: yeni.sonuc as YansimaYenidenCevabi['sonuc'], neden: yansimaNedeni(yeni.sonuc, yeni.neden, yeni.son_hata) };
}

// Rol panosu (kart #489): sayı, kartı gösteren işlem ve depoyu okuyan Arkon rolüyle verilir; Arkon listesiyle aynı okuma (iş emri taslakları ve
// kişinin kapsamı dahil). Atölye ölçeğinde liste küçüktür; ayrı sayım sorgusu yazılmadı.
export async function arkonOzeti(db: Db, kullanici: Kullanici): Promise<ArkonOzetiCevabi> {
  const rol = await rolGerekli(db, kullanici);
  const say = async (islem: Islem, depo: ArkonDeposu, uyar: (govde: unknown) => boolean): Promise<number | null> =>
    islemVarMi(kullanici, islem) && okuyabilirMi(depo, rol) ? (await belgeler(db, kullanici, depo)).filter((b) => uyar(b.govde)).length : null;
  return {
    hazirlikBekleyen: await say('arkon.hazirlik', 'pkgs', hazirlikBekliyorMu),
    kaliteBekleyen: await say('arkon.kalite', 'requests', kaliteBekliyorMu),
    bakimAcik: await say('arkon.bakim', 'maint', bakimAcikMi),
  };
}

// Okuma yetkisi uçtadır; burada yalnız veri kapsamı uygulanır: kişi yalnız izinli iş merkezlerinin olaylarını görür.
export async function sonOlaylar(db: Db, kullanici: Kullanici, sonraId: number | null, sayi: number): Promise<SonOlaylarCevabi> {
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const satirlar = await sorgular.sonOlaylar(db, null, sonraId, sayi, kapsamSuzgeci(kapsam));
  const adlar = await kisiAdlari(db, satirlar.map((s) => s.kisi_id));
  return {
    olaylar: satirlar.map((s) => ({
      id: s.id, tur: s.tur as SonOlaylarCevabi['olaylar'][number]['tur'], zaman: s.zaman.toISOString(), istasyonKodu: s.istasyon_kodu, istasyonId: s.istasyon_id, emirNo: s.emir_no,
      kisi: { id: s.kisi_id, ad: adlar.get(s.kisi_id) ?? null },
    })),
  };
}

/* ---------------- Üretim anomalisi (kart #1149) ---------------- */

export interface AnomaliEsikleri {
  // AR-AN-1: bu kadar net aktif dakika giriş yoksa işaret; null: kural kapalı.
  girisYokDk: number | null;
  // AR-AN-2: plandaki adedin bu yüzdesi kadar eksik üretim hoşgörülür; null: kural kapalı.
  adetToleransYuzde: number | null;
}

// Eşikler Ayarlar'dadır (paylasilan/ayarlar/arkon.ts); boş eşik kuralı kapatır.
export const anomaliEsikleri = async (db: Db): Promise<AnomaliEsikleri> => ({
  girisYokDk: await sistemAyariOku(db, 'arkon.anomali-giris-yok-dk'),
  adetToleransYuzde: await sistemAyariOku(db, 'arkon.anomali-adet-tolerans-yuzde'),
});

const GUN_MS = 24 * 3_600_000;
const yuvarla = (x: number): number => Math.round(x * 100) / 100;
const yuvarlaVeyaBos = (x: number | null): number | null => (x === null ? null : yuvarla(x));
const kesinToplam = (parcalar: readonly (number | null)[]): number | null => kesinBeklenen(beklenenTopla(parcalar));
const aralikMs = (a: { baslangic: string; bitis: string }): NetAralik => ({ bas: Date.parse(a.baslangic), bit: Date.parse(a.bitis) });

type GunKaynagi = { tur: 'makine' | 'kisi'; id: number };
interface GunTakvimi { araliklar: NetAralik[]; bitis: number | null }

// Terminal kural 5/5 (kullanıcı kararı): anomali ve emek verimi gün kaydında gece yarısını geçen vardiya başladığı güne yazılır. Kaynağın o
// gün başlayan vardiyaları Vardiya'dan okunur; bir hesap boyunca aynı okuma tekrarlanmaz. Çok gün ya da çok kaynak okuyan, önce `onYukle` ile
// tek turda alır.
function gunTakvimleri(db: Db) {
  const okunan = new Map<string, GunTakvimi | null>();
  const cevir = (t: { araliklar: { baslangic: string; bitis: string }[]; bitis: string | null }): GunTakvimi =>
    ({ araliklar: t.araliklar.map(aralikMs), bitis: t.bitis === null ? null : Date.parse(t.bitis) });
  const oku = async (k: GunKaynagi, tarih: string): Promise<GunTakvimi | null> => {
    const anahtar = `${k.tur}:${k.id}:${tarih}`;
    if (!okunan.has(anahtar)) {
      const t = await basladigiGunTakvimi(db, k, tarih);
      okunan.set(anahtar, t === null ? null : cevir(t));
    }
    return okunan.get(anahtar) ?? null;
  };
  return {
    onYukle: async (kaynaklar: readonly GunKaynagi[], bas: string, bit: string): Promise<void> => {
      if (kaynaklar.length === 0 || bit < bas) return;
      const toplu = await basladigiGunTakvimleri(db, kaynaklar, { baslangic: bas, bitis: bit });
      for (const k of kaynaklar) {
        const gunler = toplu.get(`${k.tur}:${k.id}`);
        for (let t = bas; t <= bit; t = gunEkle(t, 1)) {
          const g = gunler?.get(t);
          okunan.set(`${k.tur}:${k.id}:${t}`, gunler === null || gunler === undefined ? null : g === undefined ? { araliklar: [], bitis: null } : cevir(g));
        }
      }
    },
    araliklar: async (k: GunKaynagi, tarih: string): Promise<NetAralik[] | null> => (await oku(k, tarih))?.araliklar ?? null,
    // Kaynakların o günkü kaydının bittiği an: o gün başlayan en geç vardiya bitişi, yoksa ertesi gün başı.
    sinir: async (kaynaklar: readonly GunKaynagi[], tarih: string): Promise<number> => {
      const bitisler: (number | null)[] = [];
      for (const k of kaynaklar) bitisler.push((await oku(k, tarih))?.bitis ?? null);
      return gunSiniri(tesisGunBasi(gunEkle(tarih, 1)), bitisler);
    },
  };
}
type GunTakvimleri = ReturnType<typeof gunTakvimleri>;

// Gün sınırı tesis geneli tektir (istasyon sayımı kaynaklara bölünmez): canlı plandaki kaynakların gece vardiyası bütün günü uzatır.
const planKaynaklari = (isler: readonly { kaynak: { tur: string; id: number } | null }[]): GunKaynagi[] => [
  ...new Map(isler.flatMap((i) => (i.kaynak !== null && (i.kaynak.tur === 'makine' || i.kaynak.tur === 'kisi')
    ? [[`${i.kaynak.tur}:${i.kaynak.id}`, { tur: i.kaynak.tur, id: i.kaynak.id } as GunKaynagi] as const] : []))).values(),
];

async function etkinTesisGunu(gt: GunTakvimleri, kaynaklar: readonly GunKaynagi[], simdi: number): Promise<string> {
  const takvimGunu = tesisGunu(simdi);
  return etkinGun(takvimGunu, simdi, await gt.sinir(kaynaklar, gunEkle(takvimGunu, -1)));
}

interface IsEmriAnomalisi {
  isEmriId: number;
  kaynak: { tur: 'makine' | 'kisi'; id: number };
  istasyonId: number;
  beklenen: number | null;
  // Planlı pencerenin net aktif aralıkları (AR-AN-1); null: vardiya bilinmiyor. Kayıttan gelen (biten) iş emrinde boştur.
  planli: NetAralik[] | null;
  // Günün net sağlamı (AR-AN-10); sayımı yoksa 0.
  uretilen: number;
}

interface AnomaliHesabi {
  cevap: AnomaliCevabi & { kisiler: AnomaliKisiSatiri[] };
  isEmirleri: IsEmriAnomalisi[];
  kisiIstasyonlari: Map<number, number | null>;
  kisiOlcumleri: Map<number, { standartSn: number | null; calisilanSn: number | null }>;
  istasyonIsaretleri: Map<number, boolean | null>;
  // İstasyonun plan dışı dahil bütün sayımı; gün kaydına yazılır, plan dışı istatistikte iş emri satırlarından çıkarılır.
  istasyonToplamlari: Map<number, number>;
}

// Hesap Arkon'dadır (ADR 0006: Arkon plan, rota, vardiya, istasyonlar, uretim-emirleri ve ik'yi `disari.ts` ile okur). Beklenen adet, canlı plandaki her iş
// emri için gün başından şu ana kadarki net aktif sürenin yerleşimle kesişimi / etkin birim süre x istasyon verimidir. Gün içinde biten iş emri canlı
// listeden düşer; o güne kadar kaydedilen beklenen adedi gün kaydından gelir (kart #1306). İstasyon ve kişinin üretileni günün net sayımıdır
// (`aralikAdetleri`; kaydı olmayan kimlik için 0, çünkü gün boyu giriş yoktur). Makinenin sayımı, sayım anında emrin o makinedeki açık kullanımından bulunur.
// İstasyon verisi verilen kapsamla süzülür.
// `dar` (Operatör Özetim): yalnız bu kişilerin beklenen ve üretilen adedi gerekir; kişilerin kendi işleri ve tezgahlarındaki işler dışındakine
// bakılmaz, makine, istasyon, performans ve emek verimi satırları hesaplanmaz (boş kalır). Verilen kişilerin `kisiler` satırları dar olmayan
// hesapla aynıdır; gün sınırı yine bütün canlı plandaki kaynaklara göre bulunur.
async function anomaliHesapla(
  db: Db, kapsam: Kapsam, esikler: AnomaliEsikleri, simdi: number, gun?: { tarih: string; gt: GunTakvimleri }, dar?: ReadonlySet<number>,
): Promise<AnomaliHesabi> {
  const gt = gun?.gt ?? gunTakvimleri(db);
  const isEmirleri = (await planlanacakIsEmirleri(db)).filter((i) => i.kaynak !== null);
  const kaynaklar = planKaynaklari(isEmirleri);
  if (gun === undefined) { const t = tesisGunu(simdi); await gt.onYukle(kaynaklar, gunEkle(t, -2), t); }
  const tarih = gun?.tarih ?? await etkinTesisGunu(gt, kaynaklar, simdi);
  const gunBasi = tesisGunBasi(tarih);
  const istasyonById = new Map((await istasyonlar(db, { pasiflerDahil: false })).filter((i) => kapsamdaMi(kapsam, i.isMerkeziId)).map((i) => [i.id, i]));
  const makineById = new Map((await aktifMakineler(db)).map((m) => [m.id, m]));
  const kisiIstasyonu = new Map((await istasyonKisileri(db)).map((k) => [k.kisiId, k.istasyonId]));
  const verim = new Map((await planAyarlari(db)).map((a) => [a.istasyonId, Number(a.verimYuzde)]));

  const atamalar = await makineKisiAtamalari(db, { tarih });
  const darMakineler = dar === undefined ? null : new Set(atamalar.filter((a) => dar.has(a.kisiId)).map((a) => a.makineId));
  const kaynakIlgili = (tur: string, id: number): boolean => darMakineler === null || dar === undefined || (tur === 'kisi' ? dar.has(id) : tur === 'makine' && darMakineler.has(id));
  const ilgiliIsler = darMakineler === null ? isEmirleri : isEmirleri.filter((i) => i.kaynak !== null && kaynakIlgili(i.kaynak.tur, i.kaynak.id));

  const canli = new Map((await canliSira(db, ilgiliIsler.map((i) => i.id))).yerlesimler.map((y) => [y.isEmriId, y]));

  const araliklar = (tur: 'makine' | 'kisi', id: number): Promise<NetAralik[] | null> => gt.araliklar({ tur, id }, tarih);
  // Etkin süreler bütün işler için tek turda okunur: iş başına okuma istasyon sayısıyla büyüyordu (yük raporu).
  const sureAnahtari = (revizyonId: number, makineId: number | null): string => `${revizyonId}:${makineId ?? ''}`;
  const sureIstekleri = new Map<string, { revizyonId: number; makineId: number | null }>();
  for (const i of ilgiliIsler) {
    if (i.kaynak === null || !canli.has(i.id)) continue;
    const makineId = i.kaynak.tur === 'makine' ? i.kaynak.id : null;
    sureIstekleri.set(sureAnahtari(i.kaynakRotaRevizyonId, makineId), { revizyonId: i.kaynakRotaRevizyonId, makineId });
  }
  const okunanSureler = await adimEtkinSureleriToplu(db, [...sureIstekleri.values()]);
  const sureler = new Map([...sureIstekleri.keys()].map((k, n) => [k, okunanSureler[n]]));
  const birimSure = (i: (typeof isEmirleri)[number], makineId: number | null): number | null =>
    sureler.get(sureAnahtari(i.kaynakRotaRevizyonId, makineId))?.get(i.opNo)?.birimSureDk ?? (i.birimSureDk === null ? null : Number(i.birimSureDk));

  // Sayım penceresi dün başlayan son vardiyanın bitişinden bugün başlayan son vardiyanın bitişinedir (gece vardiyası yoksa takvim günü;
  // şimdiye kadar yazılmış her sayım dahil); kaydı olmayan kimlik haritada yoktur: o gün giriş yok = 0.
  const gunSonu = new Date(await gt.sinir(kaynaklar, tarih)).toISOString();
  const gunBasiMetni = new Date(await gt.sinir(kaynaklar, gunEkle(tarih, -1))).toISOString();
  // AR-AN-9: tavan kalan adettir; önceki günlerin sağlamı iş emri sayımından.
  const oncekiSaglam = await aralikAdetleri(db, 'is_emri', ilgiliIsler.map((i) => i.id), '-infinity', gunBasiMetni);

  const hesaplanan: Omit<IsEmriAnomalisi, 'uretilen'>[] = [];
  let atlanan = 0;
  for (const i of ilgiliIsler) {
    const y = canli.get(i.id);
    if (y === undefined || i.kaynak === null) continue;
    const kaynak = i.kaynak;
    const makine = kaynak.tur === 'makine' ? makineById.get(kaynak.id) : undefined;
    // Kişiye yerleşen işte istasyon önce iş emrinindir; kişinin kayıtlı istasyonu yalnız iş emrinde istasyon yoksa kullanılır (kart #1306).
    const istasyonId = kaynak.tur === 'makine' ? makine?.istasyonId ?? null : (await isEmriOzeti(db, i.id))?.istasyonId ?? kisiIstasyonu.get(kaynak.id) ?? null;
    if (istasyonId === null) { atlanan += 1; continue; }
    if (!istasyonById.has(istasyonId)) continue;
    const net = await araliklar(kaynak.tur, kaynak.id);
    const sure = birimSure(i, kaynak.tur === 'makine' ? kaynak.id : null);
    hesaplanan.push({
      isEmriId: i.id, kaynak, istasyonId,
      beklenen: net === null ? null : isEmriBeklenenAdet({
        adet: kalanAdet(i.adimAdedi ?? i.adet, oncekiSaglam.get(i.id)?.saglam ?? 0), birimSureDk: sure, verimYuzde: verim.get(istasyonId) ?? 100,
        baslangic: y.baslangic.getTime(), bitis: y.bitis.getTime(), araliklar: net, gunBasi, simdi,
      }),
      planli: net === null ? null : araliklariKes(net, Math.max(y.baslangic.getTime(), gunBasi), Math.min(y.bitis.getTime(), simdi)),
    });
  }
  // Gün kaydındaki iş emri bugünkü hesapta yoksa (gün içinde bitti ya da plandan çıktı) kaydedilen beklenen kalır.
  const kayitli = (await sorgular.anomaliSatirlari(db, tarih, tarih, ['is_emri']))
    .filter((r) => r.kaynakTur !== null && r.kaynakId !== null && r.istasyonId !== null && istasyonById.has(r.istasyonId) && kaynakIlgili(r.kaynakTur, r.kaynakId));
  const kayitliById = new Map(kayitli.map((r) => [r.kimlik, r]));
  const birlesik = isEmriBeklenenBirlestir(new Map(hesaplanan.map((h) => [h.isEmriId, h.beklenen])), new Map(kayitli.map((r) => [r.kimlik, r.beklenen])));
  const isler: Omit<IsEmriAnomalisi, 'uretilen'>[] = [...hesaplanan];
  for (const [isEmriId, b] of birlesik) {
    const r = kayitliById.get(isEmriId);
    if (!b.kayittan || r === undefined || r.kaynakTur === null || r.kaynakId === null || r.istasyonId === null) continue;
    isler.push({ isEmriId, kaynak: { tur: r.kaynakTur, id: r.kaynakId }, istasyonId: r.istasyonId, beklenen: b.beklenen, planli: [] });
  }
  const isEmriUretimi = await aralikAdetleri(db, 'is_emri', isler.map((s) => s.isEmriId), gunBasiMetni, gunSonu);
  const bugunBitenler = new Set((await bitenIsEmirleri(db, gunBasiMetni, gunSonu, [...istasyonById.keys()])).map((b) => b.isEmriId));
  const hesaplananlar = new Set(hesaplanan.map((h) => h.isEmriId));
  const tumIsler: IsEmriAnomalisi[] = isler.map((s) => {
    const uretilen = isEmriUretimi.get(s.isEmriId)?.saglam ?? 0;
    const kayittan = !hesaplananlar.has(s.isEmriId);
    return { ...s, uretilen, ...(kayittan && bugunBitenler.has(s.isEmriId) ? { beklenen: bitenIsBeklenen(s.beklenen, uretilen) } : {}) };
  });

  const makineIsleri = new Map<number, IsEmriAnomalisi[]>();
  const kisiIsleri = new Map<number, IsEmriAnomalisi[]>();
  const istasyonIsleri = new Map<number, IsEmriAnomalisi[]>();
  const kisiKaynakIstasyonu = new Map<number, number>();
  for (const s of tumIsler) {
    const hedef = s.kaynak.tur === 'makine' ? makineIsleri : kisiIsleri;
    hedef.set(s.kaynak.id, [...(hedef.get(s.kaynak.id) ?? []), s]);
    istasyonIsleri.set(s.istasyonId, [...(istasyonIsleri.get(s.istasyonId) ?? []), s]);
    if (s.kaynak.tur === 'kisi') kisiKaynakIstasyonu.set(s.kaynak.id, s.istasyonId);
  }
  // Makinenin istasyonu: canlı makine kaydı, yoksa (pasif ya da kaldırılmış) iş emrinin kaydedilen istasyonu.
  const makineIstasyonu = (m: number): number | null => makineById.get(m)?.istasyonId ?? makineIsleri.get(m)?.[0]?.istasyonId ?? null;

  const izinli = new Set(await izinliKisiler(db, tarih));
  const makinedekiler = new Map<number, number[]>();
  const makineYuzdesi = new Map<number, number>();
  const kisininMakineleri = new Map<number, { makineId: number; yuzde: number }[]>();
  for (const a of atamalar) {
    makinedekiler.set(a.makineId, [...(makinedekiler.get(a.makineId) ?? []), a.kisiId]);
    makineYuzdesi.set(a.makineId, (makineYuzdesi.get(a.makineId) ?? 0) + Number(a.yuzde));
    if (makineIsleri.has(a.makineId)) kisininMakineleri.set(a.kisiId, [...(kisininMakineleri.get(a.kisiId) ?? []), { makineId: a.makineId, yuzde: Number(a.yuzde) }]);
  }
  const toplamlar = (isler: readonly IsEmriAnomalisi[]) => ({ beklenen: kesinToplam(isler.map((s) => s.beklenen)) });

  const makineHamlari = new Map([...makineIsleri].map(([id, isler]) => [id, toplamlar(isler)]));
  const kisiHamlari = new Map([...kisiIsleri].map(([id, isler]) => [id, toplamlar(isler)]));
  const makineUretimi = dar === undefined ? await aralikAdetleri(db, 'makine', [...makineHamlari.keys()], gunBasiMetni, gunSonu) : new Map<number, { saglam: number; hurda: number }>();
  const makineler: AnomaliMakineSatiri[] = [...(dar === undefined ? makineHamlari : [])].flatMap(([makineId, ham]) => {
    const makine = makineById.get(makineId);
    const istasyonId = makineIstasyonu(makineId);
    if (istasyonId === null) return [];
    const k = kaynakKarsilastir({
      beklenen: ham.beklenen, uretilen: makineUretimi.get(makineId)?.saglam ?? 0,
      izinli: makineIzinliMi(makinedekiler.get(makineId) ?? [], izinli), toleransYuzde: esikler.adetToleransYuzde,
    });
    return [{
      makineId, kod: makine?.kod ?? `#${makineId}`, ad: makine?.ad ?? '', istasyonId, beklenen: yuvarlaVeyaBos(k.beklenen), uretilen: k.uretilen,
      hurda: makineUretimi.get(makineId)?.hurda ?? 0, fark: yuvarlaVeyaBos(k.fark), durum: k.durum,
    }];
  }).sort((a, b) => a.kod.localeCompare(b.kod));

  const kisiKimlikleri = new Set([...kisiHamlari.keys(), ...kisininMakineleri.keys()]);
  const adlar = dar === undefined ? await kisiAdlari(db, [...kisiKimlikleri]) : new Map<number, string>();
  const kisiUretimi = await aralikAdetleri(db, 'kisi', [...kisiKimlikleri], gunBasiMetni, gunSonu);
  const standart = dar === undefined ? await standartSureler(db, [...kisiKimlikleri], gunBasiMetni, gunSonu) : new Map<number, { standartSaniye: number }>();
  const katilim = dar === undefined ? await katilimSureleri(db, [...kisiKimlikleri], gunBasiMetni, gunSonu) : new Map<number, number>();
  const kisiOlcumleri = new Map([...kisiKimlikleri].map((k) => [k, {
    // Sağlam girişi yoksa standart süre sıfırdır (çalışıp üretmeyen kişi); çalışma kaydı yoksa çalışılan süre bilinmez.
    standartSn: katilim.has(k) ? standart.get(k)?.standartSaniye ?? 0 : null,
    calisilanSn: katilim.get(k) ?? null,
  }]));
  // Planı olmayan ama sayımı olan istasyon da satır alır: bütün sayımı plan dışıdır (AR-AN-10).
  const istasyonUretimi = dar === undefined ? await aralikAdetleri(db, 'istasyon', [...istasyonById.keys()], gunBasiMetni, gunSonu) : new Map<number, { saglam: number; hurda: number }>();
  const satirIstasyonlari = dar === undefined ? [...new Set([...istasyonIsleri.keys(), ...istasyonUretimi.keys()])] : [];
  const sonGirisMetinleri = dar === undefined ? await sonGirisler(db, 'istasyon', satirIstasyonlari) : new Map<number, string>();
  const emek = dar === undefined ? await emekVerimleri(db, [...kisiKimlikleri], tarih, tarih, simdi, gt) : new Map<number, EmekVerimi>();
  const kisiler: AnomaliKisiSatiri[] = [...kisiKimlikleri].map((kisiId) => {
    const makineSirasi = kisininMakineleri.get(kisiId) ?? [];
    const kendi = kisiHamlari.get(kisiId);
    const beklenen = kisiBeklenen(
      makineSirasi.map((m) => ({ beklenen: makineHamlari.get(m.makineId)?.beklenen ?? null, yuzde: m.yuzde, makineToplamYuzde: makineYuzdesi.get(m.makineId) ?? 0 })),
      kendi ? [kendi.beklenen] : [],
    );
    const uretilen = kisiUretimi.get(kisiId)?.saglam ?? 0;
    const k = kaynakKarsilastir({ beklenen, uretilen, izinli: izinli.has(kisiId), toleransYuzde: esikler.adetToleransYuzde });
    const olcum = kisiOlcumleri.get(kisiId);
    return {
      kisiId, ad: adlar.get(kisiId) ?? `Kişi ${kisiId}`, beklenen: yuvarlaVeyaBos(k.beklenen), uretilen: k.uretilen, hurda: kisiUretimi.get(kisiId)?.hurda ?? 0,
      fark: yuvarlaVeyaBos(k.fark), durum: k.durum, performans: yuvarlaVeyaBos(performansOrani(olcum?.standartSn ?? null, olcum?.calisilanSn ?? null)),
      emekVerimi: yuvarlaVeyaBos(emek.get(kisiId)?.oran ?? null),
    };
  }).sort((a, b) => a.ad.localeCompare(b.ad));

  // İstasyon beklenenine izinli kişi girmez: atananların hepsi izinli makine ve izinli kişinin kendi yerleşimleri düşer; üretilen olduğu gibi kalır.
  const istasyonlarSatiri: AnomaliIstasyonSatiri[] = [];
  const istasyonIsaretleri = new Map<number, boolean | null>();
  const istasyonToplamlari = new Map<number, number>();
  const kapasiteKaynaklariHaritasi = await kapasiteKaynaklari(db, [...satirIstasyonlari]);
  for (const istasyonId of satirIstasyonlari) {
    const istasyon = istasyonById.get(istasyonId);
    if (istasyon === undefined) continue;
    const haricMakineler = new Set([...makineIsleri.keys()].filter((m) => makineIstasyonu(m) === istasyonId && makineIzinliMi(makinedekiler.get(m) ?? [], izinli)));
    const haricKisiler = new Set([...kisiIsleri.keys()].filter((k) => kisiKaynakIstasyonu.get(k) === istasyonId && izinli.has(k)));
    const katkilar = [
      ...[...makineIsleri].filter(([m]) => !haricMakineler.has(m)).flatMap(([, s]) => s).filter((s) => s.istasyonId === istasyonId),
      ...[...kisiIsleri].filter(([k]) => !haricKisiler.has(k)).flatMap(([, s]) => s).filter((s) => s.istasyonId === istasyonId),
    ];
    const beklenen = kesinToplam(katkilar.map((x) => x.beklenen));
    // AR-AN-10: üretilen plandaki iş emirlerinin (izinli kaynaktakiler dahil) sayımıdır; geri kalan sayım plan dışıdır.
    const istasyonToplami = istasyonUretimi.get(istasyonId)?.saglam ?? 0;
    istasyonToplamlari.set(istasyonId, istasyonToplami);
    const { uretilen, planDisi } = planliUretim(istasyonToplami, (istasyonIsleri.get(istasyonId) ?? []).reduce((t, s) => t + s.uretilen, 0));
    // AR-AN-1: son girişten (yoksa gün başından) beri yalnız planlı pencerelerin net aktif dakikası; kaynaklardan birinin vardiyası bilinmiyorsa süre bilinmez.
    const planli = katkilar.map((x) => x.planli);
    const sonGirisMetni = sonGirisMetinleri.get(istasyonId);
    const girisYokAktifDk: number | null = planli.some((p) => p === null) ? null
      : girisYokAktifDakika(araliklariBirlestir(planli.flatMap((p) => p ?? [])), sonGirisMetni === undefined ? null : Date.parse(sonGirisMetni), gunBasi, simdi);
    const girisYok = girisYokMu({ girisYokAktifDk, esikDk: esikler.girisYokDk, beklenen });
    const adetEksik = adetEksikMi({ uretilen, beklenen, toleransYuzde: esikler.adetToleransYuzde });
    istasyonIsaretleri.set(istasyonId, istasyonIsaretli(girisYok, adetEksik));
    istasyonlarSatiri.push({
      istasyonId, kod: istasyon.kod, ad: istasyon.ad,
      kapasiteKaynagi: kapasiteKaynaklariHaritasi.get(istasyonId) ?? 'makine',
      beklenen: yuvarlaVeyaBos(beklenen), uretilen,
      oran: yuvarlaVeyaBos(uretimOrani(uretilen, beklenen)),
      girisYokDk: girisYokAktifDk, girisYok, adetEksik,
      hurda: istasyonUretimi.get(istasyonId)?.hurda ?? 0, planDisi,
    });
  }
  istasyonlarSatiri.sort((a, b) => a.kod.localeCompare(b.kod));
  const toplam = toplamOran(istasyonlarSatiri);
  const performans = donemTopla([...kisiOlcumleri.values()].map((o) => ({ beklenen: null, uretilen: null, hurda: null, isaret: null, ...o }))).performans;

  return {
    cevap: {
      tarih, hesaplama: new Date(simdi).toISOString(), esikler,
      toplam: {
        beklenen: yuvarla(toplam.beklenen), uretilen: toplam.uretilen, oran: yuvarlaVeyaBos(toplam.oran),
        hurda: istasyonlarSatiri.reduce((t, i) => t + (i.hurda ?? 0), 0), performans: yuvarlaVeyaBos(performans),
        planDisi: istasyonlarSatiri.reduce((t, i) => t + (i.planDisi ?? 0), 0),
      },
      istasyonlar: istasyonlarSatiri, makineler, kisiler, atlanan,
    },
    isEmirleri: tumIsler,
    kisiIstasyonlari: new Map([...kisiKimlikleri].map((k) => [k, kisiKaynakIstasyonu.get(k) ?? kisiIstasyonu.get(k) ?? null])),
    kisiOlcumleri,
    istasyonIsaretleri,
    istasyonToplamlari,
  };
}

const KISI_KIRILIMI: Islem = 'arkon.anomali-kisi';

export interface EmekVerimi {
  // Kişinin girdiği sağlamın standart süresi (saniye); sağlamı yoksa 0.
  standartSn: number;
  // Vardiya mesaisi, izinli gün hariç (saniye); takvimi bilinmiyorsa null.
  mesaiSn: number | null;
  // AR-AN-12; mesai yoksa null.
  oran: number | null;
}

// Emek verimi (kart #1324): [bas, bit] tesis günlerinde (ikisi dahil, şimdiye kadar) kişinin girdiği sağlamın standart süresi / vardiya mesaisi.
// Mesai vardiya takvimi ile İK'nın onaylı fazla mesaisidir (fazla mesai, hafta tatili ve resmi tatil çalışması); izin İK'dan okunur; katılım
// süresi kullanılmaz. Vardiya'da planlı fazla mesaisi olan gün (takvim `fazlaMesaiDakika`) İK saati eklenmez. Anomali kişi
// kırılımı ve Operatör Özetim aynı hesabı okur. Yetki ve kapsam çağıranındır.
// Gece vardiyası başladığı güne sayılır (Terminal kural 5/5): günün mesaisi o gün başlayan vardiyalardır, sağlam kişinin dönem penceresinden
// (dönemden önceki gün başlayan vardiyanın bitişinden dönemin son günü başlayan vardiyanın bitişine) okunur.
export async function emekVerimleri(
  db: Db, kisiIdleri: readonly number[], bas: string, bit: string, simdi: number = Date.now(), verilen?: GunTakvimleri,
): Promise<Map<number, EmekVerimi>> {
  const kisiler = [...new Set(kisiIdleri)];
  if (kisiler.length === 0 || bit < bas) return new Map();
  const gt = verilen ?? gunTakvimleri(db);
  await gt.onYukle(kisiler.map((id) => ({ tur: 'kisi' as const, id })), tarihEkle(bas, -1), bit);
  const takvimler = await calismaTakvimleri(db, kisiler.map((id) => ({ tur: 'kisi' as const, id })), { baslangic: bas, bitis: bit });
  const gunler: { tarih: string; bas: number; izinli: Set<number> }[] = [];
  for (let t = bas; t <= bit; t = tarihEkle(t, 1)) {
    const gunBasi = tesisGunBasi(t);
    if (gunBasi > simdi) break;
    gunler.push({ tarih: t, bas: gunBasi, izinli: new Set(await izinliKisiler(db, t)) });
  }
  const standart = new Map<number, { standartSaniye: number }>();
  for (const id of kisiler) {
    const k = { tur: 'kisi' as const, id };
    const pencere = [await gt.sinir([k], tarihEkle(bas, -1)), await gt.sinir([k], bit)].map((an) => new Date(an).toISOString()) as [string, string];
    const s = (await standartSureler(db, [id], ...pencere)).get(id);
    if (s !== undefined) standart.set(id, s);
  }
  // Onaylı fazla mesai, kişi ve gün başına saniye; saati bilinmeyen ya da onaylanmamış satır sayılmaz. Bugün şimdiye kadar değil, kayıttaki saat sayılır.
  const fazla = new Map<number, Map<string, number>>();
  for (const id of kisiler) {
    const gunluk = new Map<string, number>();
    for (const r of (await kisininFazlaMesaisi(db, id, bas, bit))?.satirlar ?? []) {
      if (r.onay !== 'Onaylandı' || r.saat === null || !(r.saat > 0)) continue;
      gunluk.set(r.tarih, (gunluk.get(r.tarih) ?? 0) + r.saat * 3600);
    }
    fazla.set(id, gunluk);
  }
  const sonuc = new Map<number, EmekVerimi>();
  for (const id of kisiler) {
    const k = { tur: 'kisi' as const, id };
    const takvim = takvimler.get(`kisi:${id}`);
    // Planlı fazla mesai takvimin aralıklarındadır; o gün İK saati ayrıca sayılmaz (çift sayım olmasın: plan esastır).
    const planliFazla = new Set((takvim?.gunler ?? []).filter((g) => (g.fazlaMesaiDakika ?? 0) > 0).map((g) => g.tarih));
    const gunluk = [];
    for (const g of gunler) {
      gunluk.push({
        bas: g.bas, bit: await gt.sinir([k], g.tarih), araliklar: await gt.araliklar(k, g.tarih), izinli: g.izinli.has(id),
        fazlaMesaiSn: planliFazla.has(g.tarih) ? 0 : fazla.get(id)?.get(g.tarih) ?? 0,
      });
    }
    const mesaiSn = mesaiSaniyesi({ araliklar: takvim ? [] : null, simdi, gunler: gunluk });
    const standartSn = standart.get(id)?.standartSaniye ?? 0;
    sonuc.set(id, { standartSn, mesaiSn, oran: emekVerimi(standartSn, mesaiSn) });
  }
  return sonuc;
}

// Kişi kırılımını yalnız arkon.anomali-kisi gören okur (kart #1306: yalnız yönetici); öbürüne null.
export async function anomaliler(
  db: Db, kullanici: Kullanici, verilenEsikler?: AnomaliEsikleri, simdi: number = Date.now(),
): Promise<AnomaliCevabi> {
  const esikler = verilenEsikler ?? await anomaliEsikleri(db);
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const { cevap } = await anomaliHesapla(db, kapsam, esikler, simdi);
  return { ...cevap, kisiler: islemVarMi(kullanici, KISI_KIRILIMI) ? cevap.kisiler : null };
}

/* ---------------- Üretim anomalisi gün kaydı (kart #1306) ---------------- */

// İş kişisizdir: kayıt bütün istasyonlar için tutulur, okuma kişinin kapsamıyla süzülür. Kaynağın boş listesi "kısıt yok" demektir.
const kisitsiz = async (): Promise<readonly number[]> => [];

function kayitSatirlari(tarih: string, h: AnomaliHesabi): sorgular.AnomaliKayitSatiri[] {
  const bos = { kaynakTur: null, kaynakId: null, standartSn: null, calisilanSn: null } as const;
  return [
    ...h.cevap.istasyonlar.map((i) => ({
      ...bos, tarih, kirilim: 'istasyon' as const, kimlik: i.istasyonId, istasyonId: i.istasyonId,
      beklenen: i.beklenen, uretilen: h.istasyonToplamlari.get(i.istasyonId) ?? i.uretilen, hurda: i.hurda, isaret: h.istasyonIsaretleri.get(i.istasyonId) ?? null,
    })),
    ...h.cevap.makineler.map((m) => ({
      ...bos, tarih, kirilim: 'makine' as const, kimlik: m.makineId, istasyonId: m.istasyonId,
      beklenen: m.beklenen, uretilen: m.uretilen, hurda: m.hurda, isaret: m.durum === 'isaret' ? true : m.durum === 'normal' ? false : null,
    })),
    ...h.cevap.kisiler.map((k) => ({
      ...bos, tarih, kirilim: 'kisi' as const, kimlik: k.kisiId, istasyonId: h.kisiIstasyonlari.get(k.kisiId) ?? null,
      beklenen: k.beklenen, uretilen: k.uretilen, hurda: k.hurda, isaret: k.durum === 'isaret' ? true : k.durum === 'normal' ? false : null,
      standartSn: h.kisiOlcumleri.get(k.kisiId)?.standartSn ?? null, calisilanSn: h.kisiOlcumleri.get(k.kisiId)?.calisilanSn ?? null,
    })),
    ...h.isEmirleri.map((s) => ({
      ...bos, tarih, kirilim: 'is_emri' as const, kimlik: s.isEmriId, istasyonId: s.istasyonId, kaynakTur: s.kaynak.tur, kaynakId: s.kaynak.id,
      beklenen: s.beklenen, uretilen: s.uretilen, hurda: null, isaret: null,
    })),
  ];
}

async function gunuYaz(db: Db, kapsam: Kapsam, esikler: AnomaliEsikleri, tarih: string, simdi: number, gt: GunTakvimleri): Promise<void> {
  if (!(await sorgular.anomaliGunuAc(db, { tarih, hesaplama: new Date(simdi).toISOString(), ...esikler }))) return;
  await sorgular.anomaliSatirlariYenile(db, tarih, kayitSatirlari(tarih, await anomaliHesapla(db, kapsam, esikler, simdi, { tarih, gt })));
}

// Zamanlayıcı işi: etkin açık gün yenilenir (gece vardiyası sürerken dün); kapanış anı gelmiş açık gün, o gün başlayan son vardiyanın
// bitişiyle bir kez daha hesaplanır ve kesinleşir (AR-AN-7, Terminal kural 5/5). Kesin gün yeniden yazılmaz.
export async function anomaliGunuKaydet(db: Db, simdi: number = Date.now()): Promise<void> {
  const kapsam = await kisininKapsami(db, 0, kisitsiz);
  const esikler = await anomaliEsikleri(db);
  const gt = gunTakvimleri(db);
  const kaynaklar = planKaynaklari(await planlanacakIsEmirleri(db));
  await gt.onYukle(kaynaklar, gunEkle(tesisGunu(simdi), -2), tesisGunu(simdi));
  const bugun = await etkinTesisGunu(gt, kaynaklar, simdi);
  const aciklar = (await sorgular.anomaliGunleri(db, gunEkle(bugun, -366), gunEkle(bugun, -1))).filter((g) => g.durum === 'acik').map((g) => g.tarih);
  const kapanislar = new Map<string, number>();
  for (const t of aciklar) kapanislar.set(t, await gt.sinir(kaynaklar, t));
  for (const tarih of kapanacakGunler({ aciklar, simdi, kapanis: (t) => kapanislar.get(t) ?? tesisGunBasi(gunEkle(t, 1)) })) {
    await gunuYaz(db, kapsam, esikler, tarih, (kapanislar.get(tarih) ?? tesisGunBasi(gunEkle(tarih, 1))) - 1, gt);
    await sorgular.anomaliGunuKesinlestir(db, tarih);
  }
  await gunuYaz(db, kapsam, esikler, bugun, simdi, gt);
}

const donemOlcusu = (t: DonemToplami) => ({
  beklenen: yuvarla(t.beklenen), uretilen: t.uretilen, hurda: t.hurda, oran: yuvarlaVeyaBos(t.oran), performans: yuvarlaVeyaBos(t.performans),
});

// Gün, hafta, ay istatistiği kaydedilmiş günlerden okunur (AR-AN-5, AR-AN-8). Kişi kırılımı yalnız arkon.anomali-kisi ile; satırlar kapsamla süzülür.
export async function anomaliIstatistigi(db: Db, kullanici: Kullanici, sorgu: { donem: AnomaliDonemi; tarih: string }): Promise<AnomaliIstatistikCevabi> {
  const { bas, bit } = donemAraligi(sorgu.donem, sorgu.tarih);
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const istasyonById = new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  const kapsamda = (istasyonId: number | null): boolean => kapsamdaMi(kapsam, istasyonId === null ? null : istasyonById.get(istasyonId)?.isMerkeziId ?? null);
  const kayitliGunler = new Map((await sorgular.anomaliGunleri(db, bas, bit)).map((g) => [g.tarih, g.durum]));
  const kayitlar = (await sorgular.anomaliSatirlari(db, bas, bit, ['istasyon', 'makine', 'kisi', 'is_emri'])).filter((r) => kapsamda(r.istasyonId));
  // AR-AN-10: istasyon satırı günün bütün sayımını tutar; üretilen plandaki iş emirlerinin sayımıdır, geri kalanı plan dışı. İş emri
  // satırlarının hiçbirinde sayım olmayan gün eski kayıttır: plan dışı bilinmez.
  const planlilar = new Map<string, number>();
  const eskiGunler = new Set<string>();
  for (const r of kayitlar.filter((x) => x.kirilim === 'is_emri')) {
    if (r.uretilen === null) { eskiGunler.add(r.tarih); continue; }
    const anahtar = `${r.tarih}:${r.istasyonId ?? ''}`;
    planlilar.set(anahtar, (planlilar.get(anahtar) ?? 0) + r.uretilen);
  }
  for (const r of kayitlar) if (r.kirilim === 'is_emri' && r.uretilen !== null) eskiGunler.delete(r.tarih);
  const planDisilari = new Map<sorgular.AnomaliKayitSatiri, number | null>();
  const satirlar = kayitlar.filter((r) => r.kirilim !== 'is_emri').map((r) => {
    if (r.kirilim !== 'istasyon' || r.uretilen === null) return r;
    const p = planliUretim(r.uretilen, eskiGunler.has(r.tarih) ? null : planlilar.get(`${r.tarih}:${r.istasyonId ?? ''}`) ?? 0);
    const yeni = { ...r, uretilen: p.uretilen };
    planDisilari.set(yeni, p.planDisi);
    return yeni;
  });
  const planDisiToplami = (rs: readonly sorgular.AnomaliKayitSatiri[]): number => rs.reduce((t, r) => t + (planDisilari.get(r) ?? 0), 0);
  const planDisiBilinir = (rs: readonly sorgular.AnomaliKayitSatiri[]): boolean => rs.some((r) => planDisilari.get(r) != null);
  const olcu = (r: sorgular.AnomaliKayitSatiri): DonemSatiri => r;
  const kirilim = (k: sorgular.AnomaliKirilimi) => satirlar.filter((r) => r.kirilim === k);
  const kume = (k: sorgular.AnomaliKirilimi): Map<number, sorgular.AnomaliKayitSatiri[]> => {
    const m = new Map<number, sorgular.AnomaliKayitSatiri[]>();
    for (const r of kirilim(k)) m.set(r.kimlik, [...(m.get(r.kimlik) ?? []), r]);
    return m;
  };
  const performans = (rs: readonly sorgular.AnomaliKayitSatiri[]): number | null => donemTopla(rs.map(olcu)).performans;

  const gunler: AnomaliIstatistikCevabi['gunler'] = [];
  for (let t = bas; t <= bit; t = gunEkle(t, 1)) {
    const durum = kayitliGunler.get(t) ?? null;
    if (durum === null) {
      gunler.push({ tarih: t, durum, beklenen: null, uretilen: null, hurda: null, oran: null, performans: null, planDisi: null, isaretliIstasyon: null });
      continue;
    }
    const ist = kirilim('istasyon').filter((r) => r.tarih === t);
    const d = donemTopla(ist.map(olcu));
    gunler.push({
      tarih: t, durum, ...donemOlcusu(d), performans: yuvarlaVeyaBos(performans(kirilim('kisi').filter((r) => r.tarih === t))),
      planDisi: planDisiBilinir(ist) ? planDisiToplami(ist) : null, isaretliIstasyon: d.isaretliGun,
    });
  }
  const toplam = donemTopla(kirilim('istasyon').map(olcu));
  const donemKirilimi = (rs: readonly sorgular.AnomaliKayitSatiri[]) => {
    const d = donemTopla(rs.map(olcu));
    return { ...donemOlcusu(d), isaretliGun: d.isaretliGun, gun: d.gun };
  };

  const makineIdleri = [...kume('makine').keys()];
  const makineById = new Map((await aktifMakineler(db)).map((m) => [m.id, m]));
  for (const id of makineIdleri) {
    if (makineById.has(id)) continue;
    const m = await makineGetir(db, id);
    if (m !== null) makineById.set(id, m);
  }
  const kisiGorur = islemVarMi(kullanici, KISI_KIRILIMI);
  const kisiKumesi = kume('kisi');
  const adlar = kisiGorur ? await kisiAdlari(db, [...kisiKumesi.keys()]) : new Map<number, string>();
  // Emek verimi kayda yazılmaz, okuma anında dönemin mesaisiyle hesaplanır (kart #1324: kayıt tablosu değişmez). Gelecek günler sayılmaz.
  const emekBit = [bit, tesisGunu(Date.now())].sort()[0] ?? bit;
  const emek = kisiGorur ? await emekVerimleri(db, [...kisiKumesi.keys()], bas, emekBit) : new Map<number, EmekVerimi>();

  return {
    donem: sorgu.donem, bas, bit, gunler,
    toplam: { ...donemOlcusu(toplam), performans: yuvarlaVeyaBos(performans(kirilim('kisi'))), planDisi: planDisiToplami(kirilim('istasyon')), kayitliGun: kayitliGunler.size },
    istasyonlar: [...kume('istasyon')].map(([id, rs]) => ({
      istasyonId: id, kod: istasyonById.get(id)?.kod ?? `#${id}`, ad: istasyonById.get(id)?.ad ?? '', ...donemKirilimi(rs), planDisi: planDisiToplami(rs),
    })).sort((a, b) => a.kod.localeCompare(b.kod)),
    makineler: [...kume('makine')].map(([id, rs]) => ({
      makineId: id, kod: makineById.get(id)?.kod ?? `#${id}`, ad: makineById.get(id)?.ad ?? '', istasyonId: rs[rs.length - 1]?.istasyonId ?? null, ...donemKirilimi(rs),
    })).sort((a, b) => a.kod.localeCompare(b.kod)),
    kisiler: kisiGorur
      ? [...kisiKumesi].map(([id, rs]) => ({
        kisiId: id, ad: adlar.get(id) ?? `Kişi ${id}`, ...donemKirilimi(rs), emekVerimi: yuvarlaVeyaBos(emek.get(id)?.oran ?? null),
      })).sort((a, b) => a.ad.localeCompare(b.ad))
      : null,
  };
}

/* ── Operatör Özetim (kart #1295) ── */

// Kişinin iş merkezleri, istasyon ve makine atamasından (istasyonun iş merkezi). Ekip ve amir kapsamı bu eşlemeyle çözülür.
async function kisiIsMerkezleri(db: Db, tarih: string): Promise<Map<number, Set<number>>> {
  const merkez = new Map((await istasyonlar(db, { pasiflerDahil: false })).map((i) => [i.id, i.isMerkeziId]));
  const makineIstasyonu = new Map((await aktifMakineler(db)).map((m) => [m.id, m.istasyonId]));
  const sonuc = new Map<number, Set<number>>();
  const ekle = (kisiId: number, istasyonId: number | null | undefined): void => {
    const m = istasyonId === null || istasyonId === undefined ? null : merkez.get(istasyonId) ?? null;
    if (m === null) return;
    sonuc.set(kisiId, (sonuc.get(kisiId) ?? new Set()).add(m));
  };
  for (const a of await istasyonKisileri(db)) ekle(a.kisiId, a.istasyonId);
  for (const a of await makineKisiAtamalari(db, { tarih })) ekle(a.kisiId, makineIstasyonu.get(a.makineId));
  return sonuc;
}

const ozetYuvarla = (o: { kalite: number | null; saatlikSaglam: number | null }) => ({
  kalite: o.kalite === null ? null : Math.round(o.kalite * 1000) / 1000,
  saatlikSaglam: yuvarlaVeyaBos(o.saatlikSaglam),
});

const kesisirMi = (a: ReadonlySet<number> | undefined, b: ReadonlySet<number> | undefined): boolean =>
  a !== undefined && b !== undefined && [...a].some((x) => b.has(x));

// Kişi kendi özetini görür. Amir kendi iş merkezi kapsamındaki (atandığı istasyon ya da makine kapsamda) kişileri salt okur;
// kapsamsız kişi amire de açılmaz. Duruş kişiye yazılmaz, özette yoktur. Başarı ve ekip ortalaması bugünün plan hesabıdır.
export async function operatorOzeti(
  db: Db, kullanici: Kullanici, sorgu: { donem: OzetDonemi; kisiId?: number | undefined }, simdi: number = Date.now(),
): Promise<OperatorOzetiCevabi> {
  const amir = islemVarMi(kullanici, 'arkon.amir');
  if (!amir && !islemVarMi(kullanici, 'arkon.operator')) throw yetkiYok(ILETILER.ozetRolYok);
  const bugun = tesisGunu(simdi);
  const merkezleri = await kisiIsMerkezleri(db, bugun);
  let ekip: { id: number; ad: string }[] = [];
  if (amir) {
    const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
    const idler = [...merkezleri].filter(([, m]) => [...m].some((x) => kapsamdaMi(kapsam, x))).map(([id]) => id);
    const adlar = await kisiAdlari(db, idler);
    ekip = idler.map((id) => ({ id, ad: adlar.get(id) ?? `Kişi ${id}` })).sort((a, b) => a.ad.localeCompare(b.ad));
  }
  const kisiId = sorgu.kisiId ?? kullanici.id;
  if (kisiId !== kullanici.id && !ekip.some((k) => k.id === kisiId)) throw yetkiYok(ILETILER.ozetKapsamDisi);
  const ad = (await kisiAdlari(db, [kisiId])).get(kisiId);
  if (ad === undefined) throw bulunamadi();

  const gunAraligi = (tarih: string): [string, string] => [new Date(tesisGunBasi(tarih)).toISOString(), new Date(tesisGunBasi(tarihEkle(tarih, 1))).toISOString()];
  const baslangic = donemBaslangici(bugun, sorgu.donem);
  const [bas] = gunAraligi(baslangic);
  const [, bit] = gunAraligi(bugun);
  const adet = (await aralikAdetleri(db, 'kisi', [kisiId], bas, bit)).get(kisiId);
  const calismaSn = (await katilimSureleri(db, [kisiId], bas, bit)).get(kisiId) ?? null;
  const saglam = adet?.saglam ?? null;
  const hurda = adet?.hurda ?? null;

  // Kişi kırılımı ekranı yalnız arkon.anomali-kisi görür; Özetim yalnız kişinin kendi oranını ve adsız ekip ortalamasını verir, hesabı doğrudan okur.
  const kapsam = await kisininKapsami(db, kullanici.id, kisininIzinliIsMerkezleri);
  const ekibim = merkezleri.get(kisiId);
  const hesapKisileri = new Set([...merkezleri.keys()].filter((k) => k === kisiId || kesisirMi(merkezleri.get(k), ekibim)));
  hesapKisileri.add(kisiId);
  const { cevap: anomali } = await anomaliHesapla(db, kapsam, await anomaliEsikleri(db), simdi, undefined, hesapKisileri);
  const oran = (k: AnomaliKisiSatiri): number | null => (k.beklenen === null || k.beklenen <= 0 || k.uretilen === null ? null : k.uretilen / k.beklenen);
  const kendi = anomali.kisiler.find((k) => k.kisiId === kisiId);
  const kendiOrani = kendi === undefined ? null : oran(kendi);
  const ekipOranlari = anomali.kisiler.filter((k) => k.kisiId === kisiId || kesisirMi(merkezleri.get(k.kisiId), ekibim)).map(oran).filter((o): o is number => o !== null);

  // Son 7 gün, dönem ve rozet için bu ay: kayıtsız gün boş kalır.
  const ilkGun = [tarihEkle(bugun, -6), baslangic, donemBaslangici(bugun, 'ay')].sort()[0] ?? bugun;
  const verimler = new Map((await planAyarlari(db)).map((a) => [a.istasyonId, Number(a.verimYuzde)]));
  const takvimler = gunTakvimleri(db);
  const gecmisGunleri: string[] = [];
  for (let t = ilkGun; t < bugun; t = tarihEkle(t, 1)) if (t >= baslangic || t >= tarihEkle(bugun, -6)) gecmisGunleri.push(t);
  const gecmisPlan = await gecmisBeklenenler(db, kisiId, gecmisGunleri, verimler, takvimler);
  const gunler: (OzetGunu & { beklenen: number | null; standartla: number })[] = [];
  const gunListesi: string[] = [];
  for (let t = ilkGun; t <= bugun; t = tarihEkle(t, 1)) gunListesi.push(t);
  // Günler ardışıktır: günün sonu ertesi günün başıdır; bütün günlerin sayımı tek sorguda.
  const gunAdetleri = await gunlukAralikAdetleri(db, 'kisi', [kisiId], [...gunListesi.map((t) => gunAraligi(t)[0]), gunAraligi(bugun)[1]]);
  for (const [n, t] of gunListesi.entries()) {
    const g = gunAdetleri[n]?.get(kisiId);
    const plan = t === bugun ? { beklenen: kendi?.beklenen ?? null, standartla: 0 } : gecmisPlan.get(t) ?? { beklenen: null, standartla: 0 };
    gunler.push({ tarih: t, saglam: g?.saglam ?? null, hurda: g?.hurda ?? null, ...plan });
  }
  const yediGun = tarihEkle(bugun, -6);
  const basari = donemBasarisi(gunler.filter((g) => g.tarih >= baslangic));

  const standart = (await standartSureler(db, [kisiId], bas, bit)).get(kisiId);
  const isler = (await kisininIsEmirleri(db, kisiId, bas, bit)).map((i) => ({
    isEmriId: i.isEmriId, emirNo: i.emirNo, parca: [i.urun.parcaNo, i.urun.parcaAd].filter(Boolean).join(' · '), opNo: i.opNo, adimAdi: i.adimAdi,
    durum: i.durum, saglam: i.saglam, hurda: i.hurda, saniye: i.saniye,
  }));

  return {
    kisi: { id: kisiId, ad }, donem: sorgu.donem, baslangic, bitis: bugun, hesaplama: new Date(simdi).toISOString(),
    saglam, hurda, calismaSn, ...ozetYuvarla(ozetOranlari(saglam, hurda, calismaSn)),
    basari: basari === null ? null : { ...basari, oran: yuvarla(basari.oran), beklenen: yuvarla(basari.beklenen) },
    verim: standart === undefined || calismaSn === null || calismaSn <= 0 ? null : { oran: yuvarla(standart.standartSaniye / calismaSn), suresizSaglam: standart.suresizSaglam },
    isler,
    hurdaNedenleri: (await kisininHurdaNedenleri(db, kisiId, bas, bit)).map(({ kod, ad: nedenAdi, adet: n }) => ({ kod, ad: nedenAdi, adet: n })),
    ekipOrtalamasi: sorgu.donem !== 'gun' ? null : yuvarlaVeyaBos(ekipOrtalamasi(ekipOranlari)),
    gunler: gunler.filter((g) => g.tarih >= yediGun).map(({ tarih, saglam: s, hurda: h, beklenen }) => ({ tarih, saglam: s, hurda: h, beklenen: yuvarlaVeyaBos(beklenen) })),
    rozetler: ozetRozetleri(gunler, bugun),
    emekVerimi: emekOzeti((await emekVerimleri(db, [kisiId], baslangic, bugun, simdi)).get(kisiId)),
    yetkiler: await kisininYetkileri(db, kisiId, bugun),
    ...(await kisininMesaiVeIzni(db, kisiId, bugun)),
    ekip,
  };
}

// Mesai Vardiya takviminden (plan), fazla mesai ve izin İK'dan. Ortak terminal ayrımı yok (kullanıcı kararı): kişi kendi oturumunda, amir
// kapsamındaki kişide görür; yetki operatorOzeti'nin başındadır. Fazla mesai yılı takvim yılıdır.
async function kisininMesaiVeIzni(
  db: Db, kisiId: number, bugun: string,
): Promise<Pick<OperatorOzetiCevabi, 'mesailer' | 'fazlaMesai' | 'izinler'>> {
  // Dün de okunur: dün başlayan gece vardiyasının bugüne taşan parçası düne yazılsın, sonra dün atılır.
  const takvim = await calismaTakvimi(db, { tur: 'kisi', id: kisiId }, { baslangic: tarihEkle(bugun, -1), bitis: tarihEkle(bugun, 6) });
  const ay = await kisininFazlaMesaisi(db, kisiId, donemBaslangici(bugun, 'ay'), bugun);
  const yil = ay === null ? null : await kisininFazlaMesaisi(db, kisiId, `${bugun.slice(0, 4)}-01-01`, bugun);
  const kalan = await kisininKalanIzni(db, kisiId, bugun);
  const izinler = kalan === null ? null : await kisininIzinleri(db, kisiId, bugun, tarihEkle(bugun, 180));
  return {
    mesailer: takvim === null ? null : mesaiGunleri(takvim.gunler, takvim.araliklar).slice(1),
    fazlaMesai: ay === null || yil === null ? null : {
      aySaat: fazlaMesaiSaati(ay.satirlar),
      yilSaat: fazlaMesaiSaati(yil.satirlar),
      bekleyenSaat: fazlaMesaiSaati(yil.satirlar.filter((r) => r.onay === 'Beklemede')),
      yillikSinirSaat: yil.yillikSinirSaat,
      satirlar: [...ay.satirlar].reverse(),
    },
    izinler: kalan === null ? null : {
      ...kalan,
      yaklasan: (izinler ?? []).flatMap((i) => (i.durum === 'Beklemede' || i.durum === 'Onaylandı' ? [{ ...i, durum: i.durum }] : [])),
    },
  };
}

const emekOzeti = (e: EmekVerimi | undefined): OperatorOzetiCevabi['emekVerimi'] => ({
  oran: yuvarlaVeyaBos(e?.oran ?? null), standartSn: Math.round(e?.standartSn ?? 0), mesaiSn: e?.mesaiSn == null ? null : Math.round(e.mesaiSn),
});

// Kişinin bugünkü istasyon ve makine atamaları (istasyonlar modülü); pasif istasyon ve makine düşer.
async function kisininYetkileri(db: Db, kisiId: number, tarih: string): Promise<OperatorOzetiCevabi['yetkiler']> {
  const istasyonById = new Map((await istasyonlar(db, { pasiflerDahil: false })).map((i) => [i.id, i]));
  const makineById = new Map((await aktifMakineler(db)).map((m) => [m.id, m]));
  const istasyonIdleri = (await yetkiliIstasyonIdleri(db, kisiId, tarih)).get(kisiId) ?? new Set<number>();
  const makineIdleri = new Set((await makineKisiAtamalari(db, { kisiId, tarih })).map((a) => a.makineId));
  const sira = <T extends { kod: string }>(a: T, b: T): number => a.kod.localeCompare(b.kod);
  return {
    istasyonlar: [...istasyonIdleri].flatMap((id) => { const i = istasyonById.get(id); return i ? [{ id, kod: i.kod, ad: i.ad }] : []; }).sort(sira),
    makineler: [...makineIdleri].flatMap((id) => {
      const m = makineById.get(id);
      return m ? [{ id, kod: m.kod, ad: m.ad, istasyonKodu: m.istasyonId === null ? null : istasyonById.get(m.istasyonId)?.kod ?? null }] : [];
    }).sort(sira),
  };
}

// Geçmiş günlerin beklenen adedi: kişinin o gün çalıştığı (sayımı ya da katılımı olan) iş emirlerinin plan yerleşimi, kaynağın o günkü
// net çalışma aralıklarıyla kesişir (Anomali'nin hesabı, gün sonuna kadar). Yerleşimi olmayan iş emrinde katılım süresi / birim süre
// (`standartla` sayılır). Parçalardan biri bilinmiyorsa gün bilinmez; o gün iş yoksa null. Günün işleri günlük okunur; plan, iş emri bilgisi ve
// vardiya takvimi bütün günler için tek turda alınır (gün ve iş sayısıyla sorgu büyümesin diye).
async function gecmisBeklenenler(
  db: Db, kisiId: number, tarihler: readonly string[], verimler: ReadonlyMap<number, number>, takvimler: GunTakvimleri,
): Promise<Map<string, { beklenen: number | null; standartla: number }>> {
  const sonuc = new Map<string, { beklenen: number | null; standartla: number }>();
  const gunIsleri = new Map<string, Awaited<ReturnType<typeof kisininIsEmirleri>>>();
  // İlk günden son güne ardışık günlerin işleri tek sorguda; istenmeyen ara günler okunur ama kullanılmaz.
  const sirali = [...tarihler].sort();
  const aralik: string[] = [];
  if (sirali.length > 0) for (let t = sirali[0] as string; t <= (sirali.at(-1) as string); t = tarihEkle(t, 1)) aralik.push(t);
  const gunSirasi = new Map(aralik.map((t, n) => [t, n]));
  const gunlukIsler = aralik.length === 0 ? [] : await kisininGunlukIsEmirleri(db, kisiId, [...aralik, tarihEkle(aralik.at(-1) as string, 1)].map((t) => new Date(tesisGunBasi(t)).toISOString()));
  for (const tarih of tarihler) {
    const isler = (gunlukIsler[gunSirasi.get(tarih) ?? -1] ?? []).filter((i) => i.isEmriId !== null);
    if (isler.length === 0) sonuc.set(tarih, { beklenen: null, standartla: 0 });
    else gunIsleri.set(tarih, isler);
  }
  const hepsi = [...new Set([...gunIsleri.values()].flatMap((isler) => isler.map((i) => i.isEmriId as number)))];
  if (hepsi.length === 0) return sonuc;
  const yerlesim = new Map((await canliSira(db, hepsi)).yerlesimler.map((y) => [y.isEmriId, y]));
  const bilgi = await isEmriPlanBilgileri(db, hepsi);
  const kaynaklar = planKaynaklari([...yerlesim.values()].map((y) => ({ kaynak: y.kaynak })));
  if (kaynaklar.length > 0) await takvimler.onYukle(kaynaklar, [...gunIsleri.keys()].sort()[0] as string, [...gunIsleri.keys()].sort().at(-1) as string);
  for (const [tarih, isler] of gunIsleri) {
    const gunBasi = tesisGunBasi(tarih);
    const parcalar: (number | null)[] = [];
    let standartla = 0;
    for (const i of isler) {
      const b = bilgi.get(i.isEmriId as number);
      const birimSureDk = b?.birimSureDk === null || b === undefined ? null : Number(b.birimSureDk);
      const y = yerlesim.get(i.isEmriId as number);
      if (b === undefined || birimSureDk === null || !(birimSureDk > 0)) { parcalar.push(null); continue; }
      if (y === undefined) {
        standartla += 1;
        parcalar.push(i.saniye === null ? null : Math.min(b.adet, i.saniye / 60 / birimSureDk));
        continue;
      }
      // Gece vardiyası başladığı güne sayılır (Terminal kural 5/5): o gün başlayan vardiyalar, son vardiyanın bitişine kadar.
      const net = await takvimler.araliklar(y.kaynak, tarih);
      parcalar.push(net === null ? null : isEmriBeklenenAdet({
        adet: b.adet, birimSureDk, verimYuzde: (b.istasyonId === null ? undefined : verimler.get(b.istasyonId)) ?? 100,
        baslangic: y.baslangic.getTime(), bitis: y.bitis.getTime(), araliklar: net, gunBasi, simdi: await takvimler.sinir([y.kaynak], tarih),
      }));
    }
    sonuc.set(tarih, { beklenen: kesinToplam(parcalar), standartla });
  }
  return sonuc;
}
