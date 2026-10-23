import { DOSYA_TURLERI } from '#paylasilan/sozlesme/dosya.ts';
import { createHash } from 'node:crypto';
import type { KaliteMerkeziKoleksiyonu, KmOnayReddiAlani } from '#paylasilan/sozlesme/kalite-merkezi.ts';
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
  izDegismez: 'Değişiklik izi kayıtları değiştirilemez.',
  izSilinmez: 'Değişiklik izi kayıtları silinemez.',
  dosyaYok: 'Dosya bulunamadı.',
  yalnizYonetici: 'Kalite Merkezi kullanıcı ve ayar kayıtlarını yalnız yönetici değiştirir.',
  arsivYonetici: 'Kayıtları yalnız yönetici arşive alır.',
  silmeYonetici: 'Kalite Merkezi kayıtlarını yalnız yönetici siler.',
  kaynakOnay: 'Tedarikçi ve form şablonu kayıtlarını onay yetkisi olan değiştirir.',
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
} as const;

// Uygulamanın rolleri ve ayarları bu kayıtlardadır; giriş TMI oturumu olduğu için onları yalnız yönetici değiştirir.
const YONETICI_KOLEKSIYONLARI: readonly string[] = ['kullanici', 'settings'];
export const yoneticiKoleksiyonuMu = (koleksiyon: string): boolean => YONETICI_KOLEKSIYONLARI.includes(koleksiyon);

// Soru 229 a: uygulamanın ekranda rol seviyesiyle sınırladığı kaynak kayıtları (tedarikçi ve form şablonu; uygulamada Kalite
// mühendisi) sunucuda onay işlemini ister. Silme ve arşivleme yöneticinindir (uygulamada Kalite yöneticisi).
const KAYNAK_KOLEKSIYONLARI: readonly string[] = [TEDARIKCI_KOLEKSIYONU, 'tpl'];
export const kaynakKoleksiyonuMu = (koleksiyon: string): boolean => KAYNAK_KOLEKSIYONLARI.includes(koleksiyon);

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
  sup: { onay: { degerler: ['Onaylı', 'Şartlı onaylı', 'Aday', TEDARIKCI_ASKIDA] } },
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
const LOT_KOLEKSIYONU: KaliteMerkeziKoleksiyonu = 'lot';
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

// İlk parça kararı bekleyenler: karar bekleyen sayımı olan açık emirler, emir sırasıyla (325 a).
export function ilkParcaBekleyenleri(emirler: readonly BekleyenEmir[], sayaclar: ReadonlyMap<number, { kararBekliyor: number }>) {
  return emirler
    .flatMap((e) => {
      const kararBekleyenAdet = sayaclar.get(e.id)?.kararBekliyor ?? 0;
      return kararBekleyenAdet > 0 ? [{ uretimEmriId: e.id, emirNo: e.emirNo, parcaNo: e.parcaNo, parcaAd: e.parcaAd, adet: e.adet, kararBekleyenAdet }] : [];
    })
    .sort((a, b) => a.uretimEmriId - b.uretimEmriId);
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
