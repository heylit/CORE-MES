import { KOD_ONEKI } from '#paylasilan/kod-sozlugu.ts';
import { MUAF_TUTULABILEN_MADDELER } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  CalismaDurumu, EmirDurumu, EmirTuru, HazirlikMaddesi, KapanisAsamasi, KapanisMaddeBilgisi, KapanisMaddeHali, KapanisMaddesi, KapanisOnayi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Islem } from '#paylasilan/islemler.ts';

export type IstasyonDurumu = 'yok' | 'pasif' | 'aktif';

export const EMIR_YOK = 'Üretim emri bulunamadı.';
export const ISTASYON_YOK = 'İstasyon bulunamadı.';
export const ISTASYON_PASIF_ACMA = 'Pasif istasyona emir açılamaz.';
export const ISTASYON_PASIF_BASLATMA = 'Emrin istasyonu pasif; emir başlatılamaz.';
export const BASLATMA_DURUMU = 'Yalnız planlı emir başlatılır.';
export const BITIRME_DURUMU = 'Yalnız başlamış emir bitirilir.';
export const KAPSAM_DISI = 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.';
// UE20 (karar 86 b): istasyonda bugün geçerli yetkinliği olmayan kişi iş başlatamaz; bütün işlemleri taşıyan yönetici rolü muaftır.
export const YETKINLIK_YOK = 'Bu istasyonda geçerli yetkinlik kaydınız yok; iş başlatılamaz. Yetkinlik İstasyonlar > Personel sekmesinden verilir.';
export const baslatmaYetkinlikIhlali = (yetkin: boolean, muaf: boolean): string | null => (yetkin || muaf ? null : YETKINLIK_YOK);
// Soru 185 a: sayımı yalnız emrin çalışan adımına başlamış ya da katılmış kişi yazar; düzeltme işlemi olan (yönetici, vardiya sorumlusu) da yazar.
export const SAYIM_DUZELTME_ISLEMI = 'uretim-emirleri.sayim-duzelt' satisfies Islem;
export const SAYIM_KATILIMSIZ = 'Bu işe başlamadınız ya da katılmadınız; sayımı işteki kişi, yönetici ya da vardiya sorumlusu girer.';
export const sayimYetkiIhlali = (katilmis: boolean, duzeltebilir: boolean): string | null => (katilmis || duzeltebilir ? null : SAYIM_KATILIMSIZ);
export const KATILIM_CALISMIYOR = 'Yalnız çalışan işe katılınır; iş duraklatılmış ya da durdurulmuşsa önce devam ettirin.';
export const KATILIM_ACIK = 'Bu işte zaten çalışıyorsunuz.';
export const KATILIM_YOK = 'Bu işte açık ya da duraklatılmış çalışmanız yok.';
export const EKIP_DISI = 'Bu istasyonun ekibinde değilsiniz; işe katılamazsınız.';
export const KATILIM_TEK_ACIK = 'uretim_emirleri_katilim_kiside_tek_acik';
export const DURAKLI_DURDUR = 'Duraklamış iş durdurulamaz; önce devam ettirin.';
export const MAKINE_DOLU = 'Bu makinede başka biri iş başlatmış; önce onun durdurulması gerek. Onaylarsanız o işi durdurup sizin için başlatabilirsiniz.';
export const MAKINEDE_AYNI_IS = 'Bu iş bu makinede zaten çalışıyor.';
export const MAKINE_SECILEMEZ = 'Seçilen makine bu istasyonda değil ya da çalışır durumda değil.';
export const DEVRAL_DEGISTI = 'Makinedeki iş değişti; ekranı yenileyip yeniden deneyin.';
export const DEVRAL_DURUMU = 'Makine devralınarak yalnız planlı, duraklamış ya da durmuş iş başlatılır.';
export const ISTASYON_DOLU = 'Bu istasyonda başka biri iş başlatmış; önce onun durdurulması gerek. Onaylarsanız o işi durdurup sizin için başlatabilirsiniz.';
export const MAKINEDE_TEK = 'uretim_emirleri_makine_kullanimi_makinede_tek';
export const ISTASYONDA_TEK = 'uretim_emirleri_makine_kullanimi_istasyonda_tek';

// Kurallar ihlal iletisini döner (null: kural geçti); hata türünü servis seçer.
export const baslatmaIhlali = (durum: EmirDurumu): string | null => (durum === 'planli' ? null : BASLATMA_DURUMU);
export const bitirmeIhlali = (durum: EmirDurumu): string | null => (durum === 'basladi' ? null : BITIRME_DURUMU);
export const ROTASIZ_EMIR_KAPALI = 'Rotasız üretim emri ayarlardan kapalı: emri Reçete ve Rota\'dan açın.';


export const acmaIstasyonIhlali = (durum: IstasyonDurumu): string | null => {
  if (durum === 'yok') return ISTASYON_YOK;
  return durum === 'pasif' ? ISTASYON_PASIF_ACMA : null;
};

// Emrin istasyonu sonradan silinemez (yabancı anahtar); yine de 'yok' sessizce geçmez.
export const baslatmaIstasyonIhlali = (durum: IstasyonDurumu): string | null => {
  if (durum === 'yok') return ISTASYON_YOK;
  return durum === 'pasif' ? ISTASYON_PASIF_BASLATMA : null;
};

// Yerde (makine ya da makinesiz istasyon yeri) açık kullanım varsa başlatma reddedilir; kilit yerdedir, kişide değil. Aynı emrin başka
// adımı yeri tutuyorsa yer doludur (paralel adım, 639); adım bilinmiyorsa aynı emir aynı iş sayılır.
export const makineDoluIhlali = (
  acikEmirId: number | null, emirId: number, makineli = true, acikIsEmriId: number | null = null, isEmriId: number | null = null,
): string | null => {
  if (acikEmirId === null) return null;
  if (acikEmirId === emirId && (acikIsEmriId === null || isEmriId === null || acikIsEmriId === isEmriId)) return MAKINEDE_AYNI_IS;
  return makineli ? MAKINE_DOLU : ISTASYON_DOLU;
};

// 393 d: operatör planınkinden başka makine seçebilir; seçtiği makinede başka emre ayrılmış, önümüzdeki 4 saat içinde başlayan ve henüz
// başlamamış bir iş varsa başlatamaz (o emrin yeri korunur). Ayrım canlı plandandır; aynı emrin adımı ayrım sayılmaz.
export const MAKINE_AYRIM_UFKU_DK = 240;
export interface MakineAyrimi {
  makineId: number;
  uretimEmriId: number;
  emirNo: string;
  opNo: number;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  baslangic: string;
}
export const ilkAyrim = (ayrimlar: readonly MakineAyrimi[], emirId: number, secilen: readonly number[], atanan: number | null): MakineAyrimi | null =>
  ayrimlar.filter((a) => a.makineId !== atanan && secilen.includes(a.makineId) && a.durum === 'bekliyor' && a.uretimEmriId !== emirId)
    .sort((x, y) => Date.parse(x.baslangic) - Date.parse(y.baslangic))[0] ?? null;
export const makineAyrildiMetni = (makine: string, a: Pick<MakineAyrimi, 'emirNo' | 'opNo'>, saat: string, planMakinesi: string | null): string =>
  `${makine} önümüzdeki ${MAKINE_AYRIM_UFKU_DK / 60} saat için başka işe ayrılmış: ${a.emirNo} op ${a.opNo}, başlangıç ${saat}. `
  + `Bu işi ${planMakinesi === null ? 'planlanan makinede' : `planlanan makinede (${planMakinesi})`} başlatın ya da planlamacıdan planı taşımasını isteyin.`;

// Seçilmeyen makine iş emrinin makinesidir; o da yoksa iş makinesiz çalışır.
export const calisilacakMakineler = (secilen: readonly number[] | undefined, atanmis: number | null): number[] => {
  if (secilen !== undefined) return [...secilen];
  return atanmis === null ? [] : [atanmis];
};

export const BASLAMAMIS_EMIR = 'Yalnız başlamış emirde sayım ve duruş işlemi yapılır.';
export const DURUSTA_SAYIM = 'Duruşta sayım yapılamaz; önce devam edin.';
export const CALISAN_DEGIL_DURAKLAT = 'Yalnız çalışan iş duraklatılır.';
export const DURMUS_DURDUR = 'İş zaten durmuş.';
export const CALISAN_DEVAM = 'İş zaten çalışıyor; devam edilecek bir duruş yok.';
export const SAGLAM_EKSIYE_INER = 'Sağlam adet sıfırın altına inemez.';
export const HURDA_EKSIYE_INER = 'Hurda adet sıfırın altına inemez.';
export const DURUS_NEDENI_YOK = 'Duruş nedeni bulunamadı.';
export const DURUS_NEDENI_PASIF = 'Duruş nedeni pasif; aktif bir neden seçin.';
export const HURDA_NEDENI_YOK = 'Hurda nedeni bulunamadı.';
export const HURDA_NEDENI_PASIF = 'Hurda nedeni pasif; aktif bir neden seçin.';

// Çalışma durumu son olaydan türer: olay yoksa ya da son olay devamsa iş çalışıyordur.
export function calismaDurumu(sonOlay: 'duraklat' | 'durdur' | 'devam' | null): CalismaDurumu {
  if (sonOlay === 'duraklat') return 'durakli';
  return sonOlay === 'durdur' ? 'durdu' : 'calisiyor';
}

// Sayım çalışırken ve duraklıyken serbest, durmuşken kapalıdır.
export function sayimIhlali(durum: EmirDurumu, calisma: CalismaDurumu): string | null {
  if (durum !== 'basladi') return BASLAMAMIS_EMIR;
  return calisma === 'durdu' ? DURUSTA_SAYIM : null;
}

export function duraklatmaIhlali(durum: EmirDurumu, calisma: CalismaDurumu): string | null {
  if (durum !== 'basladi') return BASLAMAMIS_EMIR;
  return calisma === 'calisiyor' ? null : CALISAN_DEGIL_DURAKLAT;
}

// Yalnız çalışırken durdurulur (duraklamış emir önce devam eder: durdurmak kilit alırdı); neden denetimi ayrıdır (nedenIhlali).
export function durdurmaIhlali(durum: EmirDurumu, calisma: CalismaDurumu): string | null {
  if (durum !== 'basladi') return BASLAMAMIS_EMIR;
  if (calisma === 'durdu') return DURMUS_DURDUR;
  return calisma === 'durakli' ? DURAKLI_DURDUR : null;
}

export function devamIhlali(durum: EmirDurumu, calisma: CalismaDurumu): string | null {
  if (durum !== 'basladi') return BASLAMAMIS_EMIR;
  return calisma === 'calisiyor' ? CALISAN_DEVAM : null;
}

// Sağlam toplam sıfırın altına inemez; emir adedini aşabilir (emir adedi üst sınır değildir; adımda giren adet sınırdır, #31).
export const saglamToplamIhlali = (mevcut: number, fark: number): string | null =>
  mevcut + fark < 0 ? SAGLAM_EKSIYE_INER : null;

// Denetim #31: bir adımın sağlamı (karar bekleyen dahil) o adıma girenden fazla olamaz. Giren, önceki adımın sağlamı ve bu adımda
// katılan kollar, aynı sırada bölünenler düşülür (fason gidişiyle aynı hesap). İlk adımda giren bilinmez (null): üst sınır yoktur.
export const ADIM_GIRDI_ASIMI = 'Adımın sağlamı bu adıma giren adedi aşamaz.';
export const adimGirdiAsimiIhlali = (giren: number | null, mevcut: number, fark: number): string | null =>
  giren !== null && fark > 0 && mevcut + fark > giren ? ADIM_GIRDI_ASIMI : null;

// UE-HD-1 (kart #1194): hurda düzeltmesi (eksi adet) toplam hurdayı sıfırın altına indiremez.
export const hurdaToplamIhlali = (mevcut: number, fark: number): string | null =>
  mevcut + fark < 0 ? HURDA_EKSIYE_INER : null;

interface Neden { aktif: boolean }

export function durusNedeniIhlali(neden: Neden | null): string | null {
  if (neden === null) return DURUS_NEDENI_YOK;
  return neden.aktif ? null : DURUS_NEDENI_PASIF;
}

export function hurdaNedeniIhlali(neden: Neden | null): string | null {
  if (neden === null) return HURDA_NEDENI_YOK;
  return neden.aktif ? null : HURDA_NEDENI_PASIF;
}

// Sayaç int4'te tutulur (emrin sağlam adedi de); aşan istek 500 değil anlamlı ret alır.
export const AZAMI_TOPLAM = 2147483647;
export const TOPLAM_ASIMI = 'Sayaç üst sınırı aşılır; bu adet eklenemez.';
export const toplamAsimiIhlali = (mevcut: number, fark: number): string | null =>
  mevcut + fark > AZAMI_TOPLAM ? TOPLAM_ASIMI : null;

export const ADIM_YOK = 'Adım bu emirde bulunamadı.';
export const ADIM_BASLAMAMIS = 'Adımlar yalnız başlamış emirde işaretlenir.';

// Adım işaretleme çalışma durumundan bağımsızdır (çalışırken, duraklıyken, durmuşken); yalnız başlamış emirde.
export const adimIhlali = (durum: EmirDurumu): string | null => (durum === 'basladi' ? null : ADIM_BASLAMAMIS);

// Aynı duruma yeniden ayarlama olay yazmaz: çift dokunuş defteri kirletmez.
export const adimDegisiyorMu = (suAnTamam: boolean, istenen: boolean): boolean => suAnTamam !== istenen;

/* ---------------- iş emirli üretim emri (K1, K3; kart #262) ---------------- */

export type IsEmriDurumu = 'bekliyor' | 'calisiyor' | 'tamam';
export type IsEmriKaynakTuru = 'makine' | 'kisi' | 'fason';

