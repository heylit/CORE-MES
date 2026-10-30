import { createHash } from 'node:crypto';
import { ATOLYE_NEDENLERI } from '#paylasilan/sozlesme/nizamiye.ts';
import type { Neden, ZiyaretDurumu } from '#paylasilan/sozlesme/nizamiye.ts';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';

// Son giriş ya da çıkış bu süre içinde geri alınabilir (NZ-07): yanlış satıra basan görevli hemen düzeltir, eski kayıt değişmez.
export const GERI_ALMA_SURESI_DK = 10;
// Ön kayıt bu kadar geçmişe ya da ileriye açılamaz (NZ-09).
export const ON_KAYIT_GECMIS_DK = 60;
export const ON_KAYIT_ILERI_GUN = 90;

interface GirisDurumu {
  durum: ZiyaretDurumu;
  neden: Neden;
  kimlikGoruldu: boolean;
  atolye: boolean;
}

// NZ-01 yalnız beklenen ziyaret içeri alınır; NZ-02 kimlik görülmeden ve atölyeye girecek nedende kask ve gözlük verilmeden alınmaz.
export function girisHatasi(z: GirisDurumu): string | null {
  if (z.durum !== 'beklenen') return 'Bu ziyaret beklenen durumda değil; içeri alınamaz.';
  if (!z.kimlikGoruldu) return 'Kimlik görülmeden içeri alınmaz.';
  if (ATOLYE_NEDENLERI.includes(z.neden) && !z.atolye) return 'Atölyeye girecek: kask ve gözlük verildiği işaretlenmeli.';
  return null;
}

// NZ-03 kart yalnız rafta boşsa verilir.
export function kartVerilemezse(kart: { durum: string; icerideMi: boolean } | null): string | null {
  if (kart === null) return 'Kart bulunamadı.';
  if (kart.icerideMi) return 'Bu kart içerideki başka bir ziyaretçide.';
  if (kart.durum === 'kayip') return 'Bu kart kayıp; rafa alınmadan verilmez.';
  if (kart.durum === 'hasarli') return 'Bu kart hasarlı; rafa alınmadan verilmez.';
  return null;
}

// NZ-04 yalnız içerideki çıkar; NZ-05 dizüstü ya da kamerayla girenin çıkışında eşya kontrolü işaretlenir.
export function cikisHatasi(z: { durum: ZiyaretDurumu; dizustu: boolean; ekipmanKontrol: boolean | null }): string | null {
  if (z.durum !== 'iceride') return 'Bu ziyaretçi içeride değil.';
  if (z.dizustu && z.ekipmanKontrol !== true) return 'Dizüstü ya da kamerayla girdi: çıkışta çanta ve cihaz kontrol edilmeli.';
  return null;
}

// NZ-06 yalnız beklenen ziyaret iptal edilir.
export function iptalHatasi(durum: ZiyaretDurumu): string | null {
  return durum === 'beklenen' ? null : 'Yalnız gelmemiş (beklenen) ziyaret iptal edilir.';
}

export type GeriAlma = { tur: 'giris'; habersiz: boolean } | { tur: 'cikis' };

// NZ-07 son işlem süre içindeyse geri alınır: içerideki girişe, çıkan çıkışa döner. Habersiz girişin geri alınması kaydı iptal eder.
export function geriAlma(
  z: { durum: ZiyaretDurumu; giris: number | null; cikis: number | null; beklenenZaman: number | null },
  simdi: number,
): GeriAlma | { hata: string } {
  const sinir = GERI_ALMA_SURESI_DK * 60_000;
  if (z.durum === 'iceride' && z.giris !== null) {
    if (simdi - z.giris > sinir) return { hata: `Giriş ${GERI_ALMA_SURESI_DK} dakikadan eski; geri alınamaz, çıkış yapın.` };
    return { tur: 'giris', habersiz: z.beklenenZaman === null };
  }
  if (z.durum === 'cikti' && z.cikis !== null) {
    if (simdi - z.cikis > sinir) return { hata: `Çıkış ${GERI_ALMA_SURESI_DK} dakikadan eski; geri alınamaz.` };
    return { tur: 'cikis' };
  }
  return { hata: 'Geri alınacak giriş ya da çıkış yok.' };
}

// NZ-09 ön kayıt makul aralıkta açılır.
export function onKayitZamaniHatasi(beklenen: number, simdi: number): string | null {
  if (beklenen < simdi - ON_KAYIT_GECMIS_DK * 60_000) return 'Beklenen zaman geçmişte; bugünkü ya da ileri bir saat seçin.';
  if (beklenen > simdi + ON_KAYIT_ILERI_GUN * 86_400_000) return `Ön kayıt en çok ${ON_KAYIT_ILERI_GUN} gün sonrası için açılır.`;
  return null;
}

// NZ-10 yalnız boş kart kayıp ya da hasarlı bildirilir; yalnız kayıp ya da hasarlı kart rafa geri alınır.
export function kartBildirHatasi(kart: { durum: string; icerideMi: boolean }): string | null {
  if (kart.icerideMi) return 'Kart içerideki bir ziyaretçide; çıkışta "kart teslim edilmedi" seçin.';
  return kart.durum === 'bos' ? null : 'Kart zaten kayıp ya da hasarlı.';
}

