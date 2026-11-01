import { HEDEF_IS_GUNU, KARAR_KODLARI, MRB_KODLARI, mrbKarariMi, onerilenSinif } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type {
  Aciliyet, Cevap, EmirDurumu, GorevIslemi, HatAsamasi, EtkiAnalizi, FaiTuru, Gecerlilik, KapanisKosulu, KararHedefi, KararKodu, KararModu, KosulHali, Sinif,
  SiniflandirmaSorusu, TalepDurumu, UyumHali,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type { DEGISIKLIK_YONETIMI_ISLEMLERI } from '#paylasilan/islemler/degisiklik-yonetimi.ts';

type DegisiklikYonetimiIslemi = (typeof DEGISIKLIK_YONETIMI_ISLEMLERI)[number];

// İş kuralları DY numarasıyla KURAL-TEST.md'de testine bağlıdır. Veritabanı ve saat yok: bugün çağırandan gelir.

export type Cevaplar = Readonly<Record<SiniflandirmaSorusu, Cevap | null>>;

// DY-1: sınıf önerisi sözleşmededir (onerilenSinif; istemci de onu kullanır). 'planlama' çıkarsa talep gerekmez (1120 a).
export const talepGerekmezMi = (c: Cevaplar): boolean => onerilenSinif(c) === 'planlama';

export const PARAMETRE_ILETISI = 'Yalnız süre veya tezgâh tercihi değişiyorsa değişiklik talebi gerekmez; bu bir planlama parametresidir.';

// DY-2: talep ve emir adımları yalnız sıradaki durumda yapılır. Anahtar adım, değer başlangıç durumu.
export const TALEP_ADIMLARI = {
  siniflandir: 'gonderildi', etkiAnalizi: 'analizde', ccb: 'ccb_bekliyor', musteriOnayi: 'musteri_onayi_bekliyor', emirAc: 'onaylandi',
} as const satisfies Record<string, TalepDurumu>;
export const EMIR_ADIMLARI = {
  taslakAc: ['acik'], kalemKaydet: ['revizyon_hazirlaniyor'], yayinaGonder: ['revizyon_hazirlaniyor'], geriGonder: ['yayina_hazir'],
  yayinla: ['yayina_hazir'], karar: ['karar'], faiOnayla: ['karar', 'uygulamada'], kapat: ['dogrulama'],
} as const satisfies Record<string, readonly EmirDurumu[]>;

export function talepAdimiUygunMu(adim: keyof typeof TALEP_ADIMLARI, durum: TalepDurumu): boolean {
  return TALEP_ADIMLARI[adim] === durum;
}
export function emirAdimiUygunMu(adim: keyof typeof EMIR_ADIMLARI, durum: EmirDurumu): boolean {
  return (EMIR_ADIMLARI[adim] as readonly EmirDurumu[]).includes(durum);
}

// DY-3 (1122 a): talebi açan kişi kendi talebine CCB kararı veremez (görevler ayrılığı).
export const kendiTalebiMi = (acanKisiId: number, kisiId: number): boolean => acanKisiId === kisiId;

// DY-4: etki analizindeki ilk parça şartı sınıftan gelir.
export function faiGereksinimi(sinif: Sinif): EtkiAnalizi['fai'] {
  return sinif === 'D1' ? 'tam_ve_kismi' : sinif === 'P1' ? 'kismi' : 'gerekmez';
}

// DY-5: CCB onayından sonra müşteri onayı D1'de istenir; müşteri yetkisini veren bağ yoksa (null) güvenli yön seçilir, istenir.
export const musteriOnayiIstenirMi = (sinif: Sinif, musteriOnayiGerekir: boolean | null): boolean =>
  sinif === 'D1' && musteriOnayiGerekir !== false;

// Aşama 1: bölümlerin sahibi modüller bağlı değil; bilinmeyen null'dır, boş dizi uydurulmaz.
export function etkiAnaliziKur(sinif: Sinif, zaman: string): EtkiAnalizi {
  return {
    zaman, ustParcalar: null, emirler: null, stok: null, sahada: null, ncProgramlari: null,
    fai: faiGereksinimi(sinif), musteriOnayiGerekir: null, stoktakiSeri: null, mrbAdayi: null,
  };
}

// DY-6: değiştirilebilirlik iki yönde evet değilse yeni parça numarası gerekir; yalnız tasarım sınıfında sorulur. Cevap eksikse bilinmez.
export function yeniParcaNoGerekirMi(sinif: Sinif, eskiYeniye: Cevap | null, yeniEskiye: Cevap | null): boolean | null {
  if (sinif === 'P1' || sinif === 'P2') return false;
  if (eskiYeniye === 'hayir' || yeniEskiye === 'hayir') return true;
  return eskiYeniye === null || yeniEskiye === null ? null : false;
}

export interface KalemTaslagi {
  malzemeAdi: string;
  eskiYeniyeUyar: Cevap | null;
  yeniEskiyeUyar: Cevap | null;
  yeniParcaNo: string | null;
  ozet: string;
}

// DY-7: yayın onayına gönderilmeden önce her kalemde özet yazılmış, tasarım sınıfında değiştirilebilirlik cevaplanmış ve gerekiyorsa
// yeni parça numarası verilmiş olmalı. İlk eksik iletiyle döner; eksik yoksa null.
export function yayinaGonderimEksigi(sinif: Sinif, kalemler: readonly KalemTaslagi[]): string | null {
  if (kalemler.length === 0) return 'Değişiklik emrinde parça yok.';
  for (const k of kalemler) {
    if (k.ozet.trim() === '') return `${k.malzemeAdi}: değişiklik özetini yazın.`;
    const gerekir = yeniParcaNoGerekirMi(sinif, k.eskiYeniyeUyar, k.yeniEskiyeUyar);
    if (gerekir === null) return `${k.malzemeAdi}: değiştirilebilirlik sorularını yanıtlayın.`;
    if (gerekir && k.yeniParcaNo === null) return `${k.malzemeAdi}: değiştirilemez değişiklik yeni parça numarası ister.`;
  }
  return null;
}

// DY-8: ilk parça şartı yayında doğar. D1'de yeni parça numarası alan kalem tam, revizyon kalemi kısmi; P1'de kısmi; D2 ve P2'de yok.
export function ilkParcaTuru(sinif: Sinif, yeniParcaNo: string | null): FaiTuru | null {
  if (sinif === 'D1') return yeniParcaNo === null ? 'kismi' : 'tam';
  return sinif === 'P1' ? 'kismi' : null;
}

// Etkilenen üretim emrinin karar için gereken özeti. Sahibi üretim emirleri modülüdür; Aşama 2'de bağlanır.
export interface EtkilenenEmir {
  durum: 'planli' | 'serbest' | 'uretimde' | 'fasonda' | 'tamamlandi';
  // En az bir adım başladı ya da bitti.
  basladi: boolean;
  donmus: boolean;
  // Emrin seri aralığı (son ürün geçerliliğindeki ürün için); yoksa null.
  seriAraligi: readonly [number, number] | null;
  // Emrin ürünü (ya da hizmet ettiği seri ürün) geçerliliğin son ürünü mü.
  sonUrunu: boolean;
  baslangic: string;
  // Yeni rotayla termin kayıyor mu; hesaplanamıyorsa null.
  terminKayar: boolean | null;
}

export interface KararOnerisi { kod: KararKodu; mod: KararModu; gerekce: string }

// DY-9: etkilenen emir için karar önerisi (prototipteki öneri tablosu). Sıra önemlidir: seri sınırı, tarih, bitmiş, fason, başlamış, donmuş bölge.
export function emirKarariOner(sinif: Sinif, gecerlilik: Gecerlilik | null, e: EtkilenenEmir): KararOnerisi {
  const d1 = sinif === 'D1';
  const guclu = sinif === 'D1' || sinif === 'P1';
  if (gecerlilik?.tur === 'seri' && e.seriAraligi !== null && e.sonUrunu) {
    const [ilk, son] = e.seriAraligi;
    if (son < gecerlilik.ilkSeri) {
      return e.durum === 'tamamlandi'
        ? { kod: 'islem_yok', mod: d1 ? 'onayli' : 'otomatik', gerekce: 'Seriler geçerlilik başlangıcından önce.' }
        : { kod: 'eskiyle_tamamla', mod: d1 ? 'onayli' : 'otomatik', gerekce: 'Seriler geçerlilik başlangıcından önce; eski konfigürasyonda kalır.' };
    }
    if (ilk < gecerlilik.ilkSeri) return { kod: 'beklet', mod: 'mrb', gerekce: 'Seri aralığı geçerlilik sınırını kesiyor; emir bölünmeli.' };
  }
  if (gecerlilik?.tur === 'tarih' && e.baslangic < gecerlilik.tarih && !e.basladi && e.durum !== 'tamamlandi') {
    return { kod: 'eskiyle_tamamla', mod: 'onayli', gerekce: 'Planlanan başlangıç geçerlilik tarihinden önce.' };
  }
  if (e.durum === 'tamamlandi') {
    return d1
      ? { kod: 'rework', mod: 'mrb', gerekce: 'Bitmiş ürün eski konfigürasyonda. MRB rework, yedek veya hurda kararı vermeli.' }
      : { kod: 'islem_yok', mod: sinif === 'P1' ? 'onayli' : 'otomatik', gerekce: 'Bitmiş ürün değiştirilebilir; olduğu gibi kullanılır.' };
  }
  if (e.durum === 'fasonda') {
    return guclu
      ? { kod: 'beklet', mod: 'mrb', gerekce: 'Parçalar fasonda. Dönüşte karantina, karar MRB’de.' }
      : { kod: 'eskiyle_tamamla', mod: 'onayli', gerekce: 'Fasondaki parça değiştirilebilir.' };
  }
  if (e.basladi) {
    if (d1) return { kod: 'beklet', mod: 'mrb', gerekce: 'Fiziksel parça üretildi. MRB rework, sapma, yedek veya hurda kararı vermeli.' };
    if (sinif === 'D2') return { kod: 'eskiyle_tamamla', mod: 'onayli', gerekce: 'Değiştirilebilir değişiklik; başlamış emir eski revizyonla biter.' };
    return { kod: 'kalanlari_gecir', mod: sinif === 'P1' ? 'mrb' : 'onayli', gerekce: 'Biten operasyonlar eski rotada kalır, başlamamışlar yeni rotaya geçer.' };
  }
  if (e.donmus) {
    return guclu
      ? { kod: 'yeniden_olustur', mod: 'mrb', gerekce: 'Donmuş bölge içinde; otomatik değişiklik yapılmaz.' }
      : { kod: 'eskiyle_tamamla', mod: 'onayli', gerekce: 'Donmuş bölge içinde; değiştirilebilir değişiklik eski revizyonla biter.' };
  }
  if (e.durum === 'serbest' && guclu) return { kod: 'yeniden_olustur', mod: 'onayli', gerekce: 'Serbest bırakılmış ama malzeme çekilmemiş.' };
  // Termin hesaplanamıyorsa otomatik uygulanmaz.
  if (e.terminKayar !== false) {
    return { kod: 'yeniden_olustur', mod: 'onayli', gerekce: e.terminKayar ? 'Yeni rota ile termin kayıyor.' : 'Yeni rotayla termin hesaplanamadı.' };
  }
  return { kod: 'yeniden_olustur', mod: 'otomatik', gerekce: 'Donmuş bölge dışında, fiziksel iş yok, termin kaymıyor.' };
}

// DY-10: serbest eski revizyon stoku için öneri. Değiştirilemez değişiklikte eski stok yalnız eski konfigürasyona hizmet eder (MRB).
export function stokKarariOner(sinif: Sinif): KararOnerisi {
  return sinif === 'D1'
    ? { kod: 'eski_yedek', mod: 'mrb', gerekce: 'Değiştirilemez değişiklik. Eski stok yalnızca eski konfigürasyona hizmet edebilir.' }
    : { kod: 'islem_yok', mod: 'otomatik', gerekce: 'Değiştirilebilir; stok kullanılabilir.' };
}

// DY-11: hedefe uygulanabilecek kodlar. Bitmiş emirde yeniden oluşturma ve geçirme yok; başlamış emir yeniden oluşturulmaz; yeni parça numarası
// alan kalemde kalanlar yeni revizyona geçirilemez. Stokta yalnız yedek, işlem yok, hurda ve rework.
export function izinliKodlar(hedef: KararHedefi, emir: EtkilenenEmir | null, yeniParcaNoVar: boolean): KararKodu[] {
  if (hedef === 'stok' || emir === null) return ['eski_yedek', 'islem_yok', 'hurda', 'rework'];
  if (emir.durum === 'tamamlandi') return ['islem_yok', 'rework', 'eski_yedek', 'hurda', 'eskiyle_tamamla_sapma'];
  const kodlar: KararKodu[] = [];
  if (!emir.basladi) kodlar.push('yeniden_olustur');
  if (emir.basladi && !yeniParcaNoVar) kodlar.push('kalanlari_gecir');
  kodlar.push('eskiyle_tamamla', 'eskiyle_tamamla_sapma', 'eski_yedek', 'hurda', 'beklet');
  return kodlar;
}

export interface KararDurumu {
  mod: KararModu;
  onerilenKod: KararKodu;
  izinliKodlar: readonly KararKodu[];
  verilenKod: KararKodu | null;
}

// DY-12 (1122 düzeltmesi): kararı hangi işlem verir. Hurda, rework, sapma, yedek ve MRB modundaki her kod mrb-karar ister.
export function kararIslemi(mod: KararModu, kod: KararKodu): Extract<DegisiklikYonetimiIslemi, 'degisiklik-yonetimi.karar-ver' | 'degisiklik-yonetimi.mrb-karar'> {
  return mrbKarariMi(mod, kod) ? 'degisiklik-yonetimi.mrb-karar' : 'degisiklik-yonetimi.karar-ver';
}

// DY-13: toplu onay yalnız MRB olmayan, bekletme olmayan ve hedefe uygulanabilen önerileri verir.
export function topluUygulanirMi(k: KararDurumu): boolean {
  return k.verilenKod === null && k.onerilenKod !== 'beklet' && !mrbKarariMi(k.mod, k.onerilenKod) && k.izinliKodlar.includes(k.onerilenKod);
}

// DY-14: emir kendiliğinden ilerler: bütün kararlar verilince uygulamaya, bütün ilk parça şartları onaylanınca doğrulamaya.
export function emirIlerler(durum: EmirDurumu, kararlarTamam: boolean, faiTamam: boolean): EmirDurumu {
  let d = durum;
  if (d === 'karar' && kararlarTamam) d = 'uygulamada';
  if (d === 'uygulamada' && faiTamam) d = 'dogrulama';
  return d;
}

export interface KapanisGirdisi {
  kaynakBagli: boolean;
  bekleyenKarar: number;
  bekleyenFai: number;
}

// DY-15: kapanış koşulları. Bağlı olmayan kaynak 'bilinmiyor' döner ve kapanışı durdurmaz (Aşama 1, S0 varsayım 5); 'eksik' durdurur.
// Uyumsuz seri ve yeni revizyonla üretim kanıtı markalama, rota ve üretim emirleri bağlanınca gelir.
export function kapanisKosullari(g: KapanisGirdisi): { kosul: KapanisKosulu; durum: KosulHali; ayrinti: string | null }[] {
  const kararDurumu: KosulHali = g.bekleyenKarar > 0 ? 'eksik' : g.kaynakBagli ? 'tamam' : 'bilinmiyor';
  return [
    { kosul: 'kararlar', durum: kararDurumu, ayrinti: g.bekleyenKarar > 0 ? `${g.bekleyenKarar} karar bekliyor.` : g.kaynakBagli ? null : 'Etkilenen emir ve stok kaynağı bağlı değil.' },
    { kosul: 'fai', durum: g.bekleyenFai > 0 ? 'eksik' : 'tamam', ayrinti: g.bekleyenFai > 0 ? `${g.bekleyenFai} ilk parça onayı bekliyor.` : null },
    { kosul: 'uyumsuz_seri', durum: 'bilinmiyor', ayrinti: 'Seri kaydı bağlı değil.' },
    { kosul: 'yeni_revizyonla_uretim', durum: 'bilinmiyor', ayrinti: 'Rota ve üretim kaydı bağlı değil.' },
  ];
}

export const kapatilabilirMi = (kosullar: readonly { durum: KosulHali }[]): boolean => kosullar.every((k) => k.durum !== 'eksik');

// DY-16: seri uyumu. Sapmalı seri sapmayla kabul edilir; geçerlilik kuralı yoksa uyumludur; yeni revizyonla yapılıp yapılmadığı bilinmiyorsa
// bilinmiyor; ilk seriden itibaren yeni, öncesinde eski revizyon beklenir.
export function seriUyumu(g: { sapmali: boolean; ilkSeri: number | null; seri: number; yeniRevizyonla: boolean | null }): UyumHali {
  if (g.sapmali) return 'sapmali';
  if (g.ilkSeri === null) return 'uyumlu';
  if (g.yeniRevizyonla === null) return 'bilinmiyor';
  return (g.seri >= g.ilkSeri) === g.yeniRevizyonla ? 'uyumlu' : 'uyumsuz';
}

const GUN_MS = 86_400_000;
const gunSayisi = (tarih: string): number => Date.parse(`${tarih}T00:00:00Z`) / GUN_MS;

// DY-17: iş günü farkı (`baslangic` hariç, `bitis` dahil; cumartesi ve pazar sayılmaz). Tatil takvimi vardiya modülündedir, bağlamada gelir.
export function isGunuFarki(baslangic: string, bitis: string): number {
  const a = gunSayisi(baslangic);
  const b = gunSayisi(bitis);
  let n = 0;
  for (let g = a + 1; g <= b; g += 1) {
    const haftaGunu = new Date(g * GUN_MS).getUTCDay();
    if (haftaGunu !== 0 && haftaGunu !== 6) n += 1;
  }
  return n;
}

// DY-17: çevrim hedefi müşteri onayını beklenen günleri saymaz (prototip: "müşteri onay süresi hariç"). Bekleme çevrimin içindedir.
export function cevrimIsGunu(acilis: string, kapanis: string, musteriBekleme: { baslangic: string; bitis: string } | null): number {
  const toplam = isGunuFarki(acilis, kapanis);
  if (musteriBekleme === null) return toplam;
  return Math.max(0, toplam - isGunuFarki(musteriBekleme.baslangic, musteriBekleme.bitis));
}

// DY-18: görev hedef süresi aciliyetten (acil 1, yüksek 3, normal 5 iş günü); hedefi aşan geç kalmıştır.
export function gorevSuresi(aciliyet: Aciliyet, sonAdim: string, bugun: string): { yasIsGunu: number; hedefIsGunu: number; gecikti: boolean } {
  const yasIsGunu = isGunuFarki(sonAdim, bugun);
  const hedefIsGunu = HEDEF_IS_GUNU[aciliyet];
  return { yasIsGunu, hedefIsGunu, gecikti: yasIsGunu > hedefIsGunu };
}

export const MRB_KODU_LISTESI: readonly KararKodu[] = MRB_KODLARI.filter((k) => (KARAR_KODLARI as readonly string[]).includes(k));

export interface GorevAdimi { adim: string; islem: GorevIslemi }

// DY-19: talebin sıradaki adımı ve onu yapan işlem. Ekip görünümü bütün adımları gösterir; kimin olduğunu `benimGorevimMi` söyler.
export function talepGorevi(durum: TalepDurumu): GorevAdimi | null {
  switch (durum) {
    case 'gonderildi': return { adim: 'Talebi sınıflandır', islem: 'degisiklik-yonetimi.siniflandir' };
    case 'analizde': return { adim: 'Etki analizini çalıştır', islem: 'degisiklik-yonetimi.siniflandir' };
    case 'ccb_bekliyor': return { adim: 'CCB kararı ver', islem: 'degisiklik-yonetimi.ccb-karar' };
    case 'musteri_onayi_bekliyor': return { adim: 'Müşteri onayını kaydet', islem: 'degisiklik-yonetimi.musteri-onayi' };
    case 'onaylandi': return { adim: 'ECO aç', islem: 'degisiklik-yonetimi.emir-ac' };
    case 'emir_acildi': case 'reddedildi':
    default: return null;
  }
}

// DY-19: emrin bekleyen adımları; karar ve ilk parça işleri sayısıyla tek satırdır.
export function emirGorevleri(e: { durum: EmirDurumu; bekleyenKarar: number; bekleyenMrb: number; bekleyenFai: number }): GorevAdimi[] {
  switch (e.durum) {
    case 'acik': return [{ adim: 'Revizyon hazırlığını başlat', islem: 'degisiklik-yonetimi.revizyon-hazirla' }];
    case 'revizyon_hazirlaniyor': return [{ adim: 'Yeni revizyonları hazırla', islem: 'degisiklik-yonetimi.revizyon-hazirla' }];
    case 'yayina_hazir': return [{ adim: 'Geçerliliği belirle ve yayınla', islem: 'degisiklik-yonetimi.yayinla' }];
    case 'dogrulama': return [{ adim: 'ECO’yu kapat', islem: 'degisiklik-yonetimi.kapat' }];
    case 'kapandi': return [];
    case 'karar': case 'uygulamada':
    default: break;
  }
  const adimlar: GorevAdimi[] = [];
  if (e.bekleyenKarar > 0) adimlar.push({ adim: `Disposition onayla (${e.bekleyenKarar})`, islem: 'degisiklik-yonetimi.karar-ver' });
  if (e.bekleyenMrb > 0) adimlar.push({ adim: `MRB kararı ver (${e.bekleyenMrb})`, islem: 'degisiklik-yonetimi.mrb-karar' });
  if (e.bekleyenFai > 0) adimlar.push({ adim: `İlk parça kontrolünü onayla (${e.bekleyenFai})`, islem: 'degisiklik-yonetimi.fai-onayla' });
  return adimlar;
}

// DY-19: adım, işlemi olan kişinindir; talebi açana kendi talebinin CCB adımı düşmez (DY-3).
export function benimGorevimMi(g: GorevAdimi, islemler: readonly string[], kendiTalebi: boolean): boolean {
  return islemler.includes(g.islem) && !(kendiTalebi && g.islem === 'degisiklik-yonetimi.ccb-karar');
}

// Değişiklik hattının aşaması: açık talep, revizyon, yayın, karar, ilk parça, kapanış. Kapanmış emir ve kapanmış talep hatta yoktur.
export function talepHatti(durum: TalepDurumu): HatAsamasi | null {
  return durum === 'emir_acildi' || durum === 'reddedildi' ? null : 'talep';
}
export function emirHatti(durum: EmirDurumu): HatAsamasi | null {
  const esleme: Record<EmirDurumu, HatAsamasi | null> = {
    acik: 'revizyon', revizyon_hazirlaniyor: 'revizyon', yayina_hazir: 'yayin', karar: 'karar', uygulamada: 'fai', dogrulama: 'kapanis', kapandi: null,
  };
  return esleme[durum];
}