export const ISTASYONSUZ_ADIM = 'Sıradaki iş emrinin kaynağı yok (tezgahsız) ya da fason; plan kaynak atayınca başlatılır.';
export const IS_EMRI_YOK = 'İş emri bulunamadı.';
export const IS_EMIRSIZ = 'Üretim emrinde en az bir iş emri olmalı.';
export const OP_YINELENDI = 'Aynı operasyon numarası iki iş emrinde olamaz.';
export const SIRA_YINELENDI = 'Aynı sıra iki iş emrinde olamaz.';
export const FASON_TERMINSIZ = 'Fason iş emrinin termin günü olmalı; süresi olmaz.';
export const TERMIN_FASON_DISI = 'Termin günü yalnız fason iş emrinde olur.';
export const DEVIR_TUTARSIZ = 'Devir adedi yalnız akışlı iş emrinde ve sıfırdan büyük olur.';
export const TESLIM_ONCE = 'Teslim başlangıçtan önce olamaz.';
export const PLANA_AL_DURUMU = 'Yalnız taslak emir plana alınır.';
export const ADIMLI_IPTAL_DURUMU = 'Yalnız hiç iş emri başlamamış taslak ya da planlı emir iptal edilir.';
export const ACIK_DEGIL = 'Bitmiş, iptal edilmiş ya da arşivdeki emir değişmez.';
export const SIPARIS_SATIRI_YOK = 'Sipariş satırı bulunamadı.';
export const SIPARIS_SATIRI_PROJESIZ = 'Sipariş satırına bağlanan emir, o siparişten açılmış bir projeye bağlı olmalı.';
export const SIPARIS_SATIRI_PROJE_DISI = 'Sipariş satırı emrin projesinin siparişine ait değil.';
export const SIPARIS_SATIRI_ONAYSIZ = 'Yalnız onaylı siparişin satırına emir bağlanır.';
export const SIPARIS_SATIRI_MALZEME = 'Sipariş satırının malzemesi emrin malzemesiyle aynı olmalı.';
export const PROJE_ZORUNLU = 'Üretim emri bir projeyle açılmalı.';
export const PROJE_GECERSIZ = 'Proje bulunamadı ya da aktif değil.';
export const SIPARIS_SATIRI_SECILMELI = 'Projenin siparişinde bu malzemenin birden çok satırı var; sipariş satırı seçilmeli.';
// 224: müşteriye giden emir projeyle açılır, plan bedeli ve proje maliyeti sipariş satırından okunur. Stoğa üretim, rework ve bakım-deneme
// emrinin müşterisi yoktur.
export const PROJESIZ_ACILABILEN_TURLER: readonly string[] = ['stok', 'rework', 'bakim_deneme'];
export const projeZorunluMu = (emirTuru: string): boolean => !PROJESIZ_ACILABILEN_TURLER.includes(emirTuru);
export const ONCELIK_BASLAMIS = 'Yalnız başlamamış (taslak ya da planlı) emrin önceliği doğrudan değişir.';
export const KAYNAK_BEKLEYENDE = 'Yalnız bekleyen iş emrinin kaynağı değişir.';
export const FASON_KAYNAGI_SABIT = 'Fason iş emrinin kaynağı rotadan gelir; plan ya da ekran makine ya da kişi atayamaz.';
export const KAYNAK_YOK = 'Kaynak bulunamadı ya da pasif.';
export const FASON_DEGIL = 'Bu iş emri fason değil; gidiş ve dönüş yalnız fason iş emrinde yazılır.';
export const FASON_SIRASI_DEGIL = 'Önceki iş emirleri bitmeden fasona gönderilmez.';
export const FASON_BITTI = 'Bu fason iş emri tamamlandı; gidiş ve dönüş yazılmaz.';
export const FASON_GIDIS_ASIMI = 'Gönderilen toplam, fasona gönderilebilecek adedi aşar.';
export const FASON_DONUS_ASIMI = 'Dönen toplam, gönderilen adedi aşar.';
export const FASON_DONUSSUZ = 'Fasondan dönüş yazılmadan iş emri tamamlanmaz.';
export const FASON_DISARIDA = 'Fasonda parça var; hepsi dönmeden iş emri tamamlanmaz.';
export const TERMINAL_FASON = 'Fason iş emri operatörle başlamaz; gidiş ve dönüş kaydıyla ilerler.';
export const FIRMA_HATALISI_GKK_DISI = 'Firmada hurda ve Firmadan gelmedi yalnız fason adımının arkasındaki GKK adımında girilir.';
export const FIRMA_HATALISI_ASIMI = 'Firmada hurda ve firmadan gelmeyen toplamı, fasona gönderilen ile dönen arasındaki farkı aşamaz.';

// Sıradaki iş emri bitmemiş ilk iş emridir (sıra numarasıyla); terminal ve plan bunu işler (UE-04, karar S2).
export function siradakiIsEmri<T extends { sira: number; durum: IsEmriDurumu }>(isEmirleri: readonly T[]): T | null {
  return [...isEmirleri].sort((a, b) => a.sira - b.sira).find((a) => a.durum !== 'tamam') ?? null;
}

// Ekranın gösterdiği emir durumu: iş emirli emir adımlar arasında satırda planlıdır (sıradaki istasyonun terminaline düşer),
// ama bir iş emri başladıysa emir üretimdedir.
export function gorunenDurum<D extends string>(durum: D, baslamisIsEmriVar: boolean): D | 'basladi' {
  return durum === 'planli' && baslamisIsEmriVar ? 'basladi' : durum;
}

// Ana sayfa özeti: emir listesinin gösterdiği durumla (gorunenDurum) sayar; açık emir taslak, planlı ya da başladı, geciken yalnız açık emirdir.
export function adimliOzetSay(gruplar: readonly { durum: EmirDurumu; baslamis: boolean; gecikmis: boolean; sayi: number }[]) {
  const ozet = { taslak: 0, planli: 0, basladi: 0, acik: 0, geciken: 0, biten: 0 };
  for (const g of gruplar) {
    const durum = gorunenDurum(g.durum, g.baslamis);
    if (durum === 'bitti') ozet.biten += g.sayi;
    if (durum === 'taslak' || durum === 'planli' || durum === 'basladi') {
      ozet[durum] += g.sayi;
      ozet.acik += g.sayi;
      if (g.gecikmis) ozet.geciken += g.sayi;
    }
  }
  return ozet;
}

// İş emirli emir adımlar arasında satırda yeniden 'planli' olur (sıradaki istasyonda başlatılsın diye). Dışarıya ilk adım başlayınca
// 'basladi' görünür; başlama ilk adımın başlaması, sağlam adet (emir bitmeden) son biten adımın sağlamıdır (deneme H3).
export function adimlardanGorunum<D extends string>(
  e: { durum: D; baslama: string | null; saglamAdet: number | null },
  adimlar: readonly { sira: number; durum: string; baslama: string | null; saglamAdet: number | null }[],
): { durum: D | 'basladi'; baslama: string | null; saglamAdet: number | null } {
  const baslamis = adimlar.filter((a) => a.baslama !== null).map((a) => a.baslama!).sort();
  const sonBiten = adimlar.filter((a) => a.durum === 'tamam').sort((a, b) => b.sira - a.sira)[0];
  return {
    durum: gorunenDurum(e.durum, adimlar.some((a) => a.durum !== 'bekliyor')),
    baslama: e.baslama ?? baslamis[0] ?? null,
    saglamAdet: e.saglamAdet ?? sonBiten?.saglamAdet ?? null,
  };
}

export interface IsEmriGirdisiOzeti {
  sira: number;
  opNo: number;
  kaynakTuru: IsEmriKaynakTuru | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  terminGun: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
}

// Açılışta iş emirlerinin tutarlılığı; ilk ihlal döner. Tablonun kısıtları aynı kuralları ikinci kez korur.
export function isEmirleriIhlali(isEmirleri: readonly IsEmriGirdisiOzeti[]): string | null {
  if (isEmirleri.length === 0) return IS_EMIRSIZ;
  if (new Set(isEmirleri.map((i) => i.opNo)).size !== isEmirleri.length) return OP_YINELENDI;
  if (new Set(isEmirleri.map((i) => i.sira)).size !== isEmirleri.length) return SIRA_YINELENDI;
  for (const i of isEmirleri) {
    if (i.kaynakTuru === 'fason') {
      if (i.terminGun === null || i.ayarSuresiDk !== null || i.birimSureDk !== null) return FASON_TERMINSIZ;
    } else if (i.terminGun !== null) {
      return TERMIN_FASON_DISI;
    }
    if ((i.bagimlilik === 'akisli') !== (i.devirAdedi !== null) || (i.devirAdedi !== null && i.devirAdedi <= 0)) return DEVIR_TUTARSIZ;
  }
  return null;
}

export const teslimIhlali = (baslangic: string | null, teslim: string | null): string | null =>
  baslangic !== null && teslim !== null && teslim < baslangic ? TESLIM_ONCE : null;

export const planaAlIhlali = (durum: EmirDurumu, arsiv: boolean): string | null =>
  !arsiv && durum === 'taslak' ? null : PLANA_AL_DURUMU;

// UE-06: emir silinmez; yalnız hiçbir iş emri başlamamış taslak ya da planlı emir iptal edilir.
export function adimliIptalIhlali(durum: EmirDurumu, arsiv: boolean, baslamisIsEmriVar: boolean): string | null {
  if (arsiv || baslamisIsEmriVar) return ADIMLI_IPTAL_DURUMU;
  return durum === 'taslak' || durum === 'planli' ? null : ADIMLI_IPTAL_DURUMU;
}

// Plan bilgisi (öncelik, başlangıç, teslim) ve kaynak yalnız açık emirde değişir.
export const acikEmirIhlali = (durum: EmirDurumu, arsiv: boolean): string | null =>
  !arsiv && (durum === 'taslak' || durum === 'planli' || durum === 'basladi') ? null : ACIK_DEGIL;

// 163 a: öncelik plan senaryosu açmadan yalnız başlamamış emirde doğrudan değişir; başlamış emrin sırası atölyede kurulmuştur.
export const oncelikDegisimIhlali = (durum: EmirDurumu, arsiv: boolean): string | null =>
  !arsiv && (durum === 'taslak' || durum === 'planli') ? null : ONCELIK_BASLAMIS;

// 176 a: sipariş, proje, emir zinciri. Satır emrin projesinin siparişindendir, sipariş onaylıdır, malzeme aynıdır.
export function siparisSatiriIhlali(
  satir: { siparisId: number; siparisDurumu: string; malzemeNo: number } | null, projeSiparisId: number | null | undefined, malzemeNo: number,
): string | null {
  if (satir === null) return SIPARIS_SATIRI_YOK;
  if (projeSiparisId === undefined || projeSiparisId === null) return SIPARIS_SATIRI_PROJESIZ;
  if (satir.siparisId !== projeSiparisId) return SIPARIS_SATIRI_PROJE_DISI;
  if (satir.siparisDurumu !== 'onayli') return SIPARIS_SATIRI_ONAYSIZ;
  return satir.malzemeNo === malzemeNo ? null : SIPARIS_SATIRI_MALZEME;
}

// Emre bağlanabilecek satırlar: projenin onaylı siparişinde emrin malzemesiyle aynı malzemeli satırlar (176 a). Açılış seçenekleri de bunu
// gösterir, ekran sunucunun kabul etmeyeceği satırı sunmasın.
export function adaySatirlar<S extends { malzemeNo: number }>(siparis: { durum: string; satirlar: readonly S[] } | null, malzemeNo: number): S[] {
  return siparis === null || siparis.durum !== 'onayli' ? [] : siparis.satirlar.filter((x) => x.malzemeNo === malzemeNo);
}

// 224: satırı verilmeyen emir, projenin onaylı siparişinde aynı malzemeli tek satır varsa ona bağlanır; birden çoksa seçilmesi istenir;
// hiç yoksa (yarımamul, onaysız sipariş) satırsız açılır.
export function kendiligindenSatir(
  siparis: { durum: string; satirlar: readonly { id: number; malzemeNo: number }[] } | null, malzemeNo: number,
): { satirId: number | null } | { ihlal: string } {
  const adaylar = adaySatirlar(siparis, malzemeNo);
  if (adaylar.length > 1) return { ihlal: SIPARIS_SATIRI_SECILMELI };
  return { satirId: adaylar[0]?.id ?? null };
}

// 1713 (1682 b): iş emrinin süresi kaynağının süresidir. Açılışta rotadan kopyalanan adaylar kendi süresini taşır; seçilen kaynak bir adaysa
// süre o adaydan gelir ve eski ana kaynak süresiyle adaylara geçer (takas), ki plan sonra eski tezgâha dönerse onun süresi kaybolmasın.
// Seçilen kaynak aday değilse (aynı kaynak, rotada olmayan kaynak) süre ve adaylar değişmez: bilinmeyen süre uydurulmaz. Kaynaksız ana satırın
// süresi adaya geçemez (adayın makinesi ya da kişisi olmalı).
export interface KaynakRef { makineId: number | null; kisiId: number | null }
export interface SureliKaynak extends KaynakRef { ayarSuresiDk: string | null; birimSureDk: string | null }
const ayniKaynakMi = (a: KaynakRef, b: KaynakRef) => (a.makineId !== null && a.makineId === b.makineId) || (a.kisiId !== null && a.kisiId === b.kisiId);
export function kaynakSuresi(
  mevcut: SureliKaynak, yeni: KaynakRef, adaylar: readonly SureliKaynak[],
): { sure: { ayarSuresiDk: string | null; birimSureDk: string | null }; cikanAday: KaynakRef; girenAday: SureliKaynak | null } | null {
  if (ayniKaynakMi(mevcut, yeni)) return null;
  const aday = adaylar.find((a) => ayniKaynakMi(a, yeni));
  if (aday === undefined) return null;
  const girenAday = mevcut.makineId !== null || mevcut.kisiId !== null
    ? { makineId: mevcut.makineId, kisiId: mevcut.kisiId, ayarSuresiDk: mevcut.ayarSuresiDk, birimSureDk: mevcut.birimSureDk } : null;
  return { sure: { ayarSuresiDk: aday.ayarSuresiDk, birimSureDk: aday.birimSureDk }, cikanAday: { makineId: aday.makineId, kisiId: aday.kisiId }, girenAday };
}

export function kaynakDegisimIhlali(isEmri: { durum: IsEmriDurumu; kaynakTuru: IsEmriKaynakTuru | null }): string | null {
  if (isEmri.kaynakTuru === 'fason') return FASON_KAYNAGI_SABIT;
  return isEmri.durum === 'bekliyor' ? null : KAYNAK_BEKLEYENDE;
}

