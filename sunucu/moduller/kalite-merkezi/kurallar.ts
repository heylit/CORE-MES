import { DOSYA_TURLERI } from '#paylasilan/sozlesme/dosya.ts';
import { createHash } from 'node:crypto';
import { KM_EMIR_KIMLIGI, KM_TEDARIKCI_DURUMLARI } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KaliteMerkeziKoleksiyonu, KmEmirKaynagi, KmEmirTipi, KmOnayReddiAlani, KmTedarikciDurumu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';
import type { Durum as AletDurumu } from '#paylasilan/sozlesme/kalibrasyon.ts';

// Ortak dosya deposundaki bağların modül adı: bağ (modül, uygulamanın dosya kimliği) ile kurulur.
export const KM_MODULU = 'kalite-merkezi';

// Uygulamanın dosya sınırı (resim, model, fotoğraf, sertifika): 50 MB; tür ortak deponun tanıdıklarıdır.
export const KM_DOSYA_SINIRI = { turler: DOSYA_TURLERI, azamiBayt: 50 * 1024 * 1024 } as const;

export const IZ_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'iz';

// Uygulamanın kendi panosu uygunsuzluğu yalnız "Kapalı" durumunda kapalı sayar; durumu boş kayıt açıktır.
export const UYGUNSUZLUK_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'ncr';
export const UYGUNSUZLUK_KAPALI = 'Kapalı';
export const TEDARIKCI_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'sup';
export const TEDARIKCI_ASKIDA = 'Askıda';

export const ILETILER = {
  ilkParcaAdimi: 'İlk parça kararının adımı bu üretim emrine ait değil.',
  izDegismez: 'Değişiklik izi kayıtları değiştirilemez.',
  izSilinmez: 'Değişiklik izi kayıtları silinemez.',
  dosyaYok: 'Dosya bulunamadı.',
  yalnizYonetici: 'Kalite Merkezi kullanıcı ve ayar kayıtlarını yalnız yönetici değiştirir.',
  arsivYonetici: 'Kayıtları yalnız yönetici arşive alır.',
  silmeYonetici: 'Bu Kalite Merkezi kaydını yalnız yönetici siler.',
  kaynakOnay: 'Tedarikçi ve form şablonu kayıtlarını onay yetkisi olan değiştirir.',
  tedarikciFirmasi: 'Tedarikçi kaydının firması Müşteri-Tedarikçi\'de aktif bir tedarikçi firma olmalı.',
  onayUcu: 'Onay ve kapanış alanları kayıt yazmayla değişmez; onay yetkisiyle kaydedilir.',
  onayDegeri: 'Onay ya da durum değeri geçersiz.',
  onayliForm: 'Onaylanmış form değiştirilemez ve silinemez; önce onayı geri alın.',
  onayliDegil: 'Form onaylı değil; geri alınacak onay yok.',
  formYok: 'Form bulunamadı.',
  gecersizCihaz: 'Kalibrasyonu geçersiz cihazla ölçüm kaydedilemez.',
  kapanmisKayit: 'Kapanmış uygunsuzluk ve DÖF, sonuçlanmış muayene ve lot kabul kaydı değiştirilemez ve silinemez; düzeltme yeni kayıtla yapılır.',
  karantinadaNcrDisiRed: 'Parti karantinada kaldı: NCR dışı red var.',
  serbestMiktarParti: 'Serbest bırakılan miktar bu NCR\'nin bırakabileceği bir partiye ait değil.',
  serbestMiktarSifir: 'Serbest bırakılan miktar sıfırdan büyük olmalı.',
  serbestMiktarAsim: 'Serbest bırakılan miktar partinin kullanılabilir red miktarını aşıyor.',
  karantinadaAcikNcr: 'Parti karantinada kaldı: başka açık NCR tutuyor.',
  dofKaynagi: 'DÖF kaynağı ya da kaynak anahtarı geçersiz.',
  dofBasligi: 'DÖF başlığı boş olamaz.',
  dofSeviyesi: 'DÖF açılan bulgunun seviyesi majör ya da minör olmalı.',
  lotKaynagi: 'Lot kararının kaynağı ya da kaynak anahtarı geçersiz.',
  lotParcasi: 'Lot kararı için parça no gerekli.',
  lotBuyuklugu: 'Lot kararı için geçerli bir parti büyüklüğü (en az 2) gerekli.',
  lotAyari: 'Lot planının muayene seviyesi ya da AQL değeri geçersiz.',
  lotSayisi: 'Lot kararı için en az bir sınıfın bulunan uygunsuz sayısı gerekli; sayı 0 ile parti büyüklüğü arasında olmalı.',
  lotDurduruldu: 'Bu parça için kabul muayenesi durduruldu; Kalite Merkezi\'nde sıkılık geçiş tablosundan yeniden başlatılmalı.',
} as const;

// Uygulamanın rolleri ve ayarları bu kayıtlardadır; giriş TMI oturumu olduğu için onları yalnız yönetici değiştirir.
const YONETICI_KOLEKSIYONLARI: readonly string[] = ['kullanici', 'settings'];
export const yoneticiKoleksiyonuMu = (koleksiyon: string): boolean => YONETICI_KOLEKSIYONLARI.includes(koleksiyon);

// Soru 229 a: uygulamanın ekranda rol seviyesiyle sınırladığı kaynak kayıtları (tedarikçi ve form şablonu; uygulamada Kalite
// mühendisi) sunucuda onay işlemini ister. Silme ve arşivleme yöneticinindir (uygulamada Kalite yöneticisi).
const KAYNAK_KOLEKSIYONLARI: readonly string[] = [TEDARIKCI_KOLEKSIYONU, 'tpl'];
export const kaynakKoleksiyonuMu = (koleksiyon: string): boolean => KAYNAK_KOLEKSIYONLARI.includes(koleksiyon);
// Soru 260 a: belge, Teknik kütüphane bayrağı ve form şablonu (varsayılana dönüş) onay işlemiyle de silinir; öteki silmeler yöneticinindir.
const ONAYLA_SILINENLER: readonly string[] = ['belge', 'bayrak', 'tpl'];
export const onaylaSilinirMi = (koleksiyon: string): boolean => ONAYLA_SILINENLER.includes(koleksiyon);

// Giriş TMI oturumudur: uygulamanın kullanıcı kaydı PIN özeti taşımaz (eski yedekten ya da eski ekrandan gelse de saklanmaz).
export function pinsiz<T extends Record<string, unknown>>(koleksiyon: string, govde: T): T {
  if (koleksiyon !== 'kullanici' || !Object.hasOwn(govde, 'pin')) return govde;
  const kalan = { ...govde };
  delete kalan.pin;
  return kalan;
}

// Değişiklik izi yalnız eklenir: var olan iz kaydının üzerine yazılmaz, iz kaydı silinmez (uygulamanın yerel sunucusundaki kural).
export function izReddi(koleksiyon: string, islem: 'yaz' | 'sil', doluKayitVar: boolean): 'izDegismez' | 'izSilinmez' | null {
  if (koleksiyon !== IZ_KOLEKSIYONU) return null;
  if (islem === 'sil') return 'izSilinmez';
  return doluKayitVar ? 'izDegismez' : null;
}

// Yedekten geri yüklemede değişiklik izi yedekten alınmaz; sunucudaki iz korunur.
export function geriYuklenecekler<T extends { koleksiyon: string }>(belgeler: readonly T[]): T[] {
  return belgeler.filter((b) => b.koleksiyon !== IZ_KOLEKSIYONU);
}

// Onay ve kapanış kararları uygulamanın kayıt gövdesindedir. Genel kayıt yazması bunları değiştiremez (onay sahteciliği,
// kart #1583); yalnız onay ucu değiştirir. Serbest geçiş, kaydı dolduranın kendi adımıdır: formu taslak tutmak ya da onaya
// göndermek, uygunsuzluğu ve DÖF'ü kapanmamış durumlar arasında yürütmek. Kapatmak ve yeniden açmak karardır.
type Deger = unknown;
interface OnayAlani {
  degerler: readonly string[] | null;
  serbest?: (onceki: Deger, yeni: Deger) => boolean;
}
const kapanmamis = (kapali: string) => (onceki: Deger, yeni: Deger): boolean => onceki !== kapali && yeni !== kapali;
const FORM_SERBEST: readonly Deger[] = [undefined, 'Taslak', 'Onay bekliyor'];
// MRB kararı da karardır (195 a, B18): kararsız hâl ("Karar bekliyor" ya da boş) kaydı dolduranındır, karar onay ucundan girer.
// Değer serbest metin kalır: eski kayıtlar kısa adla ("Tamir") durur ve KM-K90 kararı baş eşleşmeyle okur.
const MRB_KARARSIZ: readonly Deger[] = [undefined, null, '', 'Karar bekliyor'];
// Genel yazmanın onay alanı reddi bu alan adıyla döner: köprü aynı kaydı onay ucuna gönderir.
export const ONAY_ALANI_HATASI: KmOnayReddiAlani = 'onay';
export const FORM_ONAYLANDI = 'Onaylandı';
export const ONAY_ALANLARI: Readonly<Partial<Record<KaliteMerkeziKoleksiyonu, Readonly<Record<string, OnayAlani>>>>> = {
  frm: {
    durum: {
      degerler: ['Taslak', 'Onay bekliyor', FORM_ONAYLANDI],
      serbest: (o, y) => FORM_SERBEST.includes(o) && y !== undefined && FORM_SERBEST.includes(y),
    },
    onaylayan: { degerler: null },
    onayTarih: { degerler: null },
    onayNot: { degerler: null },
    onayGeriAlan: { degerler: null },
    onayGeriAlmaZamani: { degerler: null },
  },
  ncr: {
    durum: { degerler: ['Açık', 'MRB değerlendirmesinde', 'DÖF açıldı', UYGUNSUZLUK_KAPALI], serbest: kapanmamis(UYGUNSUZLUK_KAPALI) },
    mrb: { degerler: null, serbest: (o, y) => MRB_KARARSIZ.includes(o) && MRB_KARARSIZ.includes(y) },
  },
  capa: { durum: { degerler: ['Açık', 'Kapalı'], serbest: kapanmamis('Kapalı') } },
  sup: { onay: { degerler: KM_TEDARIKCI_DURUMLARI } },
};