export function rafaAlmaHatasi(durum: string): string | null {
  return durum === 'kayip' || durum === 'hasarli' ? null : 'Kart zaten rafta.';
}

// PDKS dosya biçimi yalnız burada (243 a). Gerçek biçim bilgi işlemden gelmedi; bu bir VARSAYIM: noktalı virgüllü metin, ilk satır
// başlık, sütunlar sicil no; tarih GG.AA.YYYY; saat SS:DD[:ss] tesis saati; yön. Biçim gelince yalnız bu nesne ve pdksSatiriniCoz değişir.
export const PDKS_BICIMI = {
  ayirici: ';',
  baslikSatiri: true,
  sutun: { sicilNo: 0, tarih: 1, saat: 2, yon: 3 },
  giris: ['G', 'GIRIS', 'GİRİŞ', 'I', 'IN'],
  cikis: ['C', 'Ç', 'CIKIS', 'ÇIKIŞ', 'O', 'OUT'],
} as const;
// Okutma saati ile sunucu saati arasındaki kayma payı: bundan ileri zamanlı satır yanlış saatli cihazdır, alınmaz.
export const PDKS_ILERI_PAY_DK = 5;
// Unutulan çıkış okutması kişiyi acil durum listesinde sonsuza dek içeride göstermesin: son giriş bundan eskiyse sayılmaz.
export const PDKS_ICERIDE_EN_COK_SAAT = 24;

export type PdksYonu = 'giris' | 'cikis';
export interface PdksSatiri { satirNo: number; sicilNo: string; zaman: number; yon: PdksYonu }
export interface PdksHatasi { satirNo: number; neden: string }

const yonBul = (deger: string): PdksYonu | null => {
  const d = deger.trim().toLocaleUpperCase('tr');
  if ((PDKS_BICIMI.giris as readonly string[]).includes(d)) return 'giris';
  if ((PDKS_BICIMI.cikis as readonly string[]).includes(d)) return 'cikis';
  return null;
};

function pdksSatiriniCoz(satir: string, satirNo: number, simdi: number): PdksSatiri | PdksHatasi {
  const s = satir.split(PDKS_BICIMI.ayirici).map((h) => h.trim());
  const sicilNo = s[PDKS_BICIMI.sutun.sicilNo] ?? '';
  const tarih = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s[PDKS_BICIMI.sutun.tarih] ?? '');
  const saat = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s[PDKS_BICIMI.sutun.saat] ?? '');
  const yon = yonBul(s[PDKS_BICIMI.sutun.yon] ?? '');
  if (sicilNo === '' || sicilNo.length > 30) return { satirNo, neden: 'Sicil no boş ya da çok uzun.' };
  if (tarih === null) return { satirNo, neden: 'Tarih GG.AA.YYYY biçiminde değil.' };
  if (saat === null) return { satirNo, neden: 'Saat SS:DD biçiminde değil.' };
  if (yon === null) return { satirNo, neden: 'Yön giriş ya da çıkış değil.' };
  const [, g, a, y] = tarih as unknown as [string, string, string, string];
  const [sa, dk, sn] = [Number(saat[1]), Number(saat[2]), Number(saat[3] ?? 0)];
  const gun = new Date(Date.UTC(Number(y), Number(a) - 1, Number(g)));
  if (gun.getUTCDate() !== Number(g) || gun.getUTCMonth() !== Number(a) - 1 || sa > 23 || dk > 59 || sn > 59) {
    return { satirNo, neden: 'Tarih ya da saat geçersiz.' };
  }
  const zaman = tesisGunBasi(`${y}-${a}-${g}`) + ((sa * 60 + dk) * 60 + sn) * 1000;
  if (zaman > simdi + PDKS_ILERI_PAY_DK * 60_000) return { satirNo, neden: 'Zaman ileride; cihaz saatini denetleyin.' };
  return { satirNo, sicilNo, zaman, yon };
}

// Boş satır atlanır; okunamayan satır hata listesine girer, metnin geri kalanı yine alınır. Satır no metindeki sıradır (1'den).
function pdksSatirlariniCoz(metin: string, simdi: number, baslikVar: boolean): { satirlar: PdksSatiri[]; hatalar: PdksHatasi[] } {
  const satirlar: PdksSatiri[] = [];
  const hatalar: PdksHatasi[] = [];
  metin.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((satir, i) => {
    if (satir.trim() === '' || (baslikVar && i === 0)) return;
    const sonuc = pdksSatiriniCoz(satir, i + 1, simdi);
    if ('neden' in sonuc) hatalar.push(sonuc);
    else satirlar.push(sonuc);
  });
  return { satirlar, hatalar };
}

export const pdksDosyasiniCoz = (metin: string, simdi: number): { satirlar: PdksSatiri[]; hatalar: PdksHatasi[] } =>
  pdksSatirlariniCoz(metin, simdi, PDKS_BICIMI.baslikSatiri);