// UE-URY: açılmış emirde adımın üretim yeri (içeride ya da fason) yalnız adım başlamadan ve fasona parça gitmeden değişir; rota değişmez.
export type UretimYeri = 'ic' | 'fason';
export const URETIM_YERI_BASLAMIS = 'Başlamış ya da bitmiş adımın üretim yeri değişmez; yalnız başlamamış adım içeriye ya da fasona alınır.';
export const URETIM_YERI_FASON_HAREKETI = 'Bu adımda fasona gönderim yazılmış; üretim yeri değişmez.';
// Termin isteğe bağlıdır (kullanıcı kararı, CA-2): boşsa plan süreyi geçmiş teslimattan ya da FASON_VARSAYILAN_GUN'den alır.
export const URETIM_YERI_FASON_EKSIK = 'Fasona alınan adımda fason firma olmalı; termin girilirse 1-365 gün.';
export const URETIM_YERI_IC_EKSIK = 'İçeriye alınan adımda fason firma ve termin günü verilmez.';

export function uretimYeriIhlali(
  isEmri: { durum: IsEmriDurumu; fasonHareketiVar: boolean },
  istenen: { yer: UretimYeri; firmaId: number | null; terminGun: number | null },
): string | null {
  if (istenen.yer === 'fason') {
    if (istenen.firmaId === null || (istenen.terminGun !== null && (istenen.terminGun < 1 || istenen.terminGun > 365))) return URETIM_YERI_FASON_EKSIK;
  } else if (istenen.firmaId !== null || istenen.terminGun !== null) {
    return URETIM_YERI_IC_EKSIK;
  }
  if (isEmri.durum !== 'bekliyor') return URETIM_YERI_BASLAMIS;
  return isEmri.fasonHareketiVar ? URETIM_YERI_FASON_HAREKETI : null;
}

// Kişinin iş emrindeki istasyonu: o gün geçerli istasyon atamalarından en büyük yüzdeli olanı; eşitlikte küçük istasyon
// kimliği (rotadaki seçimle aynı; seçim okuyan modüldedir, IR5 b).
export function kisininIstasyonu(atamalar: readonly { kisiId: number; istasyonId: number; yuzde: string }[], kisiId: number): number | null {
  let enIyi: { istasyonId: number; yuzde: number } | null = null;
  for (const a of atamalar) {
    if (a.kisiId !== kisiId) continue;
    const yuzde = Number(a.yuzde);
    if (enIyi === null || yuzde > enIyi.yuzde || (yuzde === enIyi.yuzde && a.istasyonId < enIyi.istasyonId)) enIyi = { istasyonId: a.istasyonId, yuzde };
  }
  return enIyi?.istasyonId ?? null;
}

export interface FasonDurumu {
  durum: IsEmriDurumu;
  fason: boolean;
  siradaki: boolean;
  gonderilen: number;
  donenSaglam: number;
  donenHurda: number;
  // Fasona gidebilecek en çok adet: önceki iş emrinin sağlam adedi, ilk iş emriyse emir adedi.
  gonderilebilir: number;
  // 1207 c: arkadaki GKK adımında Firmada hurda ya da Firmadan gelmedi diye hatalı sayılan; dönmemiş ama hesabı kapanmış adet.
  firmadaHatali?: number;
}

function fasonOrtak(f: FasonDurumu): string | null {
  if (!f.fason) return FASON_DEGIL;
  if (f.durum === 'tamam') return FASON_BITTI;
  return f.siradaki ? null : FASON_SIRASI_DEGIL;
}

// Kısmi gönderim serbesttir (kullanıcı kararı c); toplam, gönderilebilecek adedi aşamaz.
export function fasonGidisIhlali(f: FasonDurumu, adet: number): string | null {
  return fasonOrtak(f) ?? (f.gonderilen + adet > f.gonderilebilir ? FASON_GIDIS_ASIMI : null);
}

const hesabiKapanan = (f: FasonDurumu): number => f.donenSaglam + f.donenHurda + (f.firmadaHatali ?? 0);

// Dönen (sağlam + hurda) ve GKK'da firmada kalmış sayılan toplam gönderileni aşamaz.
export function fasonDonusIhlali(f: FasonDurumu, saglam: number, hurda: number): string | null {
  return fasonOrtak(f) ?? (hesabiKapanan(f) + saglam + hurda > f.gonderilen ? FASON_DONUS_ASIMI : null);
}

// Fason iş emri, gönderilenin hepsinin hesabı kapanınca tamamlanır: dönen ya da GKK'da Firmada hurda veya Firmadan gelmedi sayılan
// (1207 c). Sağlam adedi dönen sağlamdır.
export function fasonTamamIhlali(f: FasonDurumu): string | null {
  const ortak = fasonOrtak(f);
  if (ortak !== null) return ortak;
  if (hesabiKapanan(f) === 0) return FASON_DONUSSUZ;
  return hesabiKapanan(f) < f.gonderilen ? FASON_DISARIDA : null;
}

// 1208: fason adımının hemen arkasında GKK adımı yoksa emre otomatik GKK girer. Yalnız bitmemiş fason adımına ve arkasındaki adım
// başlamamışsa (başlamış adımın önüne girdi konmaz); op numarası iki adımın arasından, boş numara yoksa girmez (rota uyarısı görünür kalır).
export const GKK_TIPI = 'GKK';
export const OTOMATIK_GKK_ADI = 'GKK (otomatik)';
export const OTOMATIK_GKK = 'Otomatik GKK';
// Otomatik GKK rotada yoktur; rota emre yeniden uygulanırken bekleyeni kalkar ve yeniden konur (öteki ek adımlar uygulamayı durdurur).
export const otomatikGkkMi = (i: { tur: string; ekAciklama: string | null }): boolean => i.tur === 'ek' && i.ekAciklama === OTOMATIK_GKK;
export function gkkTipiSec<T extends { kod: string; grup: string; aktif: boolean }>(tipler: readonly T[]): T | null {
  return tipler.find((t) => t.aktif && t.grup === 'KAL' && t.kod === GKK_TIPI) ?? null;
}
export function otomatikGkkYerleri(
  adimlar: readonly { sira: number; opNo: number; operasyonTipiId: number; fasonFirmaId: number | null; durum: IsEmriDurumu }[], gkkTipiId: number,
): { oncekiOpNo: number; opNo: number }[] {
  const sirali = [...adimlar].sort((a, b) => a.sira - b.sira);
  const yerler: { oncekiOpNo: number; opNo: number }[] = [];
  for (const [n, a] of sirali.entries()) {
    if (a.fasonFirmaId === null || a.durum === 'tamam') continue;
    const sonraki = sirali[n + 1];
    if (sonraki !== undefined && (sonraki.operasyonTipiId === gkkTipiId || sonraki.durum !== 'bekliyor')) continue;
    const op = araOpNolari(a.opNo, sonraki?.opNo ?? null, 1)?.[0];
    if (op !== undefined) yerler.push({ oncekiOpNo: a.opNo, opNo: op });
  }
  return yerler;
}

// GKK adımı fason adımının hemen arkasındaki GKK tipli adımdır; girdisi fasona gönderilendir, dönen değil (1207 c). Fason adımı döner.
// Dallı rotada fason, GKK'nın öncülüdür; sırası bir küçük olan adım başka dalda olabilir.
export function gkkFasonu<T extends { id?: number; sira: number; operasyonTipiId: number; fasonFirmaId: number | null }>(
  adimlar: readonly T[], adim: { sira: number; operasyonTipiId: number; onculler?: readonly { id: number }[] | null }, gkkTipiId: number | null,
): T | null {
  if (gkkTipiId === null || adim.operasyonTipiId !== gkkTipiId) return null;
  const onculler = adetOnculleri(adimlar, adim);
  const onceki = onculler.length === 1 ? onculler[0] : undefined;
  return onceki !== undefined && onceki.fasonFirmaId !== null ? onceki : null;
}

// 1207 c: Firmada hurda ve Firmadan gelmedi yalnız GKK adımında, gönderilen eksi dönen kadar girilir.
export function firmaHatalisiIhlali(gkk: { gonderilen: number; donen: number; firmadaHatali: number } | null, adet: number): string | null {
  if (gkk === null) return FIRMA_HATALISI_GKK_DISI;
  return gkk.firmadaHatali + adet > gkk.gonderilen - gkk.donen ? FIRMA_HATALISI_ASIMI : null;
}

export type IsEmriPlani = { koru: number[]; guncelle: number[]; sil: number[]; ekle: number[]; sira: number[] };

// UE-02 güvenli kip: başlamış ya da bitmiş iş emri korunur; bekleyen iş emri rotadakiyle güncellenir, rotada yoksa çıkar; rotada
// olup emirde olmayan eklenir. Yeni sıra: korunanlar kendi sıralarıyla önce, sonra rotanın kalanları rota sırasıyla.
export function guvenliUygula(
  emir: readonly { opNo: number; sira: number; durum: IsEmriDurumu }[],
  rota: readonly { opNo: number }[],
): IsEmriPlani {
  const rotada = new Set(rota.map((r) => r.opNo));
  const sirali = [...emir].sort((a, b) => a.sira - b.sira);
  const koru = sirali.filter((a) => a.durum !== 'bekliyor').map((a) => a.opNo);
  const korunan = new Set(koru);
  const bekleyen = sirali.filter((a) => a.durum === 'bekliyor');
  const emirde = new Set(emir.map((a) => a.opNo));
  return {
    koru,
    guncelle: bekleyen.filter((a) => rotada.has(a.opNo)).map((a) => a.opNo),
    sil: bekleyen.filter((a) => !rotada.has(a.opNo)).map((a) => a.opNo),
    ekle: rota.filter((r) => !emirde.has(r.opNo)).map((r) => r.opNo),
    sira: [...koru, ...rota.map((r) => r.opNo).filter((o) => !korunan.has(o))],
  };
}

// Rotadaki yeni adım, emirde başlamış ya da bitmiş bir adımın önüne düşüyorsa emre eklenmez: güvenli kip onu korunan adımların
// arkasına koyardı ve adım rotadakinden başka sırada yapılırdı. Dönen, böyle adımların op numaraları (boşsa uygulanabilir).
export function oneDusenYeniAdimlar(plan: IsEmriPlani, rota: readonly { opNo: number }[]): number[] {
  const yer = new Map(rota.map((r, i) => [r.opNo, i]));
  const sonKorunan = Math.max(-1, ...plan.koru.map((op) => yer.get(op) ?? -1));
  return plan.ekle.filter((op) => (yer.get(op) ?? -1) < sonKorunan);
}

export const yeniAdimOndeIletisi = (oplar: readonly number[]): string =>
  `${oplar.map((o) => `OP ${String(o)}`).join(', ')} başlamış ya da bitmiş adımların önüne düşüyor; emre eklenmedi. Bu emirde adım ancak başlamamış adımların arasına ya da sona eklenebilir.`;

// Emrin malzeme ihtiyacı (brüt): bileşenin iş emrindeki adım miktarı x bir adet miktarı x (1 + bileşen firesi). Adım miktarı emir adedidir,
// o adımın ve ardıllarının (adımın çıktısını tüketen adımlar, zincirle) fire paylarıyla büyür: adet / Π(1 - pay); birden çok ardıl yolunda en
// büyüğü. Dallı rotada bir dalın firesi paralel dalı büyütmez. Bileşen miktarı mamul başınadır; dal çarpanı malzemeyi çarpmaz (1333 a).
// Çok katmanlı emirde (1476) alt düğümün bileşeni kendi rotasındaki gibi alt parça başınadır: kök başına adet (birimCarpani) ile çarpılır.
// Bölünmüş emrin kola kopyalanmayan adımları (bölünmeden önceki, dallı rotada paralel dal) alt partiler için de yapılmıştır: alt partinin
// (ağacıyla) adedi bu adımlara eklenir (kolAdimlari). Alt parti yalnız kendi adımlarını sayar; böylece malzeme ne kaybolur ne iki kez
// sayılır. Planlı birleşmeli kol birleşme adımı ve sonrasını taşımaz: o adımları üst kolun adedi için de yapar (birlesmeSira, üstün sırasıdır).
export function malzemeIhtiyaci(
  adet: number,
  isEmirleri: readonly { id: number; sira: number; opNo: number; firePayiYuzde: number; onculler?: readonly { id: number }[] | null; birimCarpani?: number | null }[],
  bilesenler: readonly { isEmriId: number; malzemeNo: number; miktar: number; fireYuzde: number }[],
  altPartiler: readonly { bolunmeSira: number; adet: number; birlesmeSira?: number | null }[] = [],
): { malzemeNo: number; opNo: number; brut: number }[] {
  const sirali = [...isEmirleri].sort((a, b) => a.sira - b.sira);
  const ardillar = new Map<number, number[]>();
  for (const ie of sirali) for (const o of adetOnculleri(sirali, ie)) ardillar.set(o.id, [...(ardillar.get(o.id) ?? []), ie.id]);
  // Alt parti kola kopyalanan adımları kendisi yapar; ötekileri (bölünmeden önceki, birleşmeden sonraki, paralel dal) emir yapar.
  const kolda = new Map(altPartiler.map((p) => [p, new Set(kolAdimlari(sirali, p.bolunmeSira, p.birlesmeSira ?? null).map((i) => i.id))]));
  const fireCarpani = new Map<number, number>();
  const adimMiktari = new Map<number, number>();
  for (let i = sirali.length - 1; i >= 0; i -= 1) {
    const ie = sirali[i];
    if (!ie) continue;
    const carpan = Math.max(1, ...(ardillar.get(ie.id) ?? []).map((a) => fireCarpani.get(a) ?? 1)) / (1 - ie.firePayiYuzde / 100);
    fireCarpani.set(ie.id, carpan);
    const tasinan = altPartiler.filter((p) => !kolda.get(p)!.has(ie.id)).reduce((t, p) => t + p.adet, 0);
    adimMiktari.set(ie.id, (adet + tasinan) * carpan * (ie.birimCarpani ?? 1));
  }
  const opNo = new Map(sirali.map((ie) => [ie.id, ie.opNo]));
  return bilesenler.flatMap((b) => {
    const m = adimMiktari.get(b.isEmriId);
    const op = opNo.get(b.isEmriId);
    return m === undefined || op === undefined ? [] : [{ malzemeNo: b.malzemeNo, opNo: op, brut: m * b.miktar * (1 + b.fireYuzde / 100) }];
  }).sort((a, b) => a.opNo - b.opNo || a.malzemeNo - b.malzemeNo);
}