const ayni = (a: Deger, b: Deger): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Genel yazmanın değiştirmek istediği ve serbest olmayan onay alanları; boşsa yazma onay alanına dokunmuyordur.
export function onayDegisiklikleri(koleksiyon: string, onceki: Record<string, unknown> | null, yeni: Record<string, unknown>): string[] {
  const alanlar = ONAY_ALANLARI[koleksiyon as KaliteMerkeziKoleksiyonu] ?? {};
  return Object.entries(alanlar)
    .filter(([ad, a]) => {
      const o = onceki?.[ad];
      const y = yeni[ad];
      return !ayni(o, y) && !(a.serbest?.(o, y) ?? false);
    })
    .map(([ad]) => ad);
}

// Onay ucunun kabul ettiği değerler uygulamanın seçenekleridir; serbest metin alanlarında (not) yalnız metin aranır.
export function onayDegeriGecerliMi(koleksiyon: string, govde: Record<string, unknown>): boolean {
  const alanlar = ONAY_ALANLARI[koleksiyon as KaliteMerkeziKoleksiyonu] ?? {};
  return Object.entries(alanlar).every(([ad, a]) => {
    const d = govde[ad];
    if (d === undefined || d === null) return true;
    return a.degerler === null ? typeof d === 'string' : a.degerler.includes(d as string);
  });
}

export const onayAlaniVarMi = (koleksiyon: string): boolean => ONAY_ALANLARI[koleksiyon as KaliteMerkeziKoleksiyonu] !== undefined;

// Form onayında kişi ve zaman istemciden alınmaz: onaylayan ve onay günü oturumdaki kişi ve tesisin bugünüdür. Onaylı formun
// onayı geri alınınca (durum "Onaylandı"dan çıkar) onaylayan ve gün kalkar, geri alan ve saati yazılır (kullanıcı kararı
// 17.10.2026, "Eklensin"). Bu alanlar istemcinin gövdesinden hiç alınmaz: önceki değerleri korunur.
const SUNUCU_FORM_ALANLARI = ['onaylayan', 'onayTarih', 'onayGeriAlan', 'onayGeriAlmaZamani'] as const;
export interface SunucuOnayKisisi { ad: string; gun: string; saat: string }
export function sunucuOnayi(
  koleksiyon: string, onceki: Record<string, unknown> | null, govde: Record<string, unknown>, k: SunucuOnayKisisi,
): Record<string, unknown> {
  if (koleksiyon !== 'frm') return govde;
  const g: Record<string, unknown> = { ...govde };
  for (const a of SUNUCU_FORM_ALANLARI) {
    if (onceki !== null && Object.hasOwn(onceki, a)) g[a] = onceki[a];
    else delete g[a];
  }
  if (onceki?.durum === FORM_ONAYLANDI && g.durum !== FORM_ONAYLANDI) {
    delete g.onaylayan;
    delete g.onayTarih;
    return { ...g, onayGeriAlan: k.ad, onayGeriAlmaZamani: k.saat };
  }
  return { ...g, onaylayan: k.ad, onayTarih: k.gun };
}

// Onayı geri alınan form taslağa döner; içeriği aynı kalır, dolduran düzeltip yeniden onaya gönderir.
export const FORM_TASLAK = 'Taslak';
export const onayiGeriAlinmis = (onceki: Record<string, unknown>, simdi: string): Record<string, unknown> =>
  ({ ...onceki, durum: FORM_TASLAK, guncelleme: simdi });

// Onaylanmış form kilitlidir (kullanıcı kararı 16.10.2026, "Kilitle"): içeriği değişmez, silinmez. Değişiklik yalnız onay ucundan,
// durum "Onaylandı"dan çıkarılarak (onay geri alınarak) yapılır. Aynı gövdeyi yeniden yazmak değişiklik sayılmaz.
const sirali = (d: unknown): unknown =>
  Array.isArray(d) ? d.map(sirali)
    : d !== null && typeof d === 'object' ? Object.fromEntries(Object.keys(d).sort().map((k) => [k, sirali((d as Record<string, unknown>)[k])]))
      : d;
export const onayliFormMu = (koleksiyon: string, govde: Record<string, unknown> | null): boolean =>
  koleksiyon === 'frm' && govde?.durum === FORM_ONAYLANDI;
export function onayliFormReddi(koleksiyon: string, onceki: Record<string, unknown> | null, yeni: Record<string, unknown> | null): boolean {
  if (!onayliFormMu(koleksiyon, onceki)) return false;
  if (yeni === null) return true;
  return yeni.durum === FORM_ONAYLANDI && JSON.stringify(sirali(onceki)) !== JSON.stringify(sirali(yeni));
}

// KM-K89 (258 a, 19.10.2026): kapanmış NCR ve sonuçlanmış (Kabul, Ret) muayene kilitlidir; yazma, onay ve silme reddedilir, düzeltme
// yeni kayıtla yapılır. Yedekten geri yükleme kilide bakmaz: yöneticinin işidir ve önceki hâl geçmişte kalır.
// B16: uygulamanın ekranda kilitlediği kapanmış DÖF ve kararı verilmiş lot kabul kaydı da aynı kilittedir (uygulamanın `isLocked`
// kuralı). Lot kararı formun hesabıdır; "yeniden başlat" (`tip: reset`) kaydı muayene değildir, kilitlenmez.
const SONUCLU_MUAYENE: readonly string[] = ['Kabul', 'Ret'];
export const DOF_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'capa';
export const LOT_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'lot';
export function kapanmisKayitMi(koleksiyon: string, govde: Record<string, unknown> | null): boolean {
  const alan = (a: string): string => (typeof govde?.[a] === 'string' ? (govde[a] as string).trim() : '');
  if (koleksiyon === UYGUNSUZLUK_KOLEKSIYONU || koleksiyon === DOF_KOLEKSIYONU) return alan('durum') === UYGUNSUZLUK_KAPALI;
  if (koleksiyon === 'insp') return SONUCLU_MUAYENE.includes(alan('sonuc'));
  if (koleksiyon === LOT_KOLEKSIYONU) return alan('karar') !== '' && alan('tip') !== 'reset';
  return false;
}

// 228 a: uygulamanın "Arşive al" komutu kapanmış, sonuçlanmış ve onaylı kaydı listeden kaldırmak için yalnız `arsiv` bayrağını
// ve kendi yazma damgasını (`guncelleme`) değiştirerek yeniden yazar. Kilitli içerik değişmediği için bu yazma kilide takılmaz;
// bayrak yalnız açık ya da kapalıdır, içerik taşıyamaz. Bayrağı yalnız yönetici değiştirir (229 a; uygulamada Kalite yöneticisi).
export const ARSIV_ALANI = 'arsiv';
const ARSIV_DISI = new Set([ARSIV_ALANI, 'guncelleme']);
const arsivDisi = (g: Record<string, unknown>): string =>
  JSON.stringify(sirali(Object.fromEntries(Object.entries(g).filter(([k]) => !ARSIV_DISI.has(k)))));
export const arsivDegisiyor = (onceki: Record<string, unknown> | null, yeni: Record<string, unknown>): boolean =>
  !ayni(onceki?.[ARSIV_ALANI], yeni[ARSIV_ALANI]);
export function yalnizArsivDegisiyor(onceki: Record<string, unknown> | null, yeni: Record<string, unknown>): boolean {
  if (onceki === null) return false;
  const bayrak = yeni[ARSIV_ALANI];
  if (bayrak !== undefined && typeof bayrak !== 'boolean') return false;
  return arsivDegisiyor(onceki, yeni) && arsivDisi(onceki) === arsivDisi(yeni);
}

// KM-K85 (kullanıcı kararı 85, 19.10.2026): kalibrasyonu geçersiz cihazla ölçüm sunucuda reddedilir. Cihaz uygulamanın `dev`
// kaydıdır. KM-K88 (262 a): geçerliliği yalnız kalibrasyon modülü verir; uygulamanın kendi tarihi elle ileri alınabildiği için
// sayılmaz. Cihaz kodu kalibrasyondaki alet numarasıyla eşlenir (numara orada kırpılmış büyük harftir); geçerli ve yaklaşan
// kullanılır, eşi olmayan kanıtsızdır. Önceki hâlinde aynı cihaz ve aynı değerlerle duran karakteristik yeni ölçüm değildir:
// aletin süresi ölçümden sonra dolduysa kayıt düzenlenebilir kalır.
export const MUAYENE_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'insp';
export const CIHAZ_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'dev';
export const GECERSIZ_CIHAZ_ALANI = 'cihaz';

const metin = (d: unknown): string => (typeof d === 'string' ? d.trim() : '');

export function cihazGecerliMi(cihaz: Record<string, unknown> | null, aletDurumlari: ReadonlyMap<string, AletDurumu>): boolean {
  const no = metin(cihaz?.kod).toUpperCase();
  const durum = no === '' ? undefined : aletDurumlari.get(no);
  return durum === 'gecerli' || durum === 'yaklasan';
}