// Cihazın geç gönderdiği kayıt (bağlantı kopukken belleğinde bekleyen) bu kadar geriye kadar alınır; daha eskisi yeniden gönderimdir.
export const PDKS_CIHAZ_GERI_PAY_SAAT = 24;

// Kart okuyucunun kendi biçimi marka belli olunca yazılacak (açık borç, ADR 0016). O zamana kadar gövde dosya biçiminin başlıksız
// satırlarıdır (PDKS_BICIMI, VARSAYIM); marka gelince yalnız bu işlev değişir.
export function pdksCihazGovdesiniCoz(ham: string, simdi: number): { satirlar: PdksSatiri[]; hatalar: PdksHatasi[] } {
  const { satirlar, hatalar } = pdksSatirlariniCoz(ham, simdi, false);
  const sinir = simdi - PDKS_CIHAZ_GERI_PAY_SAAT * 3_600_000;
  return {
    satirlar: satirlar.filter((s) => s.zaman >= sinir),
    hatalar: [...hatalar, ...satirlar.filter((s) => s.zaman < sinir).map((s) => ({ satirNo: s.satirNo, neden: `Zaman ${String(PDKS_CIHAZ_GERI_PAY_SAAT)} saatten eski.` }))]
      .sort((a, b) => a.satirNo - b.satirNo),
  };
}

// Cihaz kapısı (ADR 0016): adres başına dakikada en çok CIHAZ_DAKIKA_ISTEK istek; art arda CIHAZ_HATA_ESIGI kimlik hatasından sonra
// adres bir dakika bekletilir, her yeni hatada süre ikiye katlanır, bir saatte durur. Başarılı istek sayacı sıfırlar.
export const CIHAZ_DAKIKA_ISTEK = 60;
export const CIHAZ_HATA_ESIGI = 5;
const CIHAZ_BLOK_EN_AZ_MS = 60_000;
const CIHAZ_BLOK_EN_COK_MS = 3_600_000;

export interface KapiDurumu { pencereBasi: number; sayi: number; ardArdaHata: number; blokBitis: number }
const YENI_KAPI: KapiDurumu = { pencereBasi: 0, sayi: 0, ardArdaHata: 0, blokBitis: 0 };

export function kapidanGec(d: KapiDurumu | undefined, simdi: number): { izin: boolean; durum: KapiDurumu } {
  const o = d ?? YENI_KAPI;
  if (simdi < o.blokBitis) return { izin: false, durum: o };
  const yeniPencere = simdi - o.pencereBasi >= 60_000;
  const durum = { ...o, pencereBasi: yeniPencere ? simdi : o.pencereBasi, sayi: (yeniPencere ? 0 : o.sayi) + 1 };
  return { izin: durum.sayi <= CIHAZ_DAKIKA_ISTEK, durum };
}

export function kimlikHatasi(d: KapiDurumu, simdi: number): KapiDurumu {
  const ardArdaHata = d.ardArdaHata + 1;
  if (ardArdaHata < CIHAZ_HATA_ESIGI) return { ...d, ardArdaHata };
  const sure = Math.min(CIHAZ_BLOK_EN_AZ_MS * 2 ** (ardArdaHata - CIHAZ_HATA_ESIGI), CIHAZ_BLOK_EN_COK_MS);
  return { ...d, ardArdaHata, blokBitis: simdi + sure };
}

export const kimlikDogru = (d: KapiDurumu): KapiDurumu => ({ ...d, ardArdaHata: 0, blokBitis: 0 });

// Kişinin son hareketi giriş ve süre içindeyse içeride sayılır.
export function pdksIcerideMi(son: { yon: PdksYonu; zaman: number } | null, simdi: number): boolean {
  return son !== null && son.yon === 'giris' && simdi - son.zaman <= PDKS_ICERIDE_EN_COK_SAAT * 3_600_000;
}

// Personel kartı (1326, karar 1327 a). Okuyucu klavye gibi yazar: kartın numarasını (EM4100'de onluk, Mifare'de onaltılık UID) Enter
// ile bitirir. Boşluk atılır, harf büyütülür; yalnız rakam ve A-F kabul edilir. Okuyucu modeli değişirse biçim de değişebilir
// (başta sıfır, onluk ya da onaltılık); kart o zaman yeniden okutulur.
const PERSONEL_KART_BICIMI = /^[0-9A-F]{4,32}$/;

export function personelKartNoDuzelt(ham: string): string | null {
  const no = ham.replace(/\s+/g, '').toUpperCase();
  return PERSONEL_KART_BICIMI.test(no) ? no : null;
}

// Kart numarası gizli değildir (kart kopyalanabilir; asıl sır PIN'dir), yine de veritabanını okuyan kişi kartları kişiye
// eşleyemesin diye düz saklanmaz. Arama tek sorguyla yapılabilsin diye özet tuzsuz ve belirlenimcidir.
export function personelKartOzeti(no: string): string {
  return createHash('sha256').update(JSON.stringify(['personel-kart', no])).digest('hex');
}