/* ---------------- parti bölme ve birleştirme (kart #262, kullanıcı kararları A ve PB-K1..K6) ---------------- */

export const BOLME_ADIM_YOK = 'Bölünecek adım bu emirde yok.';
export const BOLME_BASLAMIS = 'Bölünen adım bitmemiş, sonraki adımlar başlamamış olmalı.';
export const BOLME_URETILMIS = 'Üretilen adet bölünemez: bölünen adet bu adımda henüz üretilmemiş adetten fazla olamaz.';
export const BOLME_ADET = 'Bölünen adet 1 ile elde kalan adedin bir eksiği arasında olmalı.';
export const BOLME_BIRLESME_ADIMI = 'Birleşme adımı bu emirde bölünen adımdan sonra gelen bir adım olmalı.';
export const BIRLESTIRME_KENDISI = 'Parti kendisiyle birleştirilemez.';
export const BIRLESTIRME_KOK = 'Yalnız bölünmüş parti birleştirilir.';
export const BIRLESTIRME_ALT_PARTILI = 'Alt partisi olan parti birleştirilemez; önce alt partileri birleştirin.';
export const BIRLESTIRME_AKRABA_DEGIL = 'Parti yalnız üst emrine ya da aynı adımdan bölünmüş kardeşine birleşir.';
export const BIRLESTIRME_ADIM = 'İki parti aynı adımda beklemeli ve o adımdan sonrası başlamamış olmalı.';
export const BIRLESTIRME_ADIMLAR_FARKLI = 'İki partinin kalan adımları aynı değil.';
export const BIRLESTIRME_EK_ADIM = 'Partinin bitmemiş rework, tamir ya da ek adımı var; önce onları bitirin.';
export const BIRLESTIRME_TASLAK = 'Taslak ile planlı parti birleştirilemez.';
export const EK_ADIM_KOLDA = 'Rework, tamir ve ek adım yalnız bölünmüş partiye (kola) konur.';
export const KOL_ALT_PARTILI = 'Alt partisi olan kolun adımları ve birleşme planı değişmez; önce alt partileri birleştirin.';
export const EK_ADIM_YERI_YOK = 'Ek adımın girdiği yerdeki adım bu kolda yok.';
export const EK_ADIM_BASLAMIS = 'Ek adım yalnız başlamamış adımların önüne ya da kolun sonuna girer.';
export const EK_ADIM_OP = 'Op numarası emirde tekil ve önceki ile sonraki adımın op numaraları arasında olmalı.';
export const EK_ADIM_ROTA = 'Rotadan gelen adım koldan çıkarılmaz.';
export const EK_ADIM_KALDIR_BASLAMIS = 'Yalnız başlamamış ek adım çıkarılır.';
export const BIRLESME_PLANI_KOLDA = 'Birleşme planı yalnız bölünmüş partide (kolda) olur.';
export const BIRLESME_PLANI_VAR = 'Kolun birleşme planı var; önce onu kaldırın.';
export const BIRLESME_PLANI_YOK = 'Kolun kaldırılacak birleşme planı yok.';
export const BIRLESME_ADIMI_YOK = 'Birleşme adımı üst emirde, kolun bölündüğü adımdan sonra gelen bir adım olmalı.';
export const BIRLESME_ADIMI_BASLAMIS = 'Üst emirde birleşme adımı başlamış; plan konamaz.';
export const BIRLESME_KOL_ILERLEDI = 'Kol birleşme adımına ulaşmış ya da adımlarını bitirmiş; plan konamaz, birleştir komutunu kullanın.';
export const BIRLESME_BEKLENIYOR = 'Bu adımda birleşecek parti henüz gelmedi; adım bekleyen olduğu için iki parti gelince başlar.';
export const BIRLESME_GELMEDI = 'Bu adımda birleşecek parti henüz gelmedi; adım parti gelmeden bitirilemez.';
export const KOL_ONCEKI_BITMEDI = 'Kol, üst emirde bölündüğü adımdan önceki adım bitmeden başlamaz.';

export type IsEmriTuru = 'rota' | 'rework' | 'tamir' | 'ek';
interface PartiAdimi { sira: number; opNo: number; durum: IsEmriDurumu; tur?: IsEmriTuru; id?: number; onculler?: readonly { id: number }[] | null; adetCarpani?: number | null }

export interface BolmeDurumu {
  durum: EmirDurumu;
  arsiv: boolean;
  adet: number;
  isEmirleri: readonly (PartiAdimi & { saglamAdet: number | null })[];
  // Bu emirden aynı sırada daha önce bölünmüş, açık alt partilerin (ağaçlarıyla) adedi: önceki adımın sağlamından çıkmıştır.
  ayniSiradanBolunen: number;
  // Bu adımda emre katılmış kolların çıkardığı sağlam: önceki adımın sağlamında yoktur, adıma girmiştir (UE-PB7).
  birlesenGelen?: number;
  // Bölünen adımda sayılmış adet (sağlam, hurda, karar bekleyen, red): çalışan adımda üretilen bölünemez (kart #125, Soru 121 a).
  bolunenIslenen?: number;
}

// Elde kalan: öncül adım(lar) bitmişse sağlamı (birden çok öncülde en az gelen, mamul birimiyle) ve bu adımda katılan kolların sağlamı,
// aynı sırada bölünmüş olanlar düşülerek; öncül yoksa ya da bitmemişse (ileri adımdan bölme, PB-K2) emir adedi (önceki bölmeler
// adetten düşmüştür). Öncül adetOnculleri'dendir: dallı rotada sıradaki önceki adım başka dalın adımı olabilir.
export function eldekiAdet(d: BolmeDurumu, sira: number): number {
  const adim = d.isEmirleri.find((i) => i.sira === sira) ?? { sira };
  const onculler = adetOnculleri(d.isEmirleri, adim);
  const gelen = onculler.length === 0 || onculler.some((o) => o.durum !== 'tamam')
    ? d.adet
    : Math.min(...onculler.map((o) => onculdenGelen(o.saglamAdet ?? 0, o, {}))) + (d.birlesenGelen ?? 0) - d.ayniSiradanBolunen;
  return Math.min(d.adet, gelen);
}

// Soru 121 a (UE-PB1, UE-PB3'ün yerine): bölünen adım çalışıyor olabilir, yalnız orada henüz üretilmemiş adet bölünür; bitmiş adımdan
// bölünmez, sonraki adımlar başlamamış olmalı. Önceki adımların bitmesi gerekmez. Planlı birleşme adımı bölünen adımdan sonra gelir (UE-PB8).
export function bolmeIhlali(d: BolmeDurumu, adimSira: number, adet: number, birlesmeOpNo: number | null = null): string | null {
  const acik = acikEmirIhlali(d.durum, d.arsiv);
  if (acik !== null) return acik;
  const bolunen = d.isEmirleri.find((i) => i.sira === adimSira);
  if (bolunen === undefined) return BOLME_ADIM_YOK;
  if (bolunen.durum === 'tamam' || d.isEmirleri.some((i) => i.sira > adimSira && i.durum !== 'bekliyor')) return BOLME_BASLAMIS;
  if (birlesmeOpNo !== null && !d.isEmirleri.some((i) => i.opNo === birlesmeOpNo && i.sira > adimSira)) return BOLME_BIRLESME_ADIMI;
  const elde = eldekiAdet(d, adimSira);
  if (!Number.isInteger(adet) || adet < 1 || adet >= elde) return BOLME_ADET;
  const islenen = bolunen.durum === 'bekliyor' ? 0 : Math.max(d.bolunenIslenen ?? 0, 0);
  return adet <= elde - islenen ? null : BOLME_URETILMIS;
}

export interface BirlestirmeTarafi {
  id: number;
  durum: EmirDurumu;
  arsiv: boolean;
  ustEmirId: number | null;
  bolunmeSira: number | null;
  acikAltPartiVar: boolean;
  isEmirleri: readonly PartiAdimi[];
}

// Kaynak kapanır, adedi hedefe geçer. Hedef kaynağın üst emri ya da aynı adımdan bölünmüş kardeşidir: bölünmeden önceki adımları
// ikisi için de aynı emir yapmıştır, malzeme hesabı birleşmeden sonra da tutar. İki taraf aynı op numarasında bekler (kolda ek adım
// sıraları kaydırır, op aynı adımı gösterir); kaynağın bitmemiş ek adımı varsa birleşme o adımı yok ederdi (UE-PB5).
export function birlestirmeIhlali(kaynak: BirlestirmeTarafi, hedef: BirlestirmeTarafi): string | null {
  if (kaynak.id === hedef.id) return BIRLESTIRME_KENDISI;
  const acik = acikEmirIhlali(kaynak.durum, kaynak.arsiv) ?? acikEmirIhlali(hedef.durum, hedef.arsiv);
  if (acik !== null) return acik;
  if (kaynak.ustEmirId === null) return BIRLESTIRME_KOK;
  if (kaynak.acikAltPartiVar) return BIRLESTIRME_ALT_PARTILI;
  const kardes = hedef.ustEmirId === kaynak.ustEmirId && hedef.bolunmeSira === kaynak.bolunmeSira;
  if (hedef.id !== kaynak.ustEmirId && !kardes) return BIRLESTIRME_AKRABA_DEGIL;
  if ((kaynak.durum === 'taslak') !== (hedef.durum === 'taslak')) return BIRLESTIRME_TASLAK;
  const kalan = (t: BirlestirmeTarafi) => {
    const s = siradakiIsEmri(t.isEmirleri);
    return s === null ? [] : [...t.isEmirleri].filter((i) => i.sira >= s.sira).sort((a, b) => a.sira - b.sira);
  };
  const [kk, hk] = [kalan(kaynak), kalan(hedef)];
  if (kk.some((i) => (i.tur ?? 'rota') !== 'rota')) return BIRLESTIRME_EK_ADIM;
  if (kk[0] === undefined || hk[0] === undefined || kk[0].opNo !== hk[0].opNo) return BIRLESTIRME_ADIM;
  if ([...kk, ...hk].some((i) => i.durum !== 'bekliyor')) return BIRLESTIRME_ADIM;
  const ops = (k: readonly PartiAdimi[]) => k.map((i) => i.opNo).join(',');
  return ops(kk) === ops(hk) ? null : BIRLESTIRME_ADIMLAR_FARKLI;
}

export interface KolDurumu {
  ustEmirId: number | null;
  birlesmeOpNo?: number | null;
  durum: EmirDurumu;
  arsiv: boolean;
  acikAltPartiVar: boolean;
  isEmirleri: readonly PartiAdimi[];
}

function kolOrtak(k: KolDurumu): string | null {
  const acik = acikEmirIhlali(k.durum, k.arsiv);
  if (acik !== null) return acik;
  if (k.ustEmirId === null) return EK_ADIM_KOLDA;
  return k.acikAltPartiVar ? KOL_ALT_PARTILI : null;
}

// UE-PB4: ek adım yalnız kola, başlamamış bölgeye girer; op numarası tekildir ve komşularının arasındadır (sıra op sırasını izler).
export function ekAdimIhlali(k: KolDurumu, ek: { oncekiOpNo: number | null; opNo: number }): string | null {
  return kolOrtak(k) ?? adimYeriIhlali(k.isEmirleri, ek, k.birlesmeOpNo ?? null);
}

// Eklenen adım başlamamış bölgeye girer; op numarası tekildir ve komşularının arasındadır (sıra op sırasını izler).
function adimYeriIhlali(isEmirleri: readonly PartiAdimi[], ek: { oncekiOpNo: number | null; opNo: number }, birlesmeOpNo: number | null): string | null {
  const sirali = [...isEmirleri].sort((a, b) => a.sira - b.sira);
  const yer = ek.oncekiOpNo === null ? -1 : sirali.findIndex((i) => i.opNo === ek.oncekiOpNo);
  if (ek.oncekiOpNo !== null && yer < 0) return EK_ADIM_YERI_YOK;
  const onceki = yer < 0 ? undefined : sirali[yer];
  const sonraki = sirali[yer + 1];
  if (sonraki !== undefined && sonraki.durum !== 'bekliyor') return EK_ADIM_BASLAMIS;
  if (sonraki === undefined && onceki?.durum === 'tamam') return EK_ADIM_BASLAMIS;
  if (sirali.some((i) => i.opNo === ek.opNo)) return EK_ADIM_OP;
  if ((onceki !== undefined && ek.opNo <= onceki.opNo) || (sonraki !== undefined && ek.opNo >= sonraki.opNo)) return EK_ADIM_OP;
  // Kolun sonuna giren adım üstteki birleşme adımından önce yapılır.
  if (sonraki === undefined && birlesmeOpNo !== null && ek.opNo >= birlesmeOpNo) return EK_ADIM_OP;
  return null;
}

// UE-RA-1..3 (B13): rotasız emrin adımları Reçete ve Rota'da eklenir, düzenlenir ve silinir. Rotalı emrin adımları rotadan gelir.
export const ROTALI_EMIR_ADIMI = 'Rotalı emrin adımları rotadan gelir.';
export const ROTASIZ_ADIM_BASLAMIS = 'Yalnız başlamamış adım düzenlenir ya da silinir.';
export const IS_EMRI_SIPARISE_BAGLI = 'Bu iş emri bir satın alma siparişine bağlı; önce siparişteki iş emri bağını kaldırın.';
export const IS_EMRI_STOK_HAREKETLI = 'Bu iş emrinin stok hareketi var, silinemez.';
export const IS_EMRI_MALIYETI_DONDURULMUS = 'Bu iş emrinin maliyeti projede dondurulmuş, silinemez.';
export const IS_EMRI_BAGLI_KAYIT = 'Bu iş emrine başka bir kayıt bağlı; önce o bağı kaldırın.';

interface RotasizEmirDurumu { durum: EmirDurumu; arsiv: boolean; kaynakRotaRevizyonId: number | null; isEmirleri: readonly PartiAdimi[] }

const rotasizOrtak = (e: RotasizEmirDurumu): string | null =>
  acikEmirIhlali(e.durum, e.arsiv) ?? (e.kaynakRotaRevizyonId === null ? null : ROTALI_EMIR_ADIMI);

export const rotasizAdimEkleIhlali = (e: RotasizEmirDurumu, ek: { oncekiOpNo: number | null; opNo: number }): string | null =>
  rotasizOrtak(e) ?? adimYeriIhlali(e.isEmirleri, ek, null);