// 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon modülüdür. Uygulamanın cihaz listesi (`dev`) ondan salt okunur gelir; eski `dev`
// kayıtları silinmez. Ölçüm kaydı cihazı kimliğiyle tutar: aynı kodlu eski kaydın kimliği korunur, yeni aletin kimliği `kal-<alet>`tir.
export interface OlcuAleti {
  id: number; no: string; tur: string; ad: string | null; olcmeAraligi: string | null; yer: string | null; periyotGun: number;
  kullanimDisi: boolean; sonKalibrasyon: string | null; durum: AletDurumu; vade: string | null; kalanGun: number | null;
  kayitlar: readonly { tarih: string; sonuc: 'uygun' | 'uygunsuz'; sertifikaNo: string | null; aciklama: string | null }[];
}
export interface CihazKaydi { kimlik: string; govde: Record<string, unknown> }

export const OLCU_ALETI_KAYIT_ADEDI = 20;
const KALIBRASYON_KIMLIGI = /^kal-([1-9]\d{0,9})$/;
export const kalibrasyonKimligi = (aletId: number): string => `kal-${String(aletId)}`;
export function kalibrasyonAletKimligi(kimlik: string): number | null {
  const e = KALIBRASYON_KIMLIGI.exec(kimlik);
  return e === null ? null : Number(e[1]);
}

// Kalibrasyonda karşılığı olmayan alanlar (marka, seri, çözünürlük, laboratuvar, izlenebilirlik) hiç yazılmaz; metin alanları
// boş metindir, sıfır ya da uydurma değer yazılmaz. Periyot ay olarak gün / 30'dur ve yuvarlanmaz; durum `periyotGun` ile hesaplanır.
// B17: durum, vade ve kalan gün Kalibrasyonun veritabanı gününe göre hesapladığıdır; ölçüm denetimi (KM-K88) de bu durumu kullanır,
// ekran onu gösterir ve tarayıcı saatiyle ayrışmaz. Eşi olmayan eski kayıtta bu alanlar yoktur (ekran kuralı yerelde koşar).
export function olcuAletiGovdesi(a: OlcuAleti): Record<string, unknown> {
  const sonUygun = [...a.kayitlar].reverse().find((k) => k.sonuc === 'uygun' && k.tarih === a.sonKalibrasyon);
  return {
    kod: a.no,
    ad: a.ad ?? '',
    tip: a.tur,
    lokasyon: a.yer ?? '',
    aralik: a.olcmeAraligi ?? '',
    sonKal: a.sonKalibrasyon ?? '',
    periyot: a.periyotGun / 30,
    periyotGun: a.periyotGun,
    sertifika: sonUygun?.sertifikaNo ?? '',
    kullanimDisi: a.kullanimDisi,
    gecmis: a.kayitlar.map((k) => ({ tarih: k.tarih, sonuc: k.sonuc === 'uygun' ? 'Uygun' : 'Uygun değil', sertifika: k.sertifikaNo ?? '', not: k.aciklama ?? '' })),
    kalibrasyondan: true,
    kalibrasyonDurumu: a.durum,
    kalibrasyonVadesi: a.vade,
    kalibrasyonKalanGun: a.kalanGun,
  };
}

// Her alet bir cihazdır; aletle eşleşmeyen eski kayıt kimliğiyle kalır ama kalibrasyon bilgisi boşaltılır (sunucu da onu geçersiz sayar).
export function olcuAletleriListesi(aletler: readonly OlcuAleti[], eskiler: readonly CihazKaydi[]): CihazKaydi[] {
  const sirali = [...eskiler].sort((x, y) => (x.kimlik < y.kimlik ? -1 : x.kimlik > y.kimlik ? 1 : 0));
  const kodlar = new Map<string, string>();
  for (const e of sirali) {
    const kod = metin(e.govde['kod']).toUpperCase();
    if (kod !== '' && !kodlar.has(kod)) kodlar.set(kod, e.kimlik);
  }
  const baglanan = new Set<string>();
  const liste = aletler.map((a) => {
    const eski = kodlar.get(a.no.toUpperCase());
    if (eski !== undefined) baglanan.add(eski);
    return { kimlik: eski ?? kalibrasyonKimligi(a.id), govde: olcuAletiGovdesi(a) };
  });
  for (const e of sirali) if (!baglanan.has(e.kimlik)) liste.push({ kimlik: e.kimlik, govde: { ...e.govde, sonKal: '', kalibrasyondaYok: true } });
  return liste;
}

// `kal-` kimlikli cihazın kaydı yoktur; Kalibrasyondaki aletin numarasından kurulur (cihazGecerliMi kodla eşler).
export function kalibrasyonCihazi(aletler: readonly Pick<OlcuAleti, 'id' | 'no'>[], aletId: number): Record<string, unknown> | null {
  const alet = aletler.find((a) => a.id === aletId);
  return alet === undefined ? null : { kod: alet.no };
}

interface Karakteristik { ad?: unknown; balon?: unknown; cihaz?: unknown; olcum?: unknown; olcumler?: unknown }
const karakteristikler = (govde: Record<string, unknown> | null): Karakteristik[] =>
  Array.isArray(govde?.chars) ? govde.chars.filter((c): c is Karakteristik => c !== null && typeof c === 'object') : [];
const olcumIzi = (c: Karakteristik): string => JSON.stringify([metin(c.cihaz), metin(c.olcum), Array.isArray(c.olcumler) ? c.olcumler : []]);
const olculmus = (c: Karakteristik): boolean =>
  metin(c.olcum) !== '' || (Array.isArray(c.olcumler) && c.olcumler.some((v) => metin(v) !== ''));

// Yazılacak muayenede yeni ölçümü olan karakteristiklerin cihaz kimlikleri (sırasıyla, tekrarsız).
export function yeniOlcumCihazlari(koleksiyon: string, onceki: Record<string, unknown> | null, govde: Record<string, unknown>): string[] {
  if (koleksiyon !== MUAYENE_KOLEKSIYONU) return [];
  const eskiler = new Set(karakteristikler(onceki).map(olcumIzi));
  const yeniler = karakteristikler(govde).filter((c) => metin(c.cihaz) !== '' && olculmus(c) && !eskiler.has(olcumIzi(c)));
  return [...new Set(yeniler.map((c) => metin(c.cihaz)))];
}

// KM-K88: emrin kalibrasyon hazırlığı (Üretim emirlerinin hazırlık kapısı). Emrin cihazları emrin muayenelerindeki karakteristiklerin
// cihazlarıdır; cihazı olmayan emir seçili değildir. Hepsi geçerliyse tamam; kalibrasyonun bir tamamlanma anı yoktur, zaman boştur.
export interface KalibrasyonHazirligi { durum: 'yok' | 'tamam'; zaman: null; secildi: boolean }

export function emirCihazlari(muayeneler: readonly (Record<string, unknown> | null)[]): string[] {
  return [...new Set(muayeneler.flatMap((m) => karakteristikler(m).map((c) => metin(c.cihaz)).filter((id) => id !== '')))];
}

export function kalibrasyonHazirligi(
  cihazIdleri: readonly string[], cihazlar: ReadonlyMap<string, Record<string, unknown>>, aletDurumlari: ReadonlyMap<string, AletDurumu>,
): KalibrasyonHazirligi {
  if (cihazIdleri.length === 0) return { durum: 'yok', zaman: null, secildi: false };
  const hepsi = cihazIdleri.every((id) => cihazGecerliMi(cihazlar.get(id) ?? null, aletDurumlari));
  return { durum: hepsi ? 'tamam' : 'yok', zaman: null, secildi: true };
}

// KM-K90 (229 a, 147 b; koordinatör kararı 19.10.2026): NCR MRB kararı "Olduğu gibi kullan" ya da "Tamir" ile kapanınca karantinaya
// aldığı partiler serbest bırakılır. Yeniden işle, Hurda ve Tedarikçiye iade stoğa dokunmaz: parti karantinada kalır, çıkışı depo ya da
// ilgili modül yapar. Kapalı kayıt değişmediğinden (KM-K89) istek yalnız kapanışta bir kez doğar.
const SERBEST_BIRAKAN_MRB: readonly string[] = ['Olduğu gibi kullan', 'Tamir'];
export function serbestBirakmaIstegi(koleksiyon: string, onceki: Record<string, unknown> | null, govde: Record<string, unknown>): boolean {
  if (koleksiyon !== UYGUNSUZLUK_KOLEKSIYONU) return false;
  const durum = (g: Record<string, unknown> | null) => (typeof g?.durum === 'string' ? g.durum.trim() : '');
  if (durum(govde) !== UYGUNSUZLUK_KAPALI || durum(onceki) === UYGUNSUZLUK_KAPALI) return false;
  const mrb = typeof govde.mrb === 'string' ? govde.mrb.trim() : '';
  return SERBEST_BIRAKAN_MRB.some((k) => mrb.startsWith(k));
}

// KM-K90: karantina defterindeki bir red girişi, defterine yazan NCR kapanan NCR'nin kendisiyse, hâlâ açıksa ya da serbest bırakan
// MRB kararıyla kapandıysa NCR'nin bıraktığı redi sayılır. Silinmiş ya da Hurda, Yeniden işle, İade ile kapanmış NCR'nin redi bırakılmaz.
export function serbestBirakanNcrMi(kimlik: string, govde: Record<string, unknown> | null, kapanan: string): boolean {
  if (kimlik === kapanan) return true;
  if (govde === null) return false;
  if ((typeof govde.durum === 'string' ? govde.durum.trim() : '') !== UYGUNSUZLUK_KAPALI) return true;
  const mrb = typeof govde.mrb === 'string' ? govde.mrb.trim() : '';
  return SERBEST_BIRAKAN_MRB.some((k) => mrb.startsWith(k));
}