// Düzenleme ve silme: yalnız bekleyen adım. Rotasız emir son adımı da silinip adımsız kalabilir (IS_EMIRSIZ bu emirde aranmaz).
export function rotasizAdimDegisimIhlali(e: RotasizEmirDurumu, opNo: number): string | null {
  const ortak = rotasizOrtak(e);
  if (ortak !== null) return ortak;
  const adim = e.isEmirleri.find((i) => i.opNo === opNo);
  if (adim === undefined) return IS_EMRI_YOK;
  return adim.durum === 'bekliyor' ? null : ROTASIZ_ADIM_BASLAMIS;
}

// Rota ile aynı kural (rota/kurallar.ts girdiOlabilirMi): ticari mal alınıp satılır, hizmet malzeme değildir; ikisi girdi olmaz.
// Rota bu modülü çağırır (ADR 0006), bu yüzden kural burada ayrıca tutulur.
const GIRDI_OLMAYAN_TURLER: readonly string[] = ['ticari_mal', 'hizmet'];
export const BILESEN_GECERSIZ = 'Bileşen aktif bir malzeme olmalı; ticari mal ve hizmet girdi olamaz.';
export const bilesenOlabilirMi = (m: { tur: string; onayDurumu: string } | null | undefined): boolean =>
  m != null && m.onayDurumu === 'aktif' && !GIRDI_OLMAYAN_TURLER.includes(m.tur);

export function ekAdimKaldirIhlali(k: KolDurumu, opNo: number): string | null {
  const ortak = kolOrtak(k);
  if (ortak !== null) return ortak;
  const adim = k.isEmirleri.find((i) => i.opNo === opNo);
  if (adim === undefined) return IS_EMRI_YOK;
  if ((adim.tur ?? 'rota') === 'rota') return EK_ADIM_ROTA;
  if (adim.durum !== 'bekliyor') return EK_ADIM_KALDIR_BASLAMIS;
  return k.isEmirleri.length > 1 ? null : IS_EMIRSIZ;
}

// UE-PB8: plan kolda, üstteki birleşme adımı bölünme adımından sonradır ve başlamamıştır; kolun o adım ve sonrasındaki adımları
// başlamamıştır (kaldırılırlar) ve önünde en az bir bitmemiş adım kalır.
export function birlesmePlaniIhlali(
  k: KolDurumu & { bolunmeSira: number | null },
  ust: { durum: EmirDurumu; arsiv: boolean; isEmirleri: readonly PartiAdimi[] },
  birlesmeOpNo: number,
): string | null {
  if (k.ustEmirId === null) return BIRLESME_PLANI_KOLDA;
  const ortak = kolOrtak(k) ?? acikEmirIhlali(ust.durum, ust.arsiv);
  if (ortak !== null) return ortak;
  if (k.birlesmeOpNo != null) return BIRLESME_PLANI_VAR;
  const hedef = ust.isEmirleri.find((i) => i.opNo === birlesmeOpNo);
  if (hedef === undefined || k.bolunmeSira === null || hedef.sira <= k.bolunmeSira) return BIRLESME_ADIMI_YOK;
  if (hedef.durum !== 'bekliyor') return BIRLESME_ADIMI_BASLAMIS;
  const sirali = [...k.isEmirleri].sort((a, b) => a.sira - b.sira);
  const kesim = sirali.findIndex((i) => i.opNo === birlesmeOpNo);
  if (kesim < 0) return BIRLESME_KOL_ILERLEDI;
  if (sirali.slice(kesim).some((i) => i.durum !== 'bekliyor')) return BIRLESME_KOL_ILERLEDI;
  return sirali.slice(0, kesim).some((i) => i.durum !== 'tamam') ? null : BIRLESME_KOL_ILERLEDI;
}

export function birlesmePlaniKaldirIhlali(k: KolDurumu): string | null {
  if (k.ustEmirId === null) return BIRLESME_PLANI_KOLDA;
  return kolOrtak(k) ?? (k.birlesmeOpNo == null ? BIRLESME_PLANI_YOK : null);
}

// UE-PB6, 6a: planlı birleşme adımı, kol gelmeden bekleyen bağımlılıkta başlamaz; hiçbir bağımlılıkta kol gelmeden bitmez.
// Akışlı (ya da bağımsız) adım gelen adet kadar başlar (PB-K3).
export function birlesmeBeklemeIhlali(
  adim: { opNo: number; bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz' },
  acikKollarinBirlesmeOplari: readonly number[],
  komut: 'baslat' | 'bitir',
): string | null {
  if (!acikKollarinBirlesmeOplari.includes(adim.opNo)) return null;
  if (komut === 'bitir') return BIRLESME_GELMEDI;
  return adim.bagimlilik === 'bekleyen' ? BIRLESME_BEKLENIYOR : null;
}

// UE-PB2: ileri adımdan bölünen kol, üst emrin bölünme adımından önceki adımı bitmeden başlamaz.
export function kolBaslamaIhlali(bolunmeSira: number | null, ustIsEmirleri: readonly PartiAdimi[] | null): string | null {
  if (bolunmeSira === null || ustIsEmirleri === null) return null;
  const onceki = [...ustIsEmirleri].filter((i) => i.sira < bolunmeSira).sort((a, b) => b.sira - a.sira)[0];
  return onceki === undefined || onceki.durum === 'tamam' ? null : KOL_ONCEKI_BITMEDI;
}

// Bölünen parti kolu üstün numarasını taşır; kaçıncı kol olduğu sona eklenir (katılan ve iptal kollar da sayılır, numara yeniden verilmez).
export const kolEmirNo = (ustNo: string, kolSirasi: number): string => `${ustNo}/${kolSirasi}`;

export const AYAR_YINELENDI = 'Bu iş için hazırlık zaten başladı; başlatınca hazırlık kapanır.';
export const AYAR_PLANLI_DEGIL = 'Hazırlık yalnız başlamamış (planlı) işte başlar.';

// Ayar yalnız planlı emirde başlar (başlatma ayarı kapatır) ve iş başına bir kez yazılır.
export function ayarIhlali(durum: EmirDurumu, ayarVar: boolean): string | null {
  if (durum !== 'planli') return AYAR_PLANLI_DEGIL;
  return ayarVar ? AYAR_YINELENDI : null;
}

export interface SureOlayi {
  olay: 'duraklat' | 'durdur' | 'devam';
  zaman: string;
}

export interface SureSayimi {
  tur: 'saglam' | 'hurda';
  adet: number;
  duzeltme: boolean;
  zaman: string;
}

export interface SureGirdisi {
  baslama: string | null;
  bitis: string | null;
  // Bitmemiş işte pencere bu ana kadar uzanır.
  simdi: string;
  ayarlar: readonly string[];
  olaylar: readonly SureOlayi[];
  sayimlar: readonly SureSayimi[];
}

export interface SureOzeti {
  saglam: number;
  hurda: number;
  hazirlikDk: number | null;
  brutBirimDk: number | null;
  netBirimDk: number | null;
  tekliAraliklarDk: number[];
  tekliOrtalamaDk: number | null;
}

const ms = (iso: string): number => new Date(iso).getTime();
const dakika = (sure: number): number => Math.round((sure / 60_000) * 100) / 100;

// Duraklama ve duruş aralıkları: duraklat ya da durdur ile sonraki devam arası; kapanmamışsa pencere sonuna kadar.
function durusAraliklari(olaylar: readonly SureOlayi[], son: number): [number, number][] {
  const araliklar: [number, number][] = [];
  let bas: number | null = null;
  for (const o of [...olaylar].sort((a, b) => ms(a.zaman) - ms(b.zaman))) {
    if (o.olay === 'devam') {
      if (bas !== null) araliklar.push([bas, ms(o.zaman)]);
      bas = null;
    } else bas ??= ms(o.zaman);
  }
  if (bas !== null) araliklar.push([bas, son]);
  return araliklar;
}

// Aralığın duruşlar düşülmüş (net) uzunluğu.
function netSure(bas: number, son: number, duruslar: readonly [number, number][]): number {
  const kesisen = duruslar.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, son) - Math.max(a, bas)), 0);
  return Math.max(0, son - bas - kesisen);
}

// Birim süre: brüt başlattan beri geçen süre ÷ (sağlam + hurda); net duraklama ve duruş düşülmüştür. Sayım yoksa null.
// Hazırlık başlatmadan önceki son ayar ile başlatma arasıdır. Tekli dizi art arda 1'er girilen sayımların net aralığıdır:
// ilk aralık başlatmadan ölçülür; toplu ya da düzeltme sayımı diziyi keser ve ardındaki ilk aralık sayılmaz.
export function isEmriSureOzeti(g: SureGirdisi): SureOzeti {
  const saglam = g.sayimlar.filter((s) => s.tur === 'saglam').reduce((t, s) => t + s.adet, 0);
  const hurda = g.sayimlar.filter((s) => s.tur === 'hurda').reduce((t, s) => t + s.adet, 0);
  const bos: SureOzeti = { saglam, hurda, hazirlikDk: null, brutBirimDk: null, netBirimDk: null, tekliAraliklarDk: [], tekliOrtalamaDk: null };
  if (g.baslama === null) return bos;
  const bas = ms(g.baslama);
  const son = ms(g.bitis ?? g.simdi);
  const oncekiAyarlar = g.ayarlar.map(ms).filter((a) => a <= bas);
  const hazirlikDk = oncekiAyarlar.length === 0 ? null : dakika(bas - Math.max(...oncekiAyarlar));
  const duruslar = durusAraliklari(g.olaylar, son);
  const adet = saglam + hurda;
  const tekliAraliklarDk: number[] = [];
  let onceki: number | null = bas;
  for (const s of [...g.sayimlar].sort((a, b) => ms(a.zaman) - ms(b.zaman))) {
    const an = ms(s.zaman);
    if (s.duzeltme || s.adet !== 1) {
      onceki = null;
      continue;
    }
    if (onceki !== null) tekliAraliklarDk.push(dakika(netSure(onceki, an, duruslar)));
    onceki = an;
  }
  return {
    saglam, hurda, hazirlikDk,
    brutBirimDk: adet > 0 ? dakika((son - bas) / adet) : null,
    netBirimDk: adet > 0 ? dakika(netSure(bas, son, duruslar) / adet) : null,
    tekliAraliklarDk,
    tekliOrtalamaDk: tekliAraliklarDk.length === 0
      ? null : Math.round((tekliAraliklarDk.reduce((t, a) => t + a, 0) / tekliAraliklarDk.length) * 100) / 100,
  };
}

export const REFAKAT_IPTAL = 'İptal edilmiş emrin refakat kartı basılmaz.';

// Refakat kartı emir başına tektir; iptal edilmiş (birleşip kapanan parti dahil) emirde basılmaz.
export const refakatIhlali = (durum: EmirDurumu): string | null => (durum === 'iptal' ? REFAKAT_IPTAL : null);

// QR yalnız kimlik taşır; ad, adet ve parça okutunca sunucudan okunur (basılan kart eskimez).
export const refakatQrMetni = (emirId: number): string => `${KOD_ONEKI['uretim-emri']}:${emirId}`;

// Başka çalışan varken katılım reddedilmez, uyarı döner: herkes kendi girdiğinden sorumludur, adet işin toplamına eklenir.
export const katilimUyarisi = (digerAdlari: readonly string[]): string | null =>
  digerAdlari.length === 0 ? null : `Bu işte ${digerAdlari.join(', ')} de çalışıyor; girdiğiniz adet aynı işin toplamına eklenir.`;

export const katilmaIhlali = (durum: EmirDurumu, calisma: CalismaDurumu, acikVar: boolean): string | null => {
  if (durum !== 'basladi') return BASLAMAMIS_EMIR;
  if (calisma !== 'calisiyor') return KATILIM_CALISMIYOR;
  return acikVar ? KATILIM_ACIK : null;
};

// Her adımın işleyeceği adet: taban (emir adedi ve bu adımı birlikte yapan kollar) önceki bitmiş adımın kaybı kadar azalır. Kayıp,
// bitmiş adımın tabanı ile sağlamı arasındaki farktır ve bitmemiş adımlardan sonrakilere taşınır; adet tabanı aşmaz (deneme "sonraki
// adımın hedefi hurdayı düşmüyor": OP10 40'tan 39 sağlam çıkınca OP20 39 parça işler).
// 1257 a: dallı adımda taban çarpanla büyür (bir mamul için o daldan kaç adet) ve kayıp mamul birimiyle öncüllerden gelir; birleştirmede en
// çok kaybeden dal belirler. Listesi olmayan (eski) adımın öncülü sırası bir küçük olan adımdır.
export function adimAdetleri(
  adimlar: readonly {
    sira: number; durum: string; saglamAdet: number | null; id?: number; onculler?: readonly { id: number }[] | null; adetCarpani?: number | null;
  }[],
  taban: (sira: number) => number,
): Map<number, number> {
  const sonuc = new Map<number, number>();
  const kayipCikan = new Map<number, number>();
  const sirali = [...adimlar].sort((x, y) => x.sira - y.sira);
  const sirasi = new Map(sirali.flatMap((a) => (a.id === undefined ? [] : [[a.id, a.sira] as const])));
  for (const [i, a] of sirali.entries()) {
    const carpan = a.adetCarpani ?? 1;
    const t = taban(a.sira) * carpan;
    const onculSiralari = a.onculler == null
      ? (i === 0 ? [] : [sirali[i - 1]!.sira])
      : a.onculler.flatMap((o) => { const s = sirasi.get(o.id); return s === undefined ? [] : [s]; });
    const kayip = Math.max(0, ...onculSiralari.map((s) => kayipCikan.get(s) ?? 0));
    sonuc.set(a.sira, Math.min(t, Math.max(0, Math.floor(t - kayip * carpan + 1e-9))));
    kayipCikan.set(a.sira, a.durum === 'tamam' && a.saglamAdet !== null ? (t - a.saglamAdet) / carpan : kayip);
  }
  return sonuc;
}

// Emri henüz açılmamış rotanın (planın deneme emri, satış teklifi kalemi) adım adetleri: adimAdetleri'nin kuralı, kayıpsız; dal adımı
// çarpanla büyür (1257 a). Plan çarpanı kendisi uygulamaz, adedi buradan alır. Anahtar OP no.
export function rotadanAdimAdetleri(adet: number, adimlar: readonly { opNo: number; adetCarpani?: number | null }[]): Map<number, number> {
  const adetler = adimAdetleri(adimlar.map((a, i) => ({ sira: i + 1, durum: 'bekliyor', saglamAdet: null, adetCarpani: a.adetCarpani ?? null })), () => adet);
  return new Map(adimlar.map((a, i) => [a.opNo, adetler.get(i + 1) ?? adet]));
}

// Kullanıcı kararı (CA-2): termini girilmemiş fason adım, satın almanın geçmiş teslimat tahmini yoksa bu kadar gün sürer.
export const FASON_VARSAYILAN_GUN = 7;
const GUN_MS = 24 * 60 * 60_000;

// Öncül zincirinde geriye, ilk iç adıma kadar bitmemiş fason adımların süresi: termin, yoksa tahmin, yoksa FASON_VARSAYILAN_GUN. Gönderilmiş
// (başlamış) fason adımda termin ilk gidişten sayılır: geçen gün düşülür, termini geçmiş adım beklemez (0). simdi verilmezse düşülmez.
// Zincir adetOnculleri'ndendir (B-2): dallı rotada paralel dalın fasonu bu adımı bekletmez; birleşme adımı öncül dallarından en uzun
// bekleyeni bekler. Listesi olmayan eski emirde zincir sıradır.
export function fasonBeklemesi(
  emrinIsEmirleri: readonly {
    id?: number; sira: number; fasonFirmaId: number | null; terminGun: number | null; durum: string; baslama?: string | null; tur?: string;
    ekAciklama?: string | null; onculler?: readonly { id: number }[] | null;
  }[], sira: number,
  tahmin: (x: { sira: number; fasonFirmaId: number }) => number | null = () => null, simdi?: number,
): number {
  type Adim = (typeof emrinIsEmirleri)[number];
  const bekleme = (a: Pick<Adim, 'sira' | 'onculler'>): number => Math.max(0, ...adetOnculleri(emrinIsEmirleri, a).map((x) => {
    // Otomatik GKK plana girmez (süresiz, kaynaksız): fasonun beklemesi arkasındaki adıma geçer.
    if (x.tur !== undefined && otomatikGkkMi({ tur: x.tur, ekAciklama: x.ekAciklama ?? null })) return bekleme(x);
    if (x.fasonFirmaId === null) return 0;
    if (x.durum === 'tamam') return bekleme(x);
    const sure = x.terminGun ?? tahmin({ sira: x.sira, fasonFirmaId: x.fasonFirmaId }) ?? FASON_VARSAYILAN_GUN;
    const gecen = simdi !== undefined && x.baslama ? Math.max(0, (simdi - Date.parse(x.baslama)) / GUN_MS) : 0;
    return Math.max(0, sure - gecen) + bekleme(x);
  }));
  return bekleme(emrinIsEmirleri.find((x) => x.sira === sira) ?? { sira });
}

// Hazırlık durdurucuları (120-122 a, denetim #14). Madde emirde seçiliyse (sahibi modül söyler) ve tamam değilse, muafiyeti yoksa iş emri
// başlamaz. Kalibrasyon ve çizim muaf tutulamaz (121 a).
export const HAZIRLIK_ADI: Readonly<Record<HazirlikMaddesi, string>> = {
  cnc: 'CNC kurulumu (NC)', cizim: 'Çizim revizyonu', kalibrasyon: 'Ölçü aleti kalibrasyonu', 'ozel-proses': 'Özel proses',
};
export const MUAF_TUTULUR: ReadonlySet<HazirlikMaddesi> = new Set(MUAF_TUTULABILEN_MADDELER);
export interface HazirlikBilgisi { durum: 'yok' | 'suruyor' | 'tamam'; secildi: boolean }
export type HazirlikHali = 'tamam' | 'eksik' | 'muaf' | 'gerekmez' | 'bilinmiyor';
export function hazirlikHali(bilgi: HazirlikBilgisi | undefined, muaf: boolean): HazirlikHali {
  if (bilgi === undefined) return 'bilinmiyor';
  if (!bilgi.secildi) return 'gerekmez';
  if (bilgi.durum === 'tamam') return 'tamam';
  return muaf ? 'muaf' : 'eksik';
}
export function hazirlikEngeli(eksikler: readonly HazirlikMaddesi[]): string | null {
  if (eksikler.length === 0) return null;
  const adlar = eksikler.map((m) => HAZIRLIK_ADI[m]).join(', ');
  return eksikler.every((m) => MUAF_TUTULUR.has(m))
    ? `Hazırlık eksik: ${adlar}. Tamamlanınca ya da müdür gerekçeyle muaf tutunca başlar.`
    : `Hazırlık eksik: ${adlar}. Tamamlanmadan başlamaz.`;
}
export const MUAF_ZATEN = 'Bu madde bu emirde zaten muaf tutulmuş.';
export const MUAF_KAPALI_EMIR = 'Bitmiş ya da iptal edilmiş emirde muafiyet verilmez.';
export const MUAF_IS_EMRI_YOK = 'İş emri bu emre ait değil.';

// Denetim #25: çevrimdışı kuyruktan gelen kayıt kendi anıyla yazılır; emrin süre, vardiya ve OEE hesabı olay sırasına dayandığı için
// emrin son anından önceye ya da sunucu saatinden ileriye düşemez.
export const KAYIT_ANI_GECERSIZ = 'Kayıt anı geçerli bir zaman değil.';
export const KAYIT_ANI_ESKI = 'Kayıt anı emrin son olayından önce olamaz.';
export const KAYIT_ANI_ILERI = 'Kayıt anı ileride olamaz.';

export function kayitAniIhlali(an: string, sonAn: string | null, simdi: string): string | null {
  const t = Date.parse(an);
  if (Number.isNaN(t)) return KAYIT_ANI_GECERSIZ;
  if (t > Date.parse(simdi)) return KAYIT_ANI_ILERI;
  if (sonAn !== null && t < Date.parse(sonAn)) return KAYIT_ANI_ESKI;
  return null;
}

/* ---------------- refakat kartının adet sınırı (Soru 132, 136 a) ---------------- */

// Kartın bir adımdaki sınırı. Adımın girdisi kartın malzemesiyse sınır kartla verilen malzemeden çıkan parçadır; değilse önceki adımda
// bu kartla sayılan sağlamdır (karar bekleyen ve red sonraki adıma geçmez). Sarf tanımsız ilk adımda ve dal başında sınır yoktur (null).
// Öncül adetOnculleri'ndendir; birden çok öncülde en az gelen, dal çarpanıyla bu adımın birimine çevrilir.
// Sınır yumuşaktır: dolunca ekran uyarır, sayım durmaz.
export function kartSiniri(
  adimlar: readonly { id: number; sira: number; onculler?: readonly { id: number }[] | null; adetCarpani?: number | null }[],
  adimId: number,
  girdiler: readonly { isEmriId: number; malzemeNo: number; miktar: number }[],
  kart: { malzemeNo: number | null; verilen: number },
  oncekiSaglam: (isEmriId: number) => number,
): number | null {
  const girdi = kart.malzemeNo === null ? undefined : girdiler.find((g) => g.isEmriId === adimId && g.malzemeNo === kart.malzemeNo);
  // Ondalık bölmede 2,5 / 0,5 gibi tam sonuç 4,9999... çıkmasın: kuruşun altı yuvarlanır.
  if (girdi !== undefined && girdi.miktar > 0) return Math.max(0, Math.floor(kart.verilen / girdi.miktar + 1e-9));
  const adim = adimlar.find((a) => a.id === adimId);
  const onculler = adim === undefined ? [] : adetOnculleri(adimlar, adim);
  return adim === undefined || onculler.length === 0 ? null : Math.min(...onculler.map((o) => onculdenGelen(oncekiSaglam(o.id), o, adim)));
}

// Kartın sayıldığı adım: istasyondaki çalışan iş emri, yoksa istasyonun sıradaki iş emri; istasyon verilmezse ya da istasyonda
// bekleyen iş yoksa emrin terminaldeki adımı.
export function kartAdimi<T extends { sira: number; durum: IsEmriDurumu; istasyonId: number | null }>(isEmirleri: readonly T[], istasyonId: number | null): T | null {
  const burada = istasyonId === null ? [] : isEmirleri.filter((i) => i.istasyonId === istasyonId);
  return burada.find((i) => i.durum === 'calisiyor') ?? siradakiIsEmri(burada) ?? isEmirleri.find((i) => i.durum === 'calisiyor') ?? siradakiIsEmri(isEmirleri);
}

// 645 a: karar bekleyen satırlar (yazılış sırasıyla, eksi düzeltmeler dahil) üretim anlarına bölünür; eksi düzeltme en son sayılandan
// düşer. Aynı andaki satırlar birleşir, sıfıra inen an gelmez; toplam satırların toplamına eşittir. Önünde sayım kalmayan eksi
// (olağan akışta olmaz) kendi anında kalır.
export function kararAnlari(satirlar: readonly { zaman: string; adet: number }[]): { zaman: string; adet: number }[] {
  const anlar: { zaman: string; adet: number }[] = [];
  for (const { zaman, adet } of satirlar) {
    if (adet > 0) {
      const son = anlar.at(-1);
      if (son !== undefined && son.zaman === zaman && son.adet > 0) son.adet += adet;
      else anlar.push({ zaman, adet });
      continue;
    }
    let kalan = -adet;
    for (let i = anlar.length - 1; i >= 0 && kalan > 0; i -= 1) {
      const a = anlar[i]!;
      if (a.adet <= 0) continue;
      const dus = Math.min(a.adet, kalan);
      a.adet -= dus;
      kalan -= dus;
    }
    if (kalan > 0) anlar.push({ zaman, adet: -kalan });
  }
  return anlar.filter((a) => a.adet !== 0);
}

/* ---------------- paralel adım (kart 639; 626 a, 647 a, 649 a, 654 a) ---------------- */

export const ADIM_SECILMELI = 'Bu emirde birden çok adım açık; işlemi hangi adımda yaptığınızı seçin.';
export const ADIM_BASLAMIS = 'Bu adım zaten başlamış ya da bitmiş.';
export const ADIM_ACIK_DEGIL = 'Bu adım çalışmıyor; önce başlatın.';

/* ---------------- öncül listesi (1248 a, 1245 a): plan, terminal ve rota tek işlevden okur ---------------- */

export type OnculTuru = 'bekleyen' | 'akisli';
export const ONCUL_TURLERI: readonly OnculTuru[] = ['bekleyen', 'akisli'];
export const DAL_AZAMI = 20;

// Adımın bir öncülü; akışlı öncülde devirAdedi öncülden gelmesi beklenen adettir (bekleyende null).
export interface AdimOnculu { id: number; tur: OnculTuru; devirAdedi: number | null }

export interface OnculluAdim {
  id: number;
  sira: number;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi?: number | null;
  onculler?: readonly AdimOnculu[] | null;
}

// Öncül listesi olan adım (null değil; boş dizi dal başıdır, hiçbir adımı beklemez) yalnız listesindekileri bekler. Listesi null olan adım
// (1248 öncesi açılmış emir) plan motorunun bagOf kuralıdır (982 a, 1245 a): ilk adım ve bağımsız adım beklemez, bağımsız adımlar önde
// birikir; öteki adım son bağımlı adımı ve ondan sonra biriken bağımsızları bekler. Akışlı tür yalnız en yakın öncüle, ötekiler bekleyen.
// Sonuç eskiden yeniye sıralıdır (son öğe en yakın öncül). Öncül her zaman daha küçük sıralıdır; listede olup adımlarda olmayan ya da
// sırası büyük olan atlanır.
export function adimOnculleri<T extends OnculluAdim>(adimlar: readonly T[], adim: T): { adim: T; tur: OnculTuru; devirAdedi: number | null }[] {
  if (adim.onculler != null) {
    const kimlik = new Map(adimlar.map((a) => [a.id, a]));
    return adim.onculler.flatMap((o) => {
      const a = kimlik.get(o.id);
      return a === undefined || a.sira >= adim.sira ? [] : [{ adim: a, tur: o.tur, devirAdedi: o.tur === 'akisli' ? o.devirAdedi : null }];
    });
  }
  if (adim.bagimlilik === 'bagimsiz') return [];
  const oncekiler = adimlar.filter((a) => a.sira < adim.sira).sort((a, b) => b.sira - a.sira);
  const ilkSira = Math.min(...adimlar.map((a) => a.sira));
  const bekledigi: T[] = [];
  for (const a of oncekiler) {
    bekledigi.unshift(a);
    if (a.bagimlilik !== 'bagimsiz' || a.sira === ilkSira) break;
  }
  return bekledigi.map((a, n) => {
    const tur: OnculTuru = n === bekledigi.length - 1 ? adim.bagimlilik as OnculTuru : 'bekleyen';
    return { adim: a, tur, devirAdedi: tur === 'akisli' ? (adim.devirAdedi ?? null) : null };
  });
}

// 1346: fason adımı gidişe sırası gelince açılır. Öncül listeli (dallı) adımda öncüllerin hepsi bitince; paralel daldaki adım beklenmez.
// Listesi null olan eski emirde sıradaki iş emri kuralı (siradakiIsEmri) aynen kalır.
export function fasonSirasindaMi<T extends OnculluAdim & { durum: IsEmriDurumu }>(adimlar: readonly T[], adim: T): boolean {
  if (adim.onculler == null) return siradakiIsEmri(adimlar)?.id === adim.id;
  return adim.durum !== 'tamam' && adimOnculleri(adimlar, adim).every((o) => o.adim.durum === 'tamam');
}

// Okutulan emrin gidişe sırası gelmiş ilk fason adımı (sıra numarasıyla); yoksa null.
export function siradakiFasonAdimi<T extends OnculluAdim & { durum: IsEmriDurumu; fasonFirmaId: number | null }>(adimlar: readonly T[]): T | null {
  return [...adimlar].sort((a, b) => a.sira - b.sira).find((a) => a.fasonFirmaId !== null && fasonSirasindaMi(adimlar, a)) ?? null;
}

export const ONCUL_GECERSIZ = 'Öncül adım aynı emirde, kendinden önce gelen bir op olmalı; akışlı öncülün devir adedi artı, bekleyenin boş olur.';
export const DAL_GECERSIZ = `Dal etiketi boş olamaz, en çok ${DAL_AZAMI} karakterdir ve yalnız öncül listesiyle verilir.`;