// KM-K90 (koordinatör kararı 19.10.2026): partinin bugünkü redini oluşturan girişlerden biri NCR'nin bırakabileceği bir red değilse
// (ilk parça reddi gibi) parti karantinada kalır; NCR yalnız kendi miktarını geri veremez, o miktarlı bir stok işlevi ister.
// Redi olmayan partide bırakılacak bir şey yoktur.
export type SerbestBirakmaSonucu = 'birak' | 'redYok' | 'acikNcr' | 'ncrDisiRed';
export function serbestBirakmaSonucu(
  redGirisleri: readonly number[], birakilabilen: ReadonlySet<number>, baskaAcikNcrTutuyor: boolean,
): SerbestBirakmaSonucu {
  if (redGirisleri.length === 0) return 'redYok';
  if (baskaAcikNcrTutuyor) return 'acikNcr';
  return redGirisleri.every((h) => birakilabilen.has(h)) ? 'birak' : 'ncrDisiRed';
}

// KM-K91 (320 a): kapanan NCR partiden yalnız serbest bırakılan miktarı geri verir; kalan red ve yerinde kalır. Miktar
// önce karantina konumundaki redden, sonra yerinde duran redden düşer. Stok miktarı en çok üç ondalıklıdır; binde birle sayılır.
export interface RedBakiyesi { konumId: number; statuId: number | null; kullanilabilir: string; karantinaKonumuMu: boolean }
export interface KaliteSatiri { konumId: number; statuId: number | null; kaliteDurumu: 'red'; miktar: string }
export type SerbestMiktarReddi = 'serbestMiktarSifir' | 'serbestMiktarAsim';
const MIKTAR_BICIMI = /^(\d+)(?:\.(\d{1,3}))?$/;
const binde = (m: string): bigint => {
  const p = MIKTAR_BICIMI.exec(m.trim());
  if (!p) throw new Error(`Miktar biçimi geçersiz: ${m}`);
  return BigInt(p[1] ?? '0') * 1000n + BigInt((p[2] ?? '').padEnd(3, '0'));
};
const bindenMetin = (b: bigint): string => {
  const kesir = (b % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${b / 1000n}${kesir ? `.${kesir}` : ''}`;
};
export const redToplami = (bakiyeler: readonly RedBakiyesi[]): string =>
  bindenMetin(bakiyeler.reduce((t, b) => t + binde(b.kullanilabilir), 0n));

export function serbestBirakmaPlani(
  bakiyeler: readonly RedBakiyesi[], miktar: string,
): { karantinadan: string | null; yerinde: KaliteSatiri[] } | { ret: SerbestMiktarReddi } {
  let kalan = binde(miktar);
  if (kalan <= 0n) return { ret: 'serbestMiktarSifir' };
  if (kalan > binde(redToplami(bakiyeler))) return { ret: 'serbestMiktarAsim' };
  const karantinada = bakiyeler.filter((b) => b.karantinaKonumuMu).reduce((t, b) => t + binde(b.kullanilabilir), 0n);
  const karantinadan = kalan < karantinada ? kalan : karantinada;
  kalan -= karantinadan;
  const yerinde: KaliteSatiri[] = [];
  for (const b of bakiyeler) {
    if (kalan <= 0n) break;
    const eldeki = binde(b.kullanilabilir);
    if (b.karantinaKonumuMu || eldeki <= 0n) continue;
    const alinan = kalan < eldeki ? kalan : eldeki;
    kalan -= alinan;
    yerinde.push({ konumId: b.konumId, statuId: b.statuId, kaliteDurumu: 'red', miktar: bindenMetin(alinan) });
  }
  return { karantinadan: karantinadan > 0n ? bindenMetin(karantinadan) : null, yerinde };
}

// Karantinadan taşınan red, hedef konumda yerinde duran redle aynı bakiyeye düşebilir: stok aynı bakiye için tek satır ister.
export function kaliteSatirlari(
  tasinan: readonly { hedefKonumId: number; statuId: number | null; kaliteDurumu: string; miktar: string }[], yerinde: readonly KaliteSatiri[],
): KaliteSatiri[] {
  // Karantinadan red olmayan satır taşınmışsa NCR'nin bırakacağı red değildir: kaliteyi çevirmek yanlış satırı serbest yapardı.
  if (tasinan.some((t) => t.kaliteDurumu !== 'red')) throw new Error('Karantinadan red olmayan bakiye taşındı.');
  const toplam = new Map<string, { konumId: number; statuId: number | null; miktar: bigint }>();
  for (const s of [...tasinan.map((t) => ({ konumId: t.hedefKonumId, statuId: t.statuId, miktar: t.miktar })), ...yerinde]) {
    const k = `${s.konumId}:${s.statuId ?? ''}`;
    const o = toplam.get(k);
    toplam.set(k, { konumId: s.konumId, statuId: s.statuId, miktar: (o?.miktar ?? 0n) + binde(s.miktar) });
  }
  return [...toplam.values()].map((s) => ({ konumId: s.konumId, statuId: s.statuId, kaliteDurumu: 'red', miktar: bindenMetin(s.miktar) }));
}

// Uygunsuzluk kaydının stokta karantinaya alacağı parti anahtarı (229 a): açık NCR'nin lotu ya da iş emri. Aynı lot ve emirle
// yapılan düzeltme yeniden istemez; kapalıdan yeniden açılan ister. Hangi partiye düştüğünü stok çözer.
export function karantinaIstegi(
  koleksiyon: string, onceki: Record<string, unknown> | null, govde: Record<string, unknown>,
): { lotNo: string | null; emirNo: string | null } | null {
  if (koleksiyon !== UYGUNSUZLUK_KOLEKSIYONU) return null;
  const acik = (g: Record<string, unknown>) => metin(g.durum) !== UYGUNSUZLUK_KAPALI;
  const anahtar = (g: Record<string, unknown>) => ({ lotNo: metin(g.lot) || null, emirNo: metin(g.emir) || null });
  const yeni = anahtar(govde);
  if (!acik(govde) || (yeni.lotNo === null && yeni.emirNo === null)) return null;
  if (onceki !== null && acik(onceki)) {
    const eski = anahtar(onceki);
    if (eski.lotNo === yeni.lotNo && eski.emirNo === yeni.emirNo) return null;
  }
  return yeni;
}

export interface BekleyenEmir { id: number; emirNo: string; parcaNo: string; parcaAd: string; adet: number }

export interface BekleyenAdim { isEmriId: number | null; opNo: number | null; kararBekliyor: number }

// İlk parça kararı bekleyenler: karar bekleyen sayımı olan açık emirlerin adımları, emir ve OP sırasıyla (325 a, 744 a).
export function ilkParcaBekleyenleri(emirler: readonly BekleyenEmir[], sayaclar: ReadonlyMap<number, readonly BekleyenAdim[]>) {
  return emirler
    .flatMap((e) => (sayaclar.get(e.id) ?? []).filter((a) => a.kararBekliyor > 0).map((a) => ({
      uretimEmriId: e.id, emirNo: e.emirNo, parcaNo: e.parcaNo, parcaAd: e.parcaAd, isEmriId: a.isEmriId, opNo: a.opNo, adet: e.adet,
      kararBekleyenAdet: a.kararBekliyor,
    })))
    .sort((a, b) => a.uretimEmriId - b.uretimEmriId || (a.opNo ?? 0) - (b.opNo ?? 0));
}

// T4 (155 a): DÖF'ün tek sahibi Kalite Merkezi'dir. Başka modül (denetim hazırlığı) bulgusundan DÖF'ü buradan açar ve durumunu
// buradan okur; kendi DÖF'ünü tutmaz. Açılan kayıt uygulamanın DÖF formundaki biçimdedir ve kaynağıyla kaynak anahtarını taşır;
// aynı anahtar ikinci DÖF açmaz. Bulgunun maddesi başlığın önüne yazılır (uygulamanın DÖF listesi başlığı gösterir); seviye ve
// açıklama kaynak alanlarında durur. Bulguda termin ve sorumlu yoktur: boş metin yazılır, uygulama DÖF'ü düzenlerken ister.
export const DOF_KAYNAKLARI = ['denetim-hazirlik'] as const;
export type DofKaynagi = (typeof DOF_KAYNAKLARI)[number];
export const DOF_SEVIYELERI = ['major', 'minor'] as const;
export interface DofAcIstegi {
  kaynak: DofKaynagi; kaynakAnahtari: string; baslik: string; madde: string | null; seviye: (typeof DOF_SEVIYELERI)[number];
  aciklama: string | null;
}
export const DOF_ANAHTAR_SINIRI = 200;

export function dofIstegiReddi(i: DofAcIstegi): 'dofKaynagi' | 'dofBasligi' | 'dofSeviyesi' | null {
  if (!(DOF_KAYNAKLARI as readonly string[]).includes(i.kaynak)) return 'dofKaynagi';
  if (typeof i.kaynakAnahtari !== 'string' || i.kaynakAnahtari === '' || i.kaynakAnahtari.length > DOF_ANAHTAR_SINIRI) return 'dofKaynagi';
  if (metin(i.baslik) === '') return 'dofBasligi';
  return (DOF_SEVIYELERI as readonly string[]).includes(i.seviye) ? null : 'dofSeviyesi';
}

// Kimlik kaynak ve anahtarın özetinden türer: aynı anahtar aynı kimliğe düşer, eşzamanlı iki açış ikinci kaydı açamaz. Anahtar
// serbest metindir (bulgunun maddesi ve metni); kimlik biçimine sığmadığı için özeti alınır.
export const dofKimligi = (kaynak: string, kaynakAnahtari: string): string =>
  `capa-${createHash('sha256').update(`${kaynak}\n${kaynakAnahtari}`).digest('hex').slice(0, 40)}`;

export function dofGovdesi(i: DofAcIstegi, no: string, gun: string): Record<string, unknown> {
  const madde = metin(i.madde);
  return {
    no, acilis: gun, termin: '', baslik: madde === '' ? metin(i.baslik) : `${madde} ${metin(i.baslik)}`, sorumlu: '', tur: 'Düzeltici', adim: 0,
    durum: 'Açık', etkinlik: 'Doğrulanmadı', kaynak: i.kaynak, kaynakAnahtari: i.kaynakAnahtari, kaynakMadde: madde, kaynakSeviye: i.seviye,
    kaynakAciklama: metin(i.aciklama),
  };
}

export interface DofDurumu { kimlik: string; no: string; durum: 'Açık' | 'Kapalı'; kapanis: string | null }
export function dofDurumu(kimlik: string, govde: Record<string, unknown>): DofDurumu {
  const kapali = kapanmisKayitMi(DOF_KOLEKSIYONU, govde);
  const kapanis = metin(govde.kapanis);
  return { kimlik, no: metin(govde.no) || kimlik, durum: kapali ? 'Kapalı' : 'Açık', kapanis: kapali && kapanis !== '' ? kapanis : null };
}

// 236 a: tedarikçi kaydının `firmaId` alanı Müşteri-Tedarikçi firmasının kimliğidir. Yok ya da boşsa null (eski kayıt); öteki
// her değer (metin, sıfır, kesir) geçersizdir.
export const TEDARIKCI_FIRMA_ALANI = 'firmaId';
export function tedarikciFirmaKimligi(govde: Record<string, unknown> | null): number | null | 'gecersiz' {
  const d = govde?.[TEDARIKCI_FIRMA_ALANI];
  if (d === undefined || d === null) return null;
  return typeof d === 'number' && Number.isSafeInteger(d) && d > 0 ? d : 'gecersiz';
}

// Firma seçicisinde yalnız aktif tedarikçi firmalar (tür tedarikçi ya da ikisi) listelenir; adla sıralı.
type SeciciFirmasi = { id: number; kod: string | null; ad: string; aktif: boolean; tur: string };
export const tedarikciFirmasiMi = (f: Pick<SeciciFirmasi, 'aktif' | 'tur'>): boolean => f.aktif && (f.tur === 'tedarikci' || f.tur === 'ikisi');
export function tedarikciFirmalari(firmalar: readonly SeciciFirmasi[]): { id: number; kod: string | null; ad: string }[] {
  return firmalar.filter(tedarikciFirmasiMi).map(({ id, kod, ad }) => ({ id, kod, ad })).sort((a, b) => a.ad.localeCompare(b.ad, 'tr-TR') || a.id - b.id);
}

// 236 a: firma başına Kalite Merkezi onay durumu. Firma kimliği olan kayıt yalnız o firmaya bağlanır. Kimliği olmayan eski kayıt
// bugünkü eşlemeyle bağlanır (iki tarafta kod varsa kod, yoksa ad; boşluk ve büyük-küçük harf sayılmaz); eşlemeyi bırakmak askıdaki
// eski tedarikçiyi sessizce açardı. Firmaya birden çok kayıt bağlanırsa en kısıtlayıcı durum geçerlidir. Onayı geçersiz ya da boş
// kayıt durum vermez; kaydı olmayan firma haritada yoktur.
// Sözleşmedeki sıra en az kısıtlayıcıdan en çoğadır.
const KISIT_SIRASI: readonly KmTedarikciDurumu[] = KM_TEDARIKCI_DURUMLARI;
type TedarikciKaydi = { firmaId: number | null; kod: string | null; ad: string; onay: string | null };
type FirmaAdi = { id: number; kod: string | null; ad: string };
export function tedarikciOnayDurumlari(kayitlar: readonly TedarikciKaydi[], firmalar: readonly FirmaAdi[]): Map<number, KmTedarikciDurumu> {
  const yalin = (x: string | null) => (x ?? '').trim().toLocaleLowerCase('tr-TR');
  const eslesir = (f: FirmaAdi, k: TedarikciKaydi) => (yalin(f.kod) !== '' && yalin(k.kod) !== '' ? yalin(f.kod) === yalin(k.kod) : yalin(k.ad) !== '' && yalin(f.ad) === yalin(k.ad));
  const sonuc = new Map<number, KmTedarikciDurumu>();
  const koy = (id: number, d: KmTedarikciDurumu) => {
    const o = sonuc.get(id);
    if (o === undefined || KISIT_SIRASI.indexOf(d) > KISIT_SIRASI.indexOf(o)) sonuc.set(id, d);
  };
  for (const k of kayitlar) {
    const d = KISIT_SIRASI.find((x) => x === k.onay);
    if (d === undefined) continue;
    const bagli = k.firmaId !== null ? firmalar.filter((f) => f.id === k.firmaId) : firmalar.filter((f) => eslesir(f, k));
    for (const f of bagli) koy(f.id, d);
  }
  return sonuc;
}

// ---- AQL numune planı (564 2 a, 4 a) -------------------------------------------------------------------------------------------
// Kabul muayenesinin planı Kalite Merkezi'nindir: Arkon kalite istasyonunun lot planı ve lot kararı buradan gelir, ekran ile sunucu aynı
// tabloyu kullanır. ISO 2859-1 / ANSI-ASQ Z1.4 tek örneklemeli tablolar uygulamanın `yeni/aql.ts` dosyasıyla aynıdır (eşitlik testi
// `aql.test.ts`'de). AQL yalnız lot kabul yöntemidir; tezgah içi "her N parça" sıklığı Hazırlık'ta elle kalır (564 2 a).
export const AQL_SEVIYELERI = ['S-1', 'S-2', 'S-3', 'S-4', 'I', 'II', 'III'] as const;
const KOD_TABLOSU: readonly (readonly [number, number, string])[] = [[2, 8, 'AAAAAAB'], [9, 15, 'AAAAABC'], [16, 25, 'AABBBCD'], [26, 50, 'ABBCCDE'],
  [51, 90, 'BBCCCEF'], [91, 150, 'BBCDDFG'], [151, 280, 'BCDEEGH'], [281, 500, 'BCDEFHJ'], [501, 1200, 'CCEFGJK'], [1201, 3200, 'CDEGHKL'],
  [3201, 10000, 'CDFGJLM'], [10001, 35000, 'CDFHKMN'], [35001, 150000, 'DEGJLNP'], [150001, 500000, 'DEGJMPQ'], [500001, Infinity, 'DEHKNQR']];
const HARFLER = 'ABCDEFGHJKLMNPQRS'.split('');
const NUMUNELER = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150];
export const AQL_DEGERLERI = ['0.010', '0.015', '0.025', '0.040', '0.065', '0.10', '0.15', '0.25', '0.40', '0.65', '1.0', '1.5', '2.5', '4.0', '6.5', '10'];
export const AQL_YUZDE_YUZ = '%100';
const NORMAL_DIZI: Record<number, [number, number]> = { 0: [0, 1], 3: [1, 2], 4: [2, 3], 5: [3, 4], 6: [5, 6], 7: [7, 8], 8: [10, 11], 9: [14, 15], 10: [21, 22] };
const SIKI_DIZI: Record<number, [number, number]> = { 0: [0, 1], 2: [1, 2], 3: [2, 3], 4: [3, 4], 5: [5, 6], 6: [8, 9], 7: [12, 13], 8: [18, 19] };
export const AQL_NORMAL = 'Normal';
export const AQL_SIKI = 'Sıkılaştırılmış';
export const AQL_DURDURULDU = 'Durduruldu';
export type AqlSiddeti = typeof AQL_NORMAL | typeof AQL_SIKI;

type Hucre = readonly [number, number] | '↓' | '↑' | null | undefined;
export function aqlHucresi(i: number, j: number, siddet: string): Hucre {
  if (siddet === AQL_SIKI) {
    const e = i + j - 16;
    if (e < 0 || e === 1) return '↓';
    if (e > 8) return '↑';
    return SIKI_DIZI[e];
  }
  if (i > 15) return null;
  const d = i + j - 14;
  if (d < 0 || d === 2) return '↓';
  if (d === 1 || d > 10) return '↑';
  return NORMAL_DIZI[d];
}

export function aqlKodHarfi(N: number, seviye: string): string | null {
  const r = KOD_TABLOSU.find((x) => N >= x[0] && N <= x[1]);
  const i = (AQL_SEVIYELERI as readonly string[]).indexOf(seviye);
  return r && i >= 0 ? r[2][i] ?? null : null;
}

// Uygulamanın planıyla aynı alanlar: kod (tablo harfi), kodK (ok kuralından sonraki harf), numune, Ac, Re, %100 muayene ve not.
export interface AqlPlani { kod: string; kodK: string; n: number; ac: number; re: number; yuzde100: boolean; not: string }
export function aqlPlani(Nh: number, seviye: string, aql: string, siddet: string): AqlPlani | null {
  const N = Math.floor(Nh);
  if (!Number.isFinite(N) || N < 2) return null;
  if (aql === AQL_YUZDE_YUZ) return { kod: '—', kodK: '—', n: N, ac: 0, re: 1, yuzde100: true, not: '%100 muayene, sıfır kabul' };
  const L = aqlKodHarfi(N, seviye);
  const j = AQL_DEGERLERI.indexOf(aql);
  if (!L || j < 0) return null;
  let i = HARFLER.indexOf(L);
  const enCok = siddet === AQL_SIKI ? 16 : 15;
  let v: Hucre;
  let not = '';
  for (let g = 0; g < 40; g++) {
    v = aqlHucresi(i, j, siddet);
    if (Array.isArray(v)) break;
    if (v === '↓') {
      if (i < enCok) i++;
      else {
        not = 'Tablo sınırı: üstteki plan kullanıldı';
        do i--; while (i > 0 && !Array.isArray(aqlHucresi(i, j, siddet)));
        v = aqlHucresi(i, j, siddet);
        break;
      }
    } else if (i > 0) i--;
    else {
      i++;
      not = 'A satırında yukarı ok: alttaki ilk plan kullanıldı';
    }
  }
  if (!Array.isArray(v)) return null;
  const hucre = v as readonly [number, number];
  const r: AqlPlani = { kod: L, kodK: HARFLER[i] ?? L, n: NUMUNELER[i] ?? N, ac: hucre[0], re: hucre[1], yuzde100: false, not };
  if (HARFLER[i] !== L && !not) r.not = `Ok kuralı: ${L} → ${HARFLER[i] ?? ''}`;
  if (r.n >= N) {
    r.yuzde100 = true;
    r.n = N;
    r.not = `${r.not ? `${r.not}; ` : ''}numune ≥ parti, %100 muayene`;
  }
  return r;
}

// Uygulamanın lot anahtarı (parça no ve tedarikçi; iç üretim `IC`) ve sıkılık geçişi: normalde 5 lotta 2 ret sıkılaştırır,
// sıkılaştırılmışta 5 ardışık kabul normale döndürür, 5 ret durdurur; `tip: reset` sıkılaştırılmıştan başlatır, yeniden sunum sayılmaz.
export const lotAnahtari = (parcaNo: unknown, tedarikci: unknown): string =>
  `${(typeof parcaNo === 'string' ? parcaNo : '').trim().toLocaleUpperCase('tr')}|${typeof tedarikci === 'string' && tedarikci !== '' ? tedarikci : 'IC'}`;
export function lotSikiligi(lotlar: readonly Record<string, unknown>[], anahtar: string): AqlSiddeti | typeof AQL_DURDURULDU {
  const alan = (l: Record<string, unknown>, a: string): string => (typeof l[a] === 'string' ? (l[a] as string) : '');
  const L = lotlar.filter((l) => alan(l, 'anahtar') === anahtar)
    .sort((a, b) => alan(a, 'tarih').localeCompare(alan(b, 'tarih')) || alan(a, 'no').localeCompare(alan(b, 'no')));
  let st: AqlSiddeti | typeof AQL_DURDURULDU = AQL_NORMAL;
  let pencere: boolean[] = [];
  let sKabul = 0;
  let sRet = 0;
  for (const l of L) {
    if (l['tip'] === 'reset') {
      st = AQL_SIKI;
      sKabul = 0;
      sRet = 0;
      continue;
    }
    if (l['yenidenSunum'] === true) continue;
    const ok = l['karar'] === 'Kabul';
    if (st === AQL_DURDURULDU) continue;
    if (st === AQL_NORMAL) {
      pencere.push(ok);
      if (pencere.length > 5) pencere.shift();
      if (pencere.filter((x) => !x).length >= 2) {
        st = AQL_SIKI;
        pencere = [];
        sKabul = 0;
        sRet = 0;
      }
    } else if (ok) {
      sKabul++;
      if (sKabul >= 5) {
        st = AQL_NORMAL;
        pencere = [];
      }
    } else {
      sKabul = 0;
      sRet++;
      if (sRet >= 5) st = AQL_DURDURULDU;
    }
  }
  return st;
}

// Muayene planı: uygulamanın `settings/genel` kaydındaki varsayılan seviye ve sınıf AQL'leri (yoksa uygulamanın varsayılanları II,
// kritik %100, majör 1.0, minör 2.5) ile parti büyüklüğünden. Arkon'un istasyon planı tek numune sayısı ister: `n` örneklemeli
// sınıfların en büyük numunesidir (aynı numune bütün sınıflara bakılır); %100 muayeneli sınıf (varsayılanda kritik) yalnız kendi
// özelliklerinde bütün partiye bakar ve `n`'yi büyütmez, bütün sınıflar %100 ise `n` partidir. Sıkılık durdurulmuşsa plan yoktur
// (uygulama da yeni lotu kaydetmez).
export const AQL_SINIFLARI = ['Kritik', 'Majör', 'Minör'] as const;
export type AqlSinifi = (typeof AQL_SINIFLARI)[number];
const SINIF_ALANI: Record<AqlSinifi, 'kr' | 'mj' | 'mn'> = { Kritik: 'kr', Majör: 'mj', Minör: 'mn' };
export interface MuayeneAqlAyari { seviye: string; kr: string; mj: string; mn: string }
export function varsayilanAqlAyari(genel: Record<string, unknown> | null): MuayeneAqlAyari {
  const m = (a: string, v: string): string => (typeof genel?.[a] === 'string' && (genel[a] as string) !== '' ? (genel[a] as string) : v);
  return { seviye: m('seviye', 'II'), kr: m('kritik', AQL_YUZDE_YUZ), mj: m('major', '1.0'), mn: m('minor', '2.5') };
}
export interface MuayenePlani {
  N: number; ayar: MuayeneAqlAyari; siddet: AqlSiddeti; n: number;
  siniflar: { sinif: AqlSinifi; aql: string; kod: string; n: number; ac: number; re: number; yuzde100: boolean; not: string }[];
}
export function muayenePlani(N: number, ayar: MuayeneAqlAyari, siddet: AqlSiddeti): MuayenePlani | null {
  const siniflar: MuayenePlani['siniflar'] = [];
  for (const sinif of AQL_SINIFLARI) {
    const aql = ayar[SINIF_ALANI[sinif]];
    const p = aqlPlani(N, ayar.seviye, aql, siddet);
    if (p === null) return null;
    siniflar.push({ sinif, aql, kod: p.kodK, n: p.n, ac: p.ac, re: p.re, yuzde100: p.yuzde100, not: p.not });
  }
  const ornekli = siniflar.filter((x) => !x.yuzde100);
  return { N: Math.floor(N), ayar, siddet, n: ornekli.length === 0 ? Math.floor(N) : Math.max(...ornekli.map((x) => x.n)), siniflar };
}

// Lot kararı: sayısı verilen her sınıfta bulunan Ac'yi aşmıyorsa Kabul. Sayısı verilmeyen sınıf (istasyon sınıf ayırmıyorsa) null
// yazılır, sıfır sayılmaz; en az bir sınıfın sayısı gerekir.
export type LotBulunani = Record<AqlSinifi, number | null>;
export function lotKarari(plan: MuayenePlani, bulunan: LotBulunani): 'Kabul' | 'Ret' | null {
  const sayilan = plan.siniflar.filter((s) => bulunan[s.sinif] !== null);
  if (sayilan.length === 0) return null;
  return sayilan.every((s) => (bulunan[s.sinif] ?? 0) <= s.ac) ? 'Kabul' : 'Ret';
}

// 564 6 a: Arkon kalite istasyonunun lot kararı Kalite Merkezi'nde lot kabul kaydı olur; kayıt uygulamanın lot formundaki biçimdedir
// (`yeni/lot/LotFormu.tsx`) ve kararı verildiği için kilitlidir (KM-K89). Kimlik kaynak anahtarının özetidir: aynı karar ikinci kaydı
// açmaz. Numara uygulamanın `LOT-YYYY-NNNN` sırasıdır.
export const LOT_KAYNAKLARI = ['arkon'] as const;
export type LotKaynagi = (typeof LOT_KAYNAKLARI)[number];
export interface LotKarariIstegi {
  kaynak: LotKaynagi; kaynakAnahtari: string; uretimEmriId: number; parcaNo: string; parcaAdi: string | null; N: number;
  ayar: MuayeneAqlAyari | null; bulunan: LotBulunani; not: string | null;
}
export const lotKimligi = (kaynak: string, kaynakAnahtari: string): string =>
  `lot-${createHash('sha256').update(`${kaynak}\n${kaynakAnahtari}`).digest('hex').slice(0, 40)}`;
export function lotIstegiReddi(i: LotKarariIstegi): 'lotKaynagi' | 'lotParcasi' | 'lotBuyuklugu' | 'lotAyari' | 'lotSayisi' | null {
  if (!(LOT_KAYNAKLARI as readonly string[]).includes(i.kaynak)) return 'lotKaynagi';
  if (typeof i.kaynakAnahtari !== 'string' || i.kaynakAnahtari === '' || i.kaynakAnahtari.length > DOF_ANAHTAR_SINIRI) return 'lotKaynagi';
  if (metin(i.parcaNo) === '') return 'lotParcasi';
  if (!Number.isSafeInteger(i.N) || i.N < 2) return 'lotBuyuklugu';
  if (i.ayar !== null) {
    if (!(AQL_SEVIYELERI as readonly string[]).includes(i.ayar.seviye)) return 'lotAyari';
    if (![i.ayar.kr, i.ayar.mj, i.ayar.mn].every((a) => a === AQL_YUZDE_YUZ || AQL_DEGERLERI.includes(a))) return 'lotAyari';
  }
  const sayilar = AQL_SINIFLARI.map((s) => i.bulunan[s]);
  if (sayilar.some((x) => x !== null && !(Number.isSafeInteger(x) && x >= 0 && x <= i.N))) return 'lotSayisi';
  return sayilar.some((x) => x !== null) ? null : 'lotSayisi';
}

/* ---------------- Stüdyo: teknik resim, balon, numune, ölçüm (595 1 b, 597 a, 600 a) ---------------- */

export const STUDYO_ILETILER = {
  parcaYok: 'Parça kartı bulunamadı.',
  belgeYok: 'Belge merkezinde yayında revizyonu olan belge bulunamadı.',
  belgeTuru: 'Stüdyo yalnız PDF resim ile STEP, STL ve IGES model açar.',
  resimYok: 'Resim bulunamadı.',
  balonYok: 'Balon bulunamadı ya da resmi kaldırılmış.',
  revizyonDegisti: 'Belge merkezinde bu resmin yeni revizyonu yayında; alınan revizyon artık verilemiyor. Yeni revizyonu parçaya alın.',
  emirYok: 'Üretim emri bulunamadı.',
  numuneYok: 'Numune bulunamadı.',
  olcumYinelenen: 'Aynı balon bir girişte bir kez ölçülür.',
  balonEmirDisi: 'Balon bu emrin parçasının etkin resminde değil.',
  numuneEmirDisi: 'Numune bu emrin değil.',
  numuneKararli: 'Kararı verilmiş numuneye ölçüm girilmez.',
  balonNumuneDisi: 'Balon bu numunede istenmedi.',
  olcumSayisal: 'Bu ölçü sayısal değerle girilir.',
  olcumNitel: 'Bu ölçü geçer ya da geçmez ile girilir.',
  numuneBalonYinelenen: 'Numunede aynı balon bir kez istenir.',
  kararVar: 'Bu numunenin kararı verilmiş.',
  redOlcusuz: 'Red için en az bir ölçü girilmeli.',
  redGerekcesiz: 'Red için gerekçe yazılmalı.',
  kararEksikOlcum: 'Onay ve sapma için numunenin bütün balonları ölçülmeli.',
  onayUygunsuz: 'Uygunsuz ölçü varken onay verilmez; sapma ile onay ya da red seçilir.',
  sapmaGereksiz: 'Bütün ölçüler uygun; sapma değil onay verilir.',
  surumDegisti: 'Bu kayıt siz açtıktan sonra değişti; yenileyip yeniden deneyin.',
  resimPasif: 'Kaldırılmış resmin planı değiştirilmez.',
  balonNoTekrar: 'Aynı balon numarası planda bir kez kullanılır.',
  balonResimDisi: 'Balon bu resmin etkin balonu değil.',
  balonSinirEksik: 'Alt ve üst sınır birlikte verilir ya da ikisi de boş kalır (geçer/geçmez).',
  balonSinirTers: 'Alt sınır üst sınırdan büyük olamaz.',
  balonKonumEksik: 'Balon konumu x ve y ile birlikte verilir.',
  balonAcikNumunede: 'Kararı verilmemiş numunede istenen balon kaldırılamaz.',
  balonYerIkisi: 'Elle konan balon yeri ile istenen yerleşim birlikte verilmez.',
  kuralKimlikTekrar: 'Numune planında aynı kural kimliği bir kez kullanılır.',
  kuralBalonYok: 'Numune kuralındaki balon numarası parçanın etkin resimlerinde yok.',
} as const;
export type StudyoIletisi = keyof typeof STUDYO_ILETILER;

// Stüdyo PDF'i resim, STEP/STL/IGES'i model olarak açar (Arkon'un belge merkezinden aldığı türler); öteki türler stüdyoda açılmaz.
export function studyoResimTuru(dosyaTuru: string): 'resim' | 'model' | null {
  if (dosyaTuru === 'pdf') return 'resim';
  return dosyaTuru === 'step' || dosyaTuru === 'stl' || dosyaTuru === 'iges' ? 'model' : null;
}

interface Ondalik { isaret: -1 | 0 | 1; tam: string; kesir: string }
function ondalikCoz(s: string): Ondalik {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s);
  if (m === null) throw new Error(`Ondalık sayı değil: ${s}`);
  const tam = m[2]!.replace(/^0+/, '');
  const kesir = (m[3] ?? '').replace(/0+$/, '');
  return { isaret: tam === '' && kesir === '' ? 0 : m[1] === '-' ? -1 : 1, tam, kesir };
}

// Ölçülen değer ve balon sınırı ondalık metindir (numeric): kayan nokta yuvarlaması sınırdaki değeri yanlış tarafa atmasın diye
// basamak basamak karşılaştırılır.
export function ondalikKarsilastir(a: string, b: string): -1 | 0 | 1 {
  const x = ondalikCoz(a);
  const y = ondalikCoz(b);
  if (x.isaret !== y.isaret) return x.isaret < y.isaret ? -1 : 1;
  let mutlak: -1 | 0 | 1 = 0;
  if (x.tam.length !== y.tam.length) mutlak = x.tam.length < y.tam.length ? -1 : 1;
  else if (x.tam !== y.tam) mutlak = x.tam < y.tam ? -1 : 1;
  else {
    const n = Math.max(x.kesir.length, y.kesir.length);
    const xk = x.kesir.padEnd(n, '0');
    const yk = y.kesir.padEnd(n, '0');
    if (xk !== yk) mutlak = xk < yk ? -1 : 1;
  }
  return x.isaret < 0 ? (-mutlak as -1 | 0 | 1) : mutlak;
}

// Sınırı olan balon sayısal değerle, sınırı olmayan (geçer/geçmez mastarı) nitel sonuçla ölçülür; uygunluk sınırdan hesaplanır.
export function olcumSonucu(
  balon: { alt: string | null; ust: string | null }, girdi: { deger?: string | undefined; nitel?: 'gecer' | 'gecmez' | undefined },
): { uygun: boolean } | { ret: StudyoIletisi } {
  if (balon.alt !== null && balon.ust !== null) {
    if (girdi.deger === undefined) return { ret: 'olcumSayisal' };
    return { uygun: ondalikKarsilastir(balon.alt, girdi.deger) <= 0 && ondalikKarsilastir(girdi.deger, balon.ust) <= 0 };
  }
  if (girdi.nitel === undefined) return { ret: 'olcumNitel' };
  return { uygun: girdi.nitel === 'gecer' };
}

// Ölçülen balon emrin parçasının etkin resmindedir; numuneye girilen ölçü o emrin kararsız numunesinin istenen balonudur.
export function olcumIstegiReddi(i: {
  uretimEmriId: number; emirMalzemeNo: number | null; istenen: readonly number[]; balonlar: readonly { id: number; malzemeNo: number }[];
  numune: { uretimEmriId: number; balonlar: readonly number[]; karar: string | null } | null;
}): StudyoIletisi | null {
  if (new Set(i.istenen).size !== i.istenen.length) return 'olcumYinelenen';
  const bulunan = new Map(i.balonlar.map((b) => [b.id, b]));
  if (i.istenen.some((id) => bulunan.get(id)?.malzemeNo !== i.emirMalzemeNo)) return 'balonEmirDisi';
  if (i.numune === null) return null;
  if (i.numune.uretimEmriId !== i.uretimEmriId) return 'numuneEmirDisi';
  if (i.numune.karar !== null) return 'numuneKararli';
  const numunede = new Set(i.numune.balonlar);
  return i.istenen.every((id) => numunede.has(id)) ? null : 'balonNumuneDisi';
}

export function numuneIstegiReddi(i: { emirMalzemeNo: number | null; istenen: readonly number[]; balonlar: readonly { id: number; malzemeNo: number }[] }): StudyoIletisi | null {
  if (new Set(i.istenen).size !== i.istenen.length) return 'numuneBalonYinelenen';
  const bulunan = new Map(i.balonlar.map((b) => [b.id, b]));
  return i.istenen.every((id) => bulunan.get(id)?.malzemeNo === i.emirMalzemeNo) ? null : 'balonEmirDisi';
}

// Balon başına son ölçüm geçerlidir (düzeltme yeni ölçümdür); sıra zaman, eşitse kimlik.
export function sonOlcumler<T extends { balonId: number; zaman: string; id: number }>(olcumler: readonly T[]): Map<number, T> {
  const son = new Map<number, T>();
  for (const o of olcumler) {
    const onceki = son.get(o.balonId);
    if (onceki === undefined || Date.parse(o.zaman) > Date.parse(onceki.zaman) || (o.zaman === onceki.zaman && o.id > onceki.id)) son.set(o.balonId, o);
  }
  return son;
}

// Arkon kalite istasyonunun düğmeleriyle aynı kural, sunucuda: red en az bir ölçü ve gerekçe ister; onay ve sapma bütün balonların
// ölçülmesini ister; onay yalnız bütün son ölçüler uygunken, sapma yalnız uygunsuz ölçü varken verilir.
export function numuneKarariReddi(
  karar: 'onay' | 'ret' | 'sapma', not: string | null, balonlar: readonly number[], olcumler: readonly { balonId: number; zaman: string; id: number; uygun: boolean }[],
): StudyoIletisi | null {
  const son = sonOlcumler(olcumler);
  if (karar === 'ret') {
    if (son.size === 0) return 'redOlcusuz';
    return (not ?? '').trim() === '' ? 'redGerekcesiz' : null;
  }
  if (!balonlar.every((b) => son.has(b))) return 'kararEksikOlcum';
  const uygunsuzVar = balonlar.some((b) => son.get(b)?.uygun === false);
  if (karar === 'onay') return uygunsuzVar ? 'onayUygunsuz' : null;
  return uygunsuzVar ? null : 'sapmaGereksiz';
}

// Kontrol planı resim başına bütün yazılır (603 a). Kimlikli balon resmin etkin balonudur; listede olmayan etkin balon kaldırılır,
// ama kararsız numunede istenen balon kaldırılmaz (ölçülemez kalır, numune karara bağlanamaz).
export function balonPlaniReddi(i: {
  girdiler: readonly {
    id?: number | undefined; no: number; alt?: string | null | undefined; ust?: string | null | undefined; x?: number | null | undefined; y?: number | null | undefined;
    yer?: readonly [number, number] | null | undefined; yerKipi?: string | null | undefined;
  }[];
  etkinler: readonly number[]; acikNumunedekiler: ReadonlySet<number>;
}): StudyoIletisi | null {
  const nolar = i.girdiler.map((g) => g.no);
  if (new Set(nolar).size !== nolar.length) return 'balonNoTekrar';
  const etkin = new Set(i.etkinler);
  const idler = i.girdiler.flatMap((g) => (g.id === undefined ? [] : [g.id]));
  if (new Set(idler).size !== idler.length || idler.some((id) => !etkin.has(id))) return 'balonResimDisi';
  for (const g of i.girdiler) {
    if ((g.alt == null) !== (g.ust == null)) return 'balonSinirEksik';
    if (g.alt != null && g.ust != null && ondalikKarsilastir(g.alt, g.ust) > 0) return 'balonSinirTers';
    if ((g.x == null) !== (g.y == null)) return 'balonKonumEksik';
    const yer = balonYeriReddi(g);
    if (yer !== null) return yer;
  }
  const kalan = new Set(idler);
  return i.etkinler.some((id) => !kalan.has(id) && i.acikNumunedekiler.has(id)) ? 'balonAcikNumunede' : null;
}

// Balon yeri (894 a, 913 a): elle konan yer sabittir ve yerleşim isteğini anlamsız kılar; ikisi birlikte verilmez.
export function balonYeriReddi(g: { yer?: readonly [number, number] | null | undefined; yerKipi?: string | null | undefined }): StudyoIletisi | null {
  return g.yer != null && g.yerKipi != null ? 'balonYerIkisi' : null;
}

// Numune kuralındaki balon numaraları parçanın etkin resimlerindeki numaralardır; kural kimliği planda tekildir.
export function numunePlaniReddi(kurallar: readonly { kimlik: string; balonlar: 'hepsi' | 'kritik' | readonly number[] }[], balonNolari: ReadonlySet<number>): StudyoIletisi | null {
  const kimlikler = kurallar.map((k) => k.kimlik);
  if (new Set(kimlikler).size !== kimlikler.length) return 'kuralKimlikTekrar';
  return kurallar.every((k) => typeof k.balonlar === 'string' || k.balonlar.every((n) => balonNolari.has(n))) ? null : 'kuralBalonYok';
}

export function numuneDurumu(karar: 'onay' | 'ret' | 'sapma' | null, olcumSayisi: number): 'bekliyor' | 'olculuyor' | 'onay' | 'ret' | 'sapma' {
  if (karar !== null) return karar;
  return olcumSayisi > 0 ? 'olculuyor' : 'bekliyor';
}

export function siradakiLotNo(lotlar: readonly Record<string, unknown>[], yil: number): string {
  const on = `LOT-${String(yil)}-`;
  let enBuyuk = 0;
  for (const l of lotlar) {
    const no = l['no'];
    if (typeof no === 'string' && no.startsWith(on)) enBuyuk = Math.max(enBuyuk, parseInt(no.slice(on.length), 10) || 0);
  }
  return on + String(enBuyuk + 1).padStart(4, '0');
}

export function lotGovdesi(
  i: LotKarariIstegi, d: { no: string; gun: string; emirNo: string | null; muayeneci: string; plan: MuayenePlani; karar: 'Kabul' | 'Ret' },
): Record<string, unknown> {
  return {
    no: d.no, tarih: d.gun, parcaNo: metin(i.parcaNo), parcaAdi: metin(i.parcaAdi), tedarikci: '', lotNo: '', emir: d.emirNo ?? '', N: d.plan.N,
    seviye: d.plan.ayar.seviye, kr: d.plan.ayar.kr, mj: d.plan.ayar.mj, mn: d.plan.ayar.mn, muayeneci: d.muayeneci, yenidenSunum: false,
    bKr: i.bulunan.Kritik, bMj: i.bulunan.Majör, bMn: i.bulunan.Minör, not: metin(i.not), anahtar: lotAnahtari(i.parcaNo, ''), siddet: d.plan.siddet,
    plan: Object.fromEntries(d.plan.siniflar.map((s) => [s.sinif, { kod: s.kod, n: s.n, ac: s.ac, re: s.re, aql: s.aql }])),
    karar: d.karar, kaynak: i.kaynak, kaynakAnahtari: i.kaynakAnahtari, uretimEmriId: i.uretimEmriId,
  };
}

/* ---------------- iş emri, sipariş ve parça kaynakları (592, 594 a) ---------------- */

export const EMIR_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'emir';
export const PARCA_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'parca';
const BELGE_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'belge';
export type EmirKaynagiTuru = 'ue' | 'sa' | 'ms';
export const EMIR_TIPI: Readonly<Record<EmirKaynagiTuru, KmEmirTipi>> = { ue: 'İş emri', sa: 'Satınalma siparişi', ms: 'Müşteri siparişi' };
// Parça kartı seçimi: üretilen ve alınıp satılan kartlar (giriş muayenesi de bunlara bakar).
export const PARCA_TURLERI = ['mamul', 'yarimamul', 'ticari_mal'] as const satisfies readonly KatalogTuru[];

export const emirKimligi = (tur: EmirKaynagiTuru, id: number): string => `${tur}-${id}`;
export function emirKimligiCoz(kimlik: unknown): { tur: EmirKaynagiTuru; id: number } | null {
  const m = typeof kimlik === 'string' ? KM_EMIR_KIMLIGI.exec(kimlik) : null;
  return m ? { tur: m[1] as EmirKaynagiTuru, id: Number(m[2]) } : null;
}

const doluMetin = (v: unknown): string | null => metin(v) || null;
export const sayiMetni = (v: string | null): number | null => {
  if (v === null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

// Kalite Merkezi kayıtlarının iş emri ve siparişe bağları: belgenin kaynak kimliği ve lot, muayene, NCR'deki "İş emri / sipariş" metni.
export interface EmirBaglari { kimlikler: Map<EmirKaynagiTuru, number[]>; numaralar: string[] }
export function emirBaglari(kayitlar: { koleksiyon: string; govde: Record<string, unknown> }[]): EmirBaglari {
  const kimlikler = new Map<EmirKaynagiTuru, number[]>();
  const numaralar = new Set<string>();
  for (const { koleksiyon, govde } of kayitlar) {
    if (koleksiyon === BELGE_KOLEKSIYONU) {
      const bag = govde.bagli as { col?: unknown; id?: unknown } | undefined;
      const k = bag?.col === EMIR_KOLEKSIYONU ? emirKimligiCoz(bag.id) : null;
      if (k) kimlikler.set(k.tur, [...(kimlikler.get(k.tur) ?? []), k.id]);
      continue;
    }
    for (const alan of koleksiyon === 'lot' ? ['emir', 'siparis'] : ['emir']) {
      const no = doluMetin(govde[alan]);
      if (no) numaralar.add(no);
    }
  }
  return { kimlikler, numaralar: [...numaralar].sort() };
}

// Kalite Merkezi'nin kendi eski iş emri kaydının numarası; sahibinde aynı numara varsa eşleşir (tip ayrımı yok: numara tektir).
export const eskiEmirNo = (govde: Record<string, unknown>): string | null => doluMetin(govde.no);
export const eskiEmirTipi = (govde: Record<string, unknown>): string | null => doluMetin(govde.tip);
// Eski parça kartı: 592 B2 a'dan sonra kart malzeme kimliğini taşır; öncesinde yalnız parça numarası (stok kodu sayılır).
export const parcaKartiMalzemeNo = (govde: Record<string, unknown>): number | null =>
  typeof govde.malzemeNo === 'number' && Number.isInteger(govde.malzemeNo) && govde.malzemeNo > 0 ? govde.malzemeNo : null;
export const parcaKartiNo = (govde: Record<string, unknown>): string | null => doluMetin(govde.parcaNo);

// Termin sırası: yakın termin önce, termini olmayan sonda; eşitlikte numara.
export function emirKaynakSirasi<T extends { termin: string | null; no: string }>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => (a.termin ?? '9999').localeCompare(b.termin ?? '9999') || a.no.localeCompare(b.no, 'tr'));
}

// Satın alma sipariş satırı: parça satırın katalog kartıdır; kartsız kalemde parça numarası boş, ad kalemin adı.
export interface SatinAlmaSatiri {
  id: number; siparisNo: string; firmaId: number | null; tedarikciAdi: string; malzemeNo: number | null; kalemAdi: string; miktar: string; beklenenTeslim: string | null;
}
export function satinAlmaKaynagi(r: SatinAlmaSatiri, acik: boolean, parcalar: ReadonlyMap<number, { kod: string; ad: string | null }>): KmEmirKaynagi {
  const p = r.malzemeNo === null ? undefined : parcalar.get(r.malzemeNo);
  return {
    kimlik: emirKimligi('sa', r.id), no: r.siparisNo, tip: EMIR_TIPI.sa, acik, parcaNo: p?.kod ?? null, parcaAdi: p?.ad ?? r.kalemAdi,
    miktar: sayiMetni(r.miktar), termin: r.beklenenTeslim, firmaId: r.firmaId, firmaAd: r.tedarikciAdi,
  };
}