// Açılış girdisindeki dal ve öncül listesi (op numarasıyla). Liste verilmeyen girdi eski kuraldır.
export function onculGirdisiIhlali(
  isEmirleri: readonly { sira: number; opNo: number; dal?: string | null; onculler?: readonly { opNo: number; tur: OnculTuru; devirAdedi: number | null }[] | null }[],
): string | null {
  const siraOp = new Map(isEmirleri.map((i) => [i.opNo, i.sira]));
  for (const i of isEmirleri) {
    if (i.dal != null && (i.dal.trim() === '' || i.dal.length > DAL_AZAMI || i.onculler == null)) return DAL_GECERSIZ;
    const goruldu = new Set<number>();
    for (const o of i.onculler ?? []) {
      const sira = siraOp.get(o.opNo);
      if (sira === undefined || sira >= i.sira || goruldu.has(o.opNo) || !ONCUL_TURLERI.includes(o.tur)) return ONCUL_GECERSIZ;
      if ((o.tur === 'akisli') !== (o.devirAdedi !== null) || (o.devirAdedi !== null && o.devirAdedi <= 0)) return ONCUL_GECERSIZ;
      goruldu.add(o.opNo);
    }
  }
  return null;
}

// 1476: çok katmanlı emir patlatmayla açılır ve her iş emri düğümünü taşır; tek katmanlı emirde düğüm yoktur. Stok adımı düğümün
// malzemesi ve rotadaki numarasıyla okur (1476-C). Düğüm adı patlatmanın yol biçimidir, rotadaki numara ve çarpan pozitiftir.
export const DUGUM_GECERSIZ = 'Çok katmanlı emrin adımları düğüm bilgisi taşımalı; tek katmanlı emirde düğüm olmaz.';
export function dugumGirdisiIhlali(
  patlatmaId: number | null,
  isEmirleri: readonly { dugum?: { ad: string; malzemeNo: number; kaynakOpNo: number; birimCarpani: string } | null }[],
): string | null {
  if (patlatmaId === null) return isEmirleri.some((i) => i.dugum != null) ? DUGUM_GECERSIZ : null;
  for (const i of isEmirleri) {
    const d = i.dugum;
    if (d == null || !/^0(\.[1-9][0-9]*)*$/.test(d.ad) || d.ad.length > 40 || !Number.isInteger(d.kaynakOpNo) || d.kaynakOpNo <= 0
      || !Number.isInteger(d.malzemeNo) || d.malzemeNo <= 0 || !(Number(d.birimCarpani) > 0)) return DUGUM_GECERSIZ;
  }
  return isEmirleri.some((i) => i.dugum?.ad === '0') ? null : DUGUM_GECERSIZ;
}

export interface ParalelAdim {
  id: number;
  sira: number;
  opNo: number;
  durum: IsEmriDurumu;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  onculler?: readonly AdimOnculu[] | null;
  adetCarpani?: number | null;
}

// 1257 a: öncülün sağlamı bu adımın birimine çevrilir (pim dalından 140 gelmiş, çarpan 2: birleştirmede 70 mamullük); aşağı yuvarlanır.
export const onculdenGelen = (saglam: number, oncul: { adetCarpani?: number | null }, adim: { adetCarpani?: number | null }): number =>
  Math.floor((saglam * (adim.adetCarpani ?? 1)) / (oncul.adetCarpani ?? 1) + 1e-9);

// Kola kopyalanan adımlar: bölünen adımdan birleşme adımına kadar. Dallı rotada (öncül listeli) yalnız bölünen adımdan öncül zinciriyle
// ulaşılan adımlar; sıra aralığındaki paralel dalın adımı ana partide kalır (B-3). Birleşmesiz bölme ve eski emir sıra aralığıdır.
export function kolAdimlari<T extends { id: number; sira: number; onculler?: readonly { id: number }[] | null }>(
  adimlar: readonly T[], adimSira: number, birlesmeSira: number | null,
): T[] {
  const aralik = adimlar.filter((i) => i.sira >= adimSira && (birlesmeSira === null || i.sira < birlesmeSira)).sort((a, b) => a.sira - b.sira);
  const bas = aralik[0];
  if (birlesmeSira === null || bas === undefined || bas.sira !== adimSira || bas.onculler == null) return aralik;
  const ulasilan = new Set([bas.id]);
  for (const i of aralik) if (adetOnculleri(adimlar, i).some((o) => ulasilan.has(o.id))) ulasilan.add(i.id);
  return aralik.filter((i) => ulasilan.has(i.id));
}

// Adımın adet aldığı öncüller (B-3): öncül listeli adımda listesi (dal başında boş), listesi olmayan (1248 öncesi) adımda sırası bir küçük
// olan adım. Dallı rotada sıradaki önceki adım başka dalın adımı olabilir; adet, bekleme ve sınır hesapları öncülü buradan okur.
export function adetOnculleri<T extends { id?: number; sira: number }>(
  adimlar: readonly T[], adim: { sira: number; onculler?: readonly { id: number }[] | null },
): T[] {
  if (adim.onculler != null) {
    const kimlik = new Map(adimlar.flatMap((a) => (a.id === undefined ? [] : [[a.id, a] as const])));
    return adim.onculler.flatMap((o) => { const a = kimlik.get(o.id); return a === undefined || a.sira >= adim.sira ? [] : [a]; });
  }
  const onceki = adimlar.filter((a) => a.sira < adim.sira).sort((a, b) => b.sira - a.sira)[0];
  return onceki === undefined ? [] : [onceki];
}

// Adımın en yakın öncülü (adimOnculleri'nin son öğesi): eski emirde sırası bir küçük olan adım; bağımsız adımın ve dal başının öncülü yoktur.
export function oncekiParalelAdim<T extends ParalelAdim>(adimlar: readonly T[], adim: T): T | null {
  return adimOnculleri(adimlar, adim).at(-1)?.adim ?? null;
}

// Komutun adımı verilmezse: terminalde açık (çalışan ya da duraklamış) adım tekse odur, yoksa sıradaki; birden çoksa adım sorulur.
// Fasondaki adım terminal komutu almaz, açık sayılmaz.
export function varsayilanAdim<T extends ParalelAdim & { fasonFirmaId: number | null }>(adimlar: readonly T[]): T | null | typeof ADIM_SECILMELI {
  const acik = adimlar.filter((a) => a.durum === 'calisiyor' && a.fasonFirmaId === null);
  if (acik.length > 1) return ADIM_SECILMELI;
  return acik[0] ?? siradakiIsEmri(adimlar);
}

export const KATILIM_TEK_ACIK_IS_EMIRSIZ = 'uretim_emirleri_katilim_is_emirsiz_tek_acik';

// 626 a: kuralı tutmayan başlatma reddedilmez, uyarı döner. Bekleyen öncül bitmeden, akışlı öncülden devir adedi gelmeden başlarsa uyarır;
// 1248 a ile her öncül ayrı denetlenir. oncekiSaglam: öncülün şu ana kadarki sağlamı (bitmişse kapanışı); sayı verilirse her öncüle aynısı.
export function siraDisiBaslatmaUyarisi<T extends ParalelAdim>(adimlar: readonly T[], adim: T, oncekiSaglam: number | ((oncul: T) => number)): string | null {
  const uyarilar = adimOnculleri(adimlar, adim).map(({ adim: onceki, tur, devirAdedi }) => {
    if (onceki.durum === 'tamam') return null;
    if (tur === 'bekleyen') return `OP ${onceki.opNo} bitmeden OP ${adim.opNo} başlatıldı.`;
    const devir = devirAdedi ?? 0;
    const gelen = onculdenGelen(typeof oncekiSaglam === 'number' ? oncekiSaglam : oncekiSaglam(onceki), onceki, adim);
    return gelen >= devir ? null : `OP ${onceki.opNo}'den devir adedi (${devir}) gelmeden OP ${adim.opNo} başlatıldı; gelen ${gelen}.`;
  });
  return uyarilariBirlestir(...uyarilar);
}

// Kuralı tutan, şimdi başlatılabilecek adımlar: bekleyen, istasyonlu ve fason olmayan; sıra dışı uyarısı vermeyenler.
// oncekiSaglam(adim, oncul): adımın o öncülünden gelen sağlam.
export function baslatilabilirAdimlar<T extends ParalelAdim & { istasyonId: number | null; fasonFirmaId: number | null }>(
  adimlar: readonly T[], oncekiSaglam: (adim: T, oncul: T) => number,
): number[] {
  return adimlar
    .filter((a) => a.durum === 'bekliyor' && a.istasyonId !== null && a.fasonFirmaId === null)
    .filter((a) => siraDisiBaslatmaUyarisi(adimlar, a, (o) => oncekiSaglam(a, o)) === null)
    .map((a) => a.id);
}

// 649 a (uyarılı ret): akışlı ya da bekleyen adım, öncülleri bitmeden bitirilemez; bağımsız adım ve dal başı bekleme olmadan biter.
export function oncekiBitmediIhlali(adimlar: readonly ParalelAdim[], adim: ParalelAdim): string | null {
  const onceki = adimOnculleri(adimlar, adim).find((o) => o.adim.durum !== 'tamam')?.adim;
  return onceki === undefined ? null : `OP ${onceki.opNo} bitmeden OP ${adim.opNo} bitirilemez; önce OP ${onceki.opNo} bitirilmeli.`;
}

// Adımın önceki adıma göre bakiyesi: önceki adımın sağlamı eksi bu adımda sayılan (sağlam, karar bekleyen, hurda). Artı: gelmiş, işlenmemiş;
// eksi: önceki adımın teslim etmediği parça sayıldı (647 a), önceki adım saydıkça kapanır. Önceki adımı olmayan adımda null.
export const adimEksigi = (giren: number | null, sayilan: number): number | null => (giren === null ? null : giren - sayilan);

// 647 a: sayım sınırı reddetmez, uyarır ve iz bırakır (aşan satır sayım defterinden okunur).
export function sayimAsimiUyarisi(giren: number | null, mevcut: number, fark: number, opNo: number | null): string | null {
  if (giren === null || fark <= 0 || mevcut + fark <= giren) return null;
  return `Bu adımda sayılan ${mevcut + fark}, önceki adımdan gelen ${giren}; ${mevcut + fark - giren} fazla${opNo === null ? '' : ` (OP ${opNo})`}. Önceki adımın sayımı eksik girilmiş olabilir.`;
}

// 654 a: önceki adım, sonraki adımın saydığından az sağlamla bitirilirse reddedilmez, uyarır.
export function eksiyleBitirmeUyarisi(kapanis: number, sonraki: { opNo: number; sayilan: number } | null): string | null {
  if (sonraki === null || sonraki.sayilan <= kapanis) return null;
  return `OP ${sonraki.opNo}'de bu adımdan ${sonraki.sayilan - kapanis} fazla parça sayıldı; eksi ${sonraki.sayilan - kapanis} kaldı.`;
}

// Birden çok uyarı tek metne birleşir; hiçbiri yoksa null.
export const uyarilariBirlestir = (...uyarilar: readonly (string | null)[]): string | null => {
  const dolu = uyarilar.filter((u): u is string => u !== null && u !== '');
  return dolu.length === 0 ? null : dolu.join(' ');
};

// 1188: hatalı giriş adımda üretimdir, adımın girdisini tüketir. Kola ayrılan hatalı adıma girenden zaten düşer (adimaGiren); tüketime
// yalnız kol açmadan emirde kalan hatalı girer, yoksa iki kez düşülür.
export interface AdimSayimi { saglam: number; kararBekliyor: number; hurda: number; hataliEmirde: number }
export const adimTuketimi = (s: AdimSayimi | undefined): number => (s === undefined ? 0 : s.saglam + s.kararBekliyor + s.hurda + s.hataliEmirde);

export interface EksikAdimi extends ParalelAdim, AdimSayimi {
  saglamAdet: number | null;
}

// Adım başına eksik (adimEksigi): öncül bitmişse kapanışı, bitmemişse o ana kadarki sağlamı adıma girer; birden çok öncülde (1248 a)
// en az geleni. Kol ve bölünme hesabı istemeyen (partisiz) emir içindir; partili emirde girdi adimaGiren ile okunur.
export function adimEksikleri(adimlar: readonly EksikAdimi[]): Map<number, number | null> {
  return new Map(adimlar.map((a) => {
    // Eski emirde adet yalnız en yakın öncülden gelir (bekleme kuralı bağımsızları da sayar, adet akışı saymaz).
    const onculler = adimOnculleri(adimlar, a).map((o) => o.adim);
    const gelen = (a.onculler == null ? onculler.slice(-1) : onculler).map((o) => onculdenGelen(o.durum === 'tamam' ? (o.saglamAdet ?? 0) : o.saglam, o, a));
    return [a.id, adimEksigi(gelen.length === 0 ? null : Math.min(...gelen), adimTuketimi(a))];
  }));
}

// Emir eksi bakiyeyle biterse reddedilmez, uyarır (tasarım 639 §5 "Emir bitişi"); eksi iz sayım defterinde kalır.
export function emirEksiUyarisi(adimlar: readonly { opNo: number; eksik: number | null }[]): string | null {
  const eksi = adimlar.filter((a) => a.eksik !== null && a.eksik < 0);
  if (eksi.length === 0) return null;
  return `Emir eksi bakiyeyle bitti: ${eksi.map((a) => `OP ${a.opNo}'de ${-(a.eksik ?? 0)} fazla sayıldı`).join(', ')}.`;
}

/* ---------------- hatalı parça (1033 a, 1034, 1036 a, 4 a, 7 a) ---------------- */

export const HATALI_ADIMSIZ = 'Hatalı parça yalnız adımlı emirde ayrılır.';
export const HATALI_NEDEN_YOK = 'Hatalı nedeni bulunamadı ya da pasif; aktif bir neden seçin.';
export const HATALI_AYRILAMAZ = 'Sonraki adım başladığı için hatalı parça bu adımdan ayrılamıyor; planlamaya bildirin.';
export const HATALI_ADET = 'Hatalı adet bu adımda henüz sayılmamış adedi aşamaz.';
export const HATALI_ROTASIZ = 'Rotasız emirde hatalı parça yalnız adımdaki bütün parça hatalıysa ayrılır; planlamaya bildirin.';
export const HATALI_OP_YERI = 'Kalite ve rework adımlarına op numarası açılamıyor: komşu adımların arasında boş numara yok; planlamaya bildirin.';
export const HATALI_KALITE_TIPI_YOK = 'Kalite kararı adımı için aktif kalite (KAL) operasyon tipi yok; Operasyon Tipleri\'nden ekleyin.';
// 1045 b: emrin kendisinde (4 a) bütün parça hurda ya da red olduysa emir durur. Ayrı durum yoktur: bekleyen adımın önceki adımı bu
// kararın sağlamsız kalite adımıdır. adimId verilirse yalnız o adımın başlaması sorulur.
export function hataliDurduMu(
  adimlar: readonly { id: number; sira: number; durum: string; saglamAdet: number | null; onculler?: readonly { id: number }[] | null }[],
  kayitlar: readonly { uretimEmriId: number; hedefEmirId: number; kaliteIsEmriId: number; karar: string | null }[],
  adimId?: number,
): boolean {
  const kok = new Set(kayitlar.filter((k) => k.hedefEmirId === k.uretimEmriId && (k.karar === 'hurda' || k.karar === 'red')).map((k) => k.kaliteIsEmriId));
  if (kok.size === 0) return false;
  // Dallı rotada kalite adımının ardılı öncül listesinden bulunur (B-3); paralel dalın adımı durmaz.
  return adimlar.some((a) => {
    if (a.durum !== 'bekliyor' || (adimId !== undefined && a.id !== adimId)) return false;
    return adetOnculleri(adimlar, a).some((o) => o.durum === 'tamam' && (o.saglamAdet ?? 0) === 0 && kok.has(o.id));
  });
}
export const HATALI_EMIR_DURDU = 'Emir durdu: bütün parça hurda ya da red oldu. Planlama yeniden başlatır ya da kapatır.';
export const HATALI_KALITE_ADIMI = 'Bu adım kalite kararıyla kapanır; kararı Kalite Merkezi\'nde verin.';
export const HATALI_KAYIT_YOK = 'Hatalı parça kaydı bulunamadı.';
export const HATALI_KARAR_VERILMIS = 'Bu hatalı parçanın kalite kararı verilmiş.';
export const HATALI_KALITE_BASLAMIS = 'Kalite adımı başka yoldan başlamış ya da kalkmış; karar yazılamaz.';
export const SARTLI_KABUL_NOTSUZ = 'Şartlı kabulde şartı not olarak yazın.';
// 1211: kabul ve şartlı kabul parçayı olduğu gibi ana partiye katar (rework ve tekrar adımları kalkar); şartlı kabulde şart notu zorunludur.
export const kabulKarariMi = (karar: string): boolean => karar === 'kabul' || karar === 'sartli_kabul';
export const hataliKararNotuIhlali = (karar: string, not: string | null): string | null =>
  karar === 'sartli_kabul' && (not === null || not.trim() === '') ? SARTLI_KABUL_NOTSUZ : null;
export const REWORK_KARARSIZ = 'Rework adımı yalnız kalite rework kararı verdikten sonra seçilir.';
export const REWORK_BASLAMIS = 'Rework adımı başlamış ya da bitmiş; değiştirilemez.';

// Kalite kararı adımının tipi: görsel muayene, yoksa ilk aktif kalite tipi (VARSAYIM: karar formu ölçüm değil, ayırma kararıdır).
export const KALITE_KARARI_TIPI = 'GM';
export function kaliteTipiSec<T extends { kod: string; grup: string; aktif: boolean }>(tipler: readonly T[]): T | null {
  const kalite = tipler.filter((t) => t.aktif && t.grup === 'KAL');
  return kalite.find((t) => t.kod === KALITE_KARARI_TIPI) ?? kalite[0] ?? null;
}

// Kalite adımının istasyonu: tipin varsayılan istasyonu kalite istasyonuysa o, değilse ilk aktif kalite istasyonu, o da yoksa hatanın
// görüldüğü istasyon (karar yine Kalite Merkezi'nden yazılır; adım yalnız bir istasyonda görünür).
export function kaliteIstasyonuSec<H extends number | null>(
  tip: { varsayilanIstasyonId: number | null }, istasyonlar: readonly { id: number; tip: string; aktif: boolean }[], hataIstasyonu: H,
): number | H {
  const kalite = istasyonlar.filter((i) => i.aktif && i.tip === 'kalite');
  return kalite.find((i) => i.id === tip.varsayilanIstasyonId)?.id ?? kalite[0]?.id ?? hataIstasyonu;
}

// alt ile ust arasında (ikisi hariç) art arda n op numarası; aralığın ortasından başlar (OP 20 ile 30 arasında iki adım 25, 26).
// ust null: sondan sonra, ilk numara alt + 5. Boş numara yetmezse null.
export function araOpNolari(alt: number, ust: number | null, n: number): number[] | null {
  const ilk = ust === null ? alt + 5 : Math.min(alt + Math.ceil((ust - alt) / 2), ust - n);
  if (ilk <= alt || n < 1) return null;
  return Array.from({ length: n }, (_, i) => ilk + i);
}

export type HataliYolu = 'kol' | 'kok';

// 1036 a: hatalı adet çalışan adımdan kola ayrılır, kol sonraki adımda ana partiye katılır (bölme kuralları, bolmeIhlali). Adımdaki
// bütün parça hatalıysa (adet 1 ya da hepsi) emir bölünemez; adımlar emrin kendisine girer (4 a). Sonraki adım başlamışsa iki yol da
// kapalıdır: parçanın yerine konacağı adım bekliyor olmalı. Hatalı parça bu adımda sayılmamış parçadır.
export function hataliIhlali(d: BolmeDurumu, adimSira: number, adet: number, rotali: boolean): string | null {
  const acik = acikEmirIhlali(d.durum, d.arsiv);
  if (acik !== null) return acik;
  const adim = d.isEmirleri.find((i) => i.sira === adimSira);
  if (adim === undefined) return BOLME_ADIM_YOK;
  if (adim.durum !== 'calisiyor') return ADIM_ACIK_DEGIL;
  if (d.isEmirleri.some((i) => i.sira > adimSira && i.durum !== 'bekliyor')) return HATALI_AYRILAMAZ;
  const elde = eldekiAdet(d, adimSira);
  if (!Number.isInteger(adet) || adet < 1 || adet > elde - Math.max(d.bolunenIslenen ?? 0, 0)) return HATALI_ADET;
  return adet < elde && !rotali ? HATALI_ROTASIZ : null;
}

export const hataliYolu = (d: BolmeDurumu, adimSira: number, adet: number): HataliYolu => (adet < eldekiAdet(d, adimSira) ? 'kol' : 'kok');

export function hataliKarariIhlali(
  kayit: { karar: string | null }, kaliteAdimi: { durum: IsEmriDurumu } | null, hedef: { durum: EmirDurumu; arsiv: boolean } | null,
): string | null {
  if (kayit.karar !== null) return HATALI_KARAR_VERILMIS;
  if (hedef === null || kaliteAdimi === null) return HATALI_KALITE_BASLAMIS;
  return acikEmirIhlali(hedef.durum, hedef.arsiv) ?? (kaliteAdimi.durum === 'bekliyor' ? null : HATALI_KALITE_BASLAMIS);
}

export function reworkAdimiIhlali(kayit: { karar: string | null }, adim: { durum: IsEmriDurumu } | null): string | null {
  if (kayit.karar !== 'rework' || adim === null) return REWORK_KARARSIZ;
  return adim.durum === 'bekliyor' ? null : REWORK_BASLAMIS;
}

// 7 a: fasonda termin girilmezse 7 gün. Fasonun süresi ve iç kaynağın termini isEmirleriIhlali ile reddedilir.
export const reworkTermini = <T extends { kaynak: { tur: IsEmriKaynakTuru } | null; terminGun: number | null }>(g: T): T =>
  (g.kaynak?.tur === 'fason' && g.terminGun === null ? { ...g, terminGun: FASON_VARSAYILAN_GUN } : g);

// Onaylı kapanış (UE-KP, 1072 a, 1074 a, 1075 a, 1076 a, 1077 b, 1079 a, 1080 a).
export const KAPANIS_YOK = 'Bu emrin kapanış kaydı yok: emrin üretimi bitmemiş.';
export const KAPANIS_TAMAM = 'Kapanış tamamlandı; değişiklik için müdür gerekçeyle geri açar.';
export const KAPANIS_TAMAM_DEGIL = 'Kapanış tamamlanmamış; geri açılacak bir şey yok.';
export const KAPANIS_EKSIK = 'Eksik madde var: önce sahibi modülde tamamlanmalı ya da müdür gerekçeyle muaf tutmalı.';
export const KAPANIS_ONAY_VERILMIS = 'Bu onay verilmiş.';
export const KAPANIS_MUAF_EKSIK_DEGIL = 'Yalnız eksik madde muaf tutulur.';
export const KAPANIS_KILITLI = 'Emrin kapanışı tamamlandı; kayıtları değişmez. Müdür gerekçeyle geri açabilir.';
export const KAPAT_DURMADI = 'Yalnız bütün parçası hurda ya da red olup duran emir kapatılır.';

// UE-KP1: madde hâli. Sahibi bağlı değilse ya da emri tanımıyorsa 'bilinmiyor' (durdurmaz); eksik madde muafsa 'muaf'.
export function kapanisMaddeHali(bilgi: KapanisMaddeBilgisi | undefined, muaf: boolean): KapanisMaddeHali {
  if (bilgi === undefined) return 'bilinmiyor';
  if (bilgi.durum === 'eksik') return muaf ? 'muaf' : 'eksik';
  return bilgi.durum;
}

// UE-KP2: sağlamsız emirde (1079 a) sevk ve stok, stok türündeki emirde (1075 a) sevk aranmaz; fason adımı olmayan emirde fason aranmaz.
export function gerekmeyenKapanisMaddeleri(e: { saglamAdet: number; emirTuru: EmirTuru; fasonVar: boolean }): ReadonlySet<KapanisMaddesi> {
  const l = new Set<KapanisMaddesi>();
  if (e.saglamAdet === 0) { l.add('sevkiyat'); l.add('stok'); }
  if (e.emirTuru === 'stok') l.add('sevkiyat');
  if (!e.fasonVar) l.add('fason');
  return l;
}

// UE-KP3: görünen aşama. Eksik madde varsa belge, yoksa onay; iki onay verilince tamam.
export function kapanisAsamasi(durum: 'acik' | 'tamam', maddeler: readonly { durum: KapanisMaddeHali }[]): KapanisAsamasi {
  if (durum === 'tamam') return 'tamam';
  return maddeler.some((m) => m.durum === 'eksik') ? 'belge' : 'onay';
}

export const kapanisSonucu = (durum: 'acik' | 'tamam', saglamAdet: number): 'tamamlandi' | 'saglamsiz' | null =>
  (durum !== 'tamam' ? null : saglamAdet === 0 ? 'saglamsiz' : 'tamamlandi');

// UE-KP4: onay sırasızdır (1077 b); kapanış açık ve eksiksiz olmalı, aynı onay ikinci kez verilmez. İki rolü olan kişi ikisini de verebilir.
export function kapanisOnayIhlali(
  k: { durum: 'acik' | 'tamam'; kaliteKisiId: number | null; mudurKisiId: number | null }, tur: KapanisOnayi, eksikSayisi: number,
): string | null {
  if (k.durum === 'tamam') return KAPANIS_TAMAM;
  if ((tur === 'kalite' ? k.kaliteKisiId : k.mudurKisiId) !== null) return KAPANIS_ONAY_VERILMIS;
  if (eksikSayisi > 0) return KAPANIS_EKSIK;
  return null;
}

// UE-KP5: ret ve muafiyet yalnız açık kapanışta; muafiyet yalnız eksik maddeye. Geri açma yalnız tamamda (1080 a).
export const kapanisAcikIhlali = (durum: 'acik' | 'tamam'): string | null => (durum === 'tamam' ? KAPANIS_TAMAM : null);
export function kapanisMuafIhlali(durum: 'acik' | 'tamam', hal: KapanisMaddeHali): string | null {
  if (durum === 'tamam') return KAPANIS_TAMAM;
  return hal === 'eksik' ? null : KAPANIS_MUAF_EKSIK_DEGIL;
}
export const kapanisGeriAcIhlali = (durum: 'acik' | 'tamam'): string | null => (durum === 'tamam' ? null : KAPANIS_TAMAM_DEGIL);

// Kart 1474 (1259 c): fason dönüşü tedarikçi karnesine iş emri başına tek teslim olayıdır. Termin ilk gidişin tesis günü artı termin
// günüdür; teslim günü son dönüşün tesis günü. Dönen sağlam ve hurda gönderilene ulaşınca tamdır. Fason firması, termin günü,
// gidişi ya da dönüşü olmayan iş emrinde olay yoktur (null; söz yoksa gecikme uydurulmaz).
export function fasonKarneOlayi(
  isEmri: { fasonFirmaId: number | null; terminGun: number | null },
  hareketler: readonly { yon: 'gidis' | 'donus'; adet: number; hurdaAdet: number | null; zaman: string }[],
  gunu: (zaman: string) => string,
): { firmaId: number; termin: string; zaman: string; tam: boolean } | null {
  if (isEmri.fasonFirmaId === null || isEmri.terminGun === null) return null;
  const gidisler = hareketler.filter((h) => h.yon === 'gidis');
  const donusler = hareketler.filter((h) => h.yon === 'donus');
  if (gidisler.length === 0 || donusler.length === 0) return null;
  const ilk = gidisler.reduce((a, h) => (Date.parse(h.zaman) < Date.parse(a.zaman) ? h : a));
  const son = donusler.reduce((a, h) => (Date.parse(h.zaman) >= Date.parse(a.zaman) ? h : a));
  const gonderilen = gidisler.reduce((t, h) => t + h.adet, 0);
  const donen = donusler.reduce((t, h) => t + h.adet + (h.hurdaAdet ?? 0), 0);
  const termin = new Date(Date.parse(`${gunu(ilk.zaman)}T00:00:00Z`) + isEmri.terminGun * 86_400_000).toISOString().slice(0, 10);
  return { firmaId: isEmri.fasonFirmaId, termin, zaman: son.zaman, tam: donen >= gonderilen };
}
