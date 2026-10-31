// Stok iş kuralları: saf fonksiyon ve sabitler; veritabanı ve saat yok. Kural numaraları ON-PAKET-stok (DEP-).
import type { KatalogTuru } from '#paylasilan/sozlesme/malzemeler.ts';
import type { KapanisMaddeBilgisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ELLE_KONUM_TURLERI, type FisGonderimSekli, type LogoFisDurumu, type MalzemeFisiTuru, type KaliteDurumu, type KoduDegisenKonum, type KonumTuru, type MalzemeIstegiDurumu, type TeslimDurumu } from '#paylasilan/sozlesme/stok.ts';

// ---- Miktar: numeric(14,3) metni binde tam sayıya çevrilir; ondalık hata payı olmaz ------------------------------
const MIKTAR = /^(-)?(\d+)(?:\.(\d{1,3}))?$/;
export function binde(metin: string): bigint {
  const p = MIKTAR.exec(metin.trim());
  if (!p) throw new Error(`Miktar biçimi geçersiz: ${metin}`);
  const deger = BigInt(p[2] ?? '0') * 1000n + BigInt((p[3] ?? '').padEnd(3, '0'));
  return p[1] ? -deger : deger;
}
export function bindenMetin(b: bigint): string {
  const eksi = b < 0n;
  const m = eksi ? -b : b;
  const tam = m / 1000n;
  const kalan = (m % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${eksi ? '-' : ''}${tam}${kalan ? `.${kalan}` : ''}`;
}

// ---- Raf adresi (DEP-14) ------------------------------------------------------------------------------------------
export type Numaralama = 'sirali' | 'tek' | 'cift';
// k: 0'dan başlayan bölme sırası. Tek ve çift numaralama aynı koridorun iki yüzüdür.
export function bolmeNo(numaralama: Numaralama, ilkBolme: number, k: number): number {
  if (numaralama === 'tek') return 2 * k + 1;
  if (numaralama === 'cift') return 2 * k + 2;
  return ilkBolme + k;
}
const iki = (n: number): string => String(n).padStart(2, '0');
export const gozKodu = (rafKod: string, bolme: number, kat: number): string => `${rafKod}-${iki(bolme)}-${iki(kat)}`;
export interface RafOlcusu { kod: string; numaralama: Numaralama; ilkBolme: number; bolmeSayisi: number; katSayisi: number }
export function rafGozleri(r: RafOlcusu): { bolmeNo: number; katNo: number; kod: string }[] {
  const gozler: { bolmeNo: number; katNo: number; kod: string }[] = [];
  for (let k = 0; k < r.bolmeSayisi; k++) {
    const b = bolmeNo(r.numaralama, r.ilkBolme, k);
    for (let kat = 1; kat <= r.katSayisi; kat++) gozler.push({ bolmeNo: b, katNo: kat, kod: gozKodu(r.kod, b, kat) });
  }
  return gozler;
}

// ---- Yeterlilik ve onaylı eksi (DEP-02, DEP-03, DEP-04) ------------------------------------------------------------
export type DusumKarari = { tur: 'yaz'; onayliEksi: false } | { tur: 'yaz'; onayliEksi: true } | { tur: 'onay-gerekli'; mevcut: string };
export function dusumKarari(mevcut: string, istenen: string, eksiOnay: boolean): DusumKarari {
  if (binde(mevcut) >= binde(istenen)) return { tur: 'yaz', onayliEksi: false };
  return eksiOnay ? { tur: 'yaz', onayliEksi: true } : { tur: 'onay-gerekli', mevcut };
}
// 16.1: eksi onayı kalite kararını aşmaz. Gözde istenen parça red ya da karar bekliyorsa eksik serbest bakiyede değil kalitededir;
// "Yine de yaz" onu serbest olarak taşır ya da düşer ve karantinayı deler.
export function eksiKaliteEngeli(kalite: readonly { kaliteDurumu: KaliteDurumu; miktar: string }[]): string | null {
  const toplam = (q: KaliteDurumu): bigint => kalite.filter((x) => x.kaliteDurumu === q).reduce((t, x) => t + binde(x.miktar), 0n);
  const red = toplam('red'), bekleyen = toplam('karar_bekliyor');
  if (red <= 0n && bekleyen <= 0n) return null;
  const neden = [red > 0n ? `${bindenMetin(red)} red (karantinada)` : null, bekleyen > 0n ? `${bindenMetin(bekleyen)} kalite kararı bekliyor` : null].filter(Boolean).join(', ');
  return `Bu gözdeki parça serbest değil: ${neden}. Eksi onayı kalite kararını aşmaz; serbest bırakma Kalite Merkezi kararıyla olur.`;
}
// 21.4: üretim girişi emrin sağlam adedini (bitmemiş emirde adedini) aşmaz. Girilen, emrin bütün üretim girişleridir: terminal sayımı,
// tamamlama ve elle giriş; geri alınanlar düşülmüştür.
export function uretimGirisiEngeli(hedefAdet: number, girilen: string, miktar: string): string | null {
  const kalan = BigInt(hedefAdet) * 1000n - binde(girilen);
  if (binde(miktar) <= kalan) return null;
  return `Üretim girişi emrin girilmemiş adedini (${bindenMetin(kalan > 0n ? kalan : 0n)}) aşamaz.`;
}

// Elle üretim girişi yalnız açık ya da üretimi bitmiş emre yazılır: iptal, taslak ve onaylı kapanışı tamamlanmış emrin (1080 a:
// kayıtları değişmez) stoğu üretimden gelmez. Bitmiş emir tamamlama ve kapanış öncesi düzeltme için açık kalır.
export const URETIM_GIRISI_EMIR_DURUMLARI = ['planli', 'basladi', 'bitti'] as const;
export function uretimGirisiDurumEngeli(durum: string, kapanisTamam: boolean): string | null {
  if (kapanisTamam) return 'Emrin kapanışı onaylanmış; üretim girişi yazılmaz.';
  if (durum === 'iptal') return 'İptal edilmiş emre üretim girişi yazılmaz.';
  if (!(URETIM_GIRISI_EMIR_DURUMLARI as readonly string[]).includes(durum)) return 'Emir henüz planlanmadı; üretim girişi yazılmaz.';
  return null;
}

// ---- Çıkış önerisi: en eski giriş önce (DEP-05, DEP-06, DEP-07, DEP-08) --------------------------------------------
export interface OneriSatiri { bakiyeId: number; konumId: number; konumKod: string; konumTur: string; partiId: number | null; partiEtiketi: string | null; miktar: string; ilkGiris: string }
// Ayrılmış yer: hurda, karantina ve sevkiyat kutusundaki stok kimseye ayrılmaz, üretime ve çıkışa önerilmez (karar 108 a).
export const AYRILMIS_KONUM_TURLERI = ['hurda', 'karantina', 'sevkiyat'] as const satisfies readonly KonumTuru[];
// Kullanılabilir stok (rezerve, öneri, kritik seviye) yalnız serbest ve şartlı kalitedir; karar bekleyen ve red parça üretimde uyarıyla
// ilerler ama rezerveye girmez (134 a, 135).
export const KULLANILABILIR_KALITE = ['serbest', 'sartli'] as const satisfies readonly KaliteDurumu[];
// Güncel stok değeri yalnız kullanılabilir stoktan çıkar (228 a; Satın alma'nın kg stok değeriyle aynı tanım): raf, kabul ve zemin
// konumunda, statüsüz, kalitesi kullanılabilir bakiye. Geri kalanı kendi satırında değerlenir, toplam ayrıca görünür.
export const KULLANILABILIR_KONUM_TURLERI = ['raf_gozu', 'kabul', 'depo_zemini'] as const satisfies readonly KonumTuru[];
export const DEGER_GRUPLARI = ['kullanilabilir', 'kalite', 'hurda', 'fason', 'yolda', 'diger'] as const;
export type DegerGrubu = (typeof DEGER_GRUPLARI)[number];
// Fason kutusu, üretim çıkışı, istasyon ve ayrılmış yerler öneriye kaynak olmaz; eksi bakiye öneri değildir.
const ONERI_DISI = new Set<string>(['fason', 'uretim_cikisi', 'istasyon', ...AYRILMIS_KONUM_TURLERI] satisfies KonumTuru[]);
export function cikisOnerisi(satirlar: readonly OneriSatiri[], istenen: string) {
  const uygun = satirlar
    .filter((s) => !ONERI_DISI.has(s.konumTur) && binde(s.miktar) > 0n)
    .sort((a, b) => Date.parse(a.ilkGiris) - Date.parse(b.ilkGiris) || a.bakiyeId - b.bakiyeId);
  const mevcut = uygun.reduce((t, s) => t + binde(s.miktar), 0n);
  if (uygun.length === 0) return { veriYetersiz: true, yeterli: false, mevcut: '0', oneriler: [] };
  let kalan = binde(istenen);
  const oneriler: { bakiyeId: number; konumId: number; konumKod: string; partiId: number | null; partiEtiketi: string | null; miktar: string }[] = [];
  for (const s of uygun) {
    if (kalan <= 0n) break;
    const al = binde(s.miktar) < kalan ? binde(s.miktar) : kalan;
    oneriler.push({ bakiyeId: s.bakiyeId, konumId: s.konumId, konumKod: s.konumKod, partiId: s.partiId, partiEtiketi: s.partiEtiketi, miktar: bindenMetin(al) });
    kalan -= al;
  }
  return { veriYetersiz: false, yeterli: kalan <= 0n, mevcut: bindenMetin(mevcut), oneriler };
}

// ---- Emir tamamlama (EK "Stok ve tamamlama"; ilk sistemde "Tamamla ve stokta") ----------------------------------
// Brüt ihtiyaç dört ondalıkla gelir; malzeme başına toplanır ve stoğun üç ondalığına yukarı yuvarlanır (eksik düşülmez).
const DORT_ONDALIK = /^(\d+)(?:\.(\d{1,4}))?$/;
export function ihtiyacToplami(satirlar: readonly { malzemeId: number; brut: string }[]): Map<number, bigint> {
  const onBinde = new Map<number, bigint>();
  for (const s of satirlar) {
    const p = DORT_ONDALIK.exec(s.brut.trim());
    if (!p) throw new Error(`Brüt ihtiyaç biçimi geçersiz: ${s.brut}`);
    const d = BigInt(p[1] ?? '0') * 10000n + BigInt((p[2] ?? '').padEnd(4, '0'));
    onBinde.set(s.malzemeId, (onBinde.get(s.malzemeId) ?? 0n) + d);
  }
  return new Map([...onBinde].map(([id, d]) => [id, (d + 9n) / 10n]));
}
// Emre verilmiş net sarf brütten düşülür; fazla verilmişse kalan sıfırdır (artanın iadesi ayrı iştir).
export const kalanSarf = (brut: bigint, verilen: bigint): bigint => (brut > verilen ? brut - verilen : 0n);
// Engel sırası: emir bitmeden stok tamamlanmaz; eksik varsa ilk sistemdeki gibi reddedilir; yapılacak bir şey yoksa ikinci kez yazılmaz.
export function tamamlamaEngeli(d: { durum: string; eksikVar: boolean; yapilacakVar: boolean }): string | null {
  if (d.durum !== 'bitti') return 'Emir bitmedi; stokta tamamlama bitmiş emirde yapılır.';
  if (d.eksikVar) return 'Eksik malzeme var; önce eksikleri teslim alın.';
  if (!d.yapilacakVar) return 'Bu emir stokta zaten tamamlandı.';
  return null;
}

// Malzeme isteği yalnız ileri gider: açık (ya da stok yok) hazırlanır; açık, stok yok ya da hazırlanan teslim edilir ya da iptal
// edilir. Kapanan değişmez.
export type IstekGecisi = 'hazirla' | 'teslim' | 'iptal';
export const ISTEK_GECIS_KAYNAKLARI: Record<IstekGecisi, readonly MalzemeIstegiDurumu[]> = {
  hazirla: ['acik', 'stok_yok'],
  teslim: ['acik', 'stok_yok', 'hazirlaniyor'],
  iptal: ['acik', 'stok_yok', 'hazirlaniyor'],
};
export function istekGecisEngeli(durum: MalzemeIstegiDurumu, gecis: IstekGecisi): string | null {
  if (ISTEK_GECIS_KAYNAKLARI[gecis].includes(durum)) return null;
  if (durum === 'teslim') return 'İstek teslim edildi; değiştirilemez.';
  if (durum === 'iptal') return 'İstek iptal edildi; değiştirilemez.';
  return 'İstek zaten hazırlanıyor.';
}

// ---- Parti seçimi (DEP-23, DEP-24) ---------------------------------------------------------------------------------
// istenen: undefined = sistem seçsin; null = partisiz satır; sayı = kişinin seçtiği parti.
export type PartiSecimi = { tur: 'tamam'; partiId: number | null; secim: 'kisi' | 'tek_parti' | null } | { tur: 'secim-gerekli'; partiler: (number | null)[] };
export function partiSec(gozdekiPartiler: readonly (number | null)[], istenen: number | null | undefined): PartiSecimi {
  if (istenen !== undefined) return { tur: 'tamam', partiId: istenen, secim: istenen === null ? null : 'kisi' };
  const farkli = [...new Set(gozdekiPartiler)];
  if (farkli.length === 0) return { tur: 'tamam', partiId: null, secim: null };
  if (farkli.length === 1) { const p = farkli[0] ?? null; return { tur: 'tamam', partiId: p, secim: p === null ? null : 'tek_parti' }; }
  return { tur: 'secim-gerekli', partiler: farkli };
}

// 1229 a: parti seçilmeden gönderilen miktar partilere en eski girişten bölünür; serbest miktarı olmayan parti atlanır. Toplam yetmezse
// null (bölme yapılmaz; çağıran mevcudu söyler). Miktarlar binde.
export function teslimBolmesi(adaylar: readonly { partiId: number | null; serbest: bigint }[], istenen: bigint): { partiId: number | null; miktar: bigint }[] | null {
  const sonuc: { partiId: number | null; miktar: bigint }[] = [];
  let kalan = istenen;
  for (const a of adaylar) {
    if (kalan <= 0n) break;
    if (a.serbest <= 0n) continue;
    const m = a.serbest < kalan ? a.serbest : kalan;
    sonuc.push({ partiId: a.partiId, miktar: m });
    kalan -= m;
  }
  return kalan > 0n ? null : sonuc;
}

// ---- Parti zorunluluğu karttaki türe göre (DEP-20, DEP-48, DEP-49) --------------------------------------------------
export type MalzemeTuru = KatalogTuru;
// Hizmet stoklanmaz (kullanıcı kararı MH1 a): depoya giriş, bakiye ve parti yazılmaz.
export const stoklanirMi = (tur: string): boolean => tur !== 'hizmet';
export type GirisKaynagi = 'mal_kabul' | 'uretim';
// 'lot': tedarikçi parti/döküm no isteğe bağlıdır; girilmezse yeni lot açılır (kullanıcı kararı 13.10.2026, #1018).
// Sarf da lot alır; gözde birden çok lot varsa çıkışta lot seçilir (kullanıcı kararı 13.10.2026, #1018).
export type PartiGereksinimi = 'lot' | 'yok' | 'emir';
export function partiGereksinimi(tur: MalzemeTuru, kaynak: GirisKaynagi): PartiGereksinimi {
  if (tur === 'demirbas') return 'yok';
  if (kaynak === 'uretim') return 'emir';
  return 'lot';
}
export interface PartiBilgisi { tedarikciPartiNo?: string | null | undefined; dokumNo?: string | null | undefined; sertifikaNo?: string | null | undefined }
export const partiDolu = (p: PartiBilgisi | null | undefined): boolean => Boolean(p && (p.tedarikciPartiNo || p.dokumNo));
// Hata iletisi ya da null (geçer).
export function partiDenetimi(tur: MalzemeTuru, kaynak: GirisKaynagi, verilen: { parti?: PartiBilgisi | null | undefined; partiId?: number | undefined }): string | null {
  const g = partiGereksinimi(tur, kaynak);
  const var_ = partiDolu(verilen.parti) || verilen.partiId !== undefined;
  const sadeceSertifika = !partiDolu(verilen.parti) && Boolean(verilen.parti?.sertifikaNo) && verilen.partiId === undefined;
  if (sadeceSertifika && g !== 'lot') return 'Sertifika no tek başına parti açmaz; tedarikçi parti no ya da döküm no girin.';
  if (g === 'yok' && (var_ || sadeceSertifika)) return 'Demirbaş parti almaz.';
  return null;
}

// ---- Taşıma: ilk giriş ikisinin eskisi (DEP-09) ------------------------------------------------------------------------
export const ilkGirisBirlesik = (a: string, b: string): string => (Date.parse(a) <= Date.parse(b) ? a : b);

// ---- Ambalaj adedi miktarla orantılı azalır, kesir yukarı yuvarlanır (DEP-27) ----------------------------------------
export function kalanAmbalajAdedi(adet: number | null, eskiMiktar: string, yeniMiktar: string): number | null {
  if (adet === null) return null;
  const eski = binde(eskiMiktar);
  const yeni = binde(yeniMiktar);
  if (eski <= 0n || yeni <= 0n) return null;
  if (yeni >= eski) return adet;
  const pay = BigInt(adet) * yeni;
  return Number((pay + eski - 1n) / eski);
}

// ---- Kritik durum (DEP-28): tanımsızsa sayı uydurulmaz ---------------------------------------------------------------
export type StokDurumu = 'yeterli' | 'kritik' | 'eksi' | 'tanimsiz';
export function stokDurumu(toplam: string, kritikSeviye: string | null): StokDurumu {
  if (binde(toplam) < 0n) return 'eksi';
  if (kritikSeviye === null) return 'tanimsiz';
  return binde(toplam) <= binde(kritikSeviye) ? 'kritik' : 'yeterli';
}

// ---- Sayım bekleyen göz (DEP-15): süre tanımlı değilse kural çalışmaz -------------------------------------------------
const GUN_MS = 86_400_000;
export function sayimBekliyorMu(sonSayim: string | null, simdi: string, sureGun: number | null): boolean | null {
  if (sureGun === null) return null;
  if (sonSayim === null) return true;
  return Date.parse(simdi) - Date.parse(sonSayim) > sureGun * GUN_MS;
}

// ---- Sayım farkı (DEP-16) ----------------------------------------------------------------------------------------------
export type SayimFarki = { tur: 'yok' } | { tur: 'sayim_fazla' | 'sayim_eksik'; miktar: string };
export function sayimFarki(sistem: string, sayilan: string): SayimFarki {
  const fark = binde(sayilan) - binde(sistem);
  if (fark === 0n) return { tur: 'yok' };
  return fark > 0n ? { tur: 'sayim_fazla', miktar: bindenMetin(fark) } : { tur: 'sayim_eksik', miktar: bindenMetin(-fark) };
}

// ---- Geri alma (DEP-17, DEP-18, DEP-19, DEP-53) -------------------------------------------------------------------------
// elleAkis: Stok Merkezi'nden elle geri almada hareketi yazan akış (1388 a); akışın kendi geri alması ve elle hareket null verir.
export interface GeriAlinacak { tur: string; geriAlindi: boolean; malKabulSatiriMi: boolean; disCagriMi: boolean; elleAkis?: string | null }
const AKIS_ADI: Readonly<Record<string, string>> = {
  terminal: 'üretim terminali', fason: 'fason', sevk: 'sevkiyat', kalite: 'Kalite Merkezi', cnc: 'CNC kurulum', emir: 'üretim emri',
};
export function geriAlmaEngeli(h: GeriAlinacak): string | null {
  if (h.tur === 'geri_alma') return 'Geri alma hareketi geri alınmaz.';
  if (h.geriAlindi) return 'Bu hareket zaten geri alındı.';
  if (h.malKabulSatiriMi) return 'Mal kabul hareketi tek başına geri alınmaz; belgeyi düzeltin.';
  if (h.disCagriMi) return 'Otomatik hareket yalnız onu yazan çağrıyla geri alınır.';
  if (h.elleAkis != null) return `Bu hareketi ${AKIS_ADI[h.elleAkis] ?? h.elleAkis} akışı yazdı; Stok Merkezi'nden geri alınmaz, yalnız o akış geri alır.`;
  return null;
}
// Kalite durumunu yalnız Kalite Merkezi yazar (229 a): kaliteyi değiştiren hareket onun kararıdır, stok geri almasıyla çevrilmez (denetim #16).
export function kaliteKarariHareketiMi(h: { kaynakKaliteDurumu: KaliteDurumu | null; hedefKaliteDurumu: KaliteDurumu | null }): boolean {
  return h.kaynakKaliteDurumu !== null && h.hedefKaliteDurumu !== null && h.kaynakKaliteDurumu !== h.hedefKaliteDurumu;
}
// Ürün sevkinin hareket açıklaması (235 a); iş kimliği açıklamadan okunur.
export const sevkAciklamasi = (isId: number, emirNo: string, adim: 'yola' | 'teslim'): string =>
  `Ürün sevki · iş ${String(isId)} · emir ${emirNo} · ${adim === 'yola' ? 'yola çıktı' : 'teslim edildi'}`;
const SEVK_TESLIMI = /^Ürün sevki · iş (\d+) · emir .+ · teslim edildi(?: · red parça)?$/;
// Hareket bir ürün sevkinin teslim çıkışıysa işin kimliği; değilse null.
export function sevkTeslimIsi(h: { tur: string; cikisNedeni: string | null; aciklama: string | null }): number | null {
  if (h.tur !== 'cikis' || h.cikisNedeni !== 'sevk' || h.aciklama === null) return null;
  const m = SEVK_TESLIMI.exec(h.aciklama);
  return m ? Number(m[1]) : null;
}
// Soru 186 a: faturalı sevkin stok çıkışı geri alınmaz; önce fatura iptal edilir ya da tamamı iade edilir. Gelen faturalar iptal
// edilmemiş olanlardır; bir faturanın iadeleri toplamı faturanın toplamına ulaşmışsa o fatura sevki bağlamaz.
export interface SevkFaturasi { id: number; tur: 'fatura' | 'iade'; belgeNo: string | null; sevkiyatIsiId: number | null; iadeBelgeId: number | null; toplam: string }
const kurus = (tutar: string): bigint => {
  const [tam = '0', kesir = ''] = tutar.trim().split('.');
  const eksi = tam.startsWith('-');
  const deger = BigInt(eksi ? tam.slice(1) : tam) * 100n + BigInt(kesir.padEnd(2, '0').slice(0, 2));
  return eksi ? -deger : deger;
};
export function faturaliSevkEngeli(isId: number, faturalar: readonly SevkFaturasi[]): string | null {
  const acik = faturalar.filter((f) => f.tur === 'fatura' && f.sevkiyatIsiId === isId).filter((f) => {
    const iade = faturalar.filter((x) => x.tur === 'iade' && x.iadeBelgeId === f.id).reduce((t, x) => t + kurus(x.toplam), 0n);
    return iade < kurus(f.toplam);
  });
  if (acik.length === 0) return null;
  const nolar = acik.map((f) => f.belgeNo ?? `#${String(f.id)}`).join(', ');
  return `Sevk faturalandı (${nolar}); stok çıkışı geri alınmaz. Önce faturayı iptal edin ya da iade kesin.`;
}
// Geri almanın yönü: kaynak ve hedef yer değiştirir.
export function tersYon(kaynak: number | null, hedef: number | null): { kaynak: number | null; hedef: number | null } {
  return { kaynak: hedef, hedef: kaynak };
}

// ---- Logo irsaliye eşleşmesi (DEP-39) ------------------------------------------------------------------------------------
export type LogoEslesme = 'irsaliye_bekleniyor' | 'eslesti' | 'fark_var';
export function logoEslesmeDurumu(sayilan: string, irsaliyeMiktari: string | null): LogoEslesme {
  if (irsaliyeMiktari === null) return 'irsaliye_bekleniyor';
  return binde(sayilan) === binde(irsaliyeMiktari) ? 'eslesti' : 'fark_var';
}

// ---- Logo'ya giden hareket ve ambar (DEP-50, DEP-51) ----------------------------------------------------------------------
export const logoyaGiderMi = (h: { tur: string; cikisNedeni: string | null; girisKaynagi: string | null }): boolean =>
  (h.tur === 'cikis' && h.cikisNedeni === 'uretime_sarf') || (h.tur === 'giris' && h.girisKaynagi === 'uretim');
export type AmbarCozumu = { tur: 'tamam'; ambarNo: number } | { tur: 'karsilik-yok' };
export const logoAmbari = (depoAmbarNo: number | null): AmbarCozumu => (depoAmbarNo === null ? { tur: 'karsilik-yok' } : { tur: 'tamam', ambarNo: depoAmbarNo });

// ---- Mal kabul göz önerisi (DEP-34) -----------------------------------------------------------------------------------------
export interface GozAdayi { konumId: number; kod: string; katNo: number | null; bos: boolean; buMalzemeVar: boolean }
// Önce malzemenin bulunduğu göz, sonra boş göz (kolay erişilen kat: 2, 1, 3, 4...); ikisi de yoksa null ("veri yetersiz").
export function malKabulGozOnerisi(adaylar: readonly GozAdayi[]): GozAdayi | null {
  const var_ = adaylar.find((a) => a.buMalzemeVar);
  if (var_) return var_;
  const katPuani = (k: number | null): number => (k === 2 ? 0 : k === 1 ? 1 : k ?? 99);
  const bos = adaylar.filter((a) => a.bos).sort((a, b) => katPuani(a.katNo) - katPuani(b.katNo) || a.kod.localeCompare(b.kod));
  return bos[0] ?? null;
}

// ---- Mal kabul düzeltmesi (DEP-53) ----------------------------------------------------------------------------------------
// Belge değişmez: düzeltme yeni belgedir ve eski belgenin bütün satırlarını aynı işlemde ters çevirir. Bir belge bir kez
// düzeltilir; düzeltme belgesi de ayrıca düzeltilebilir (zincir). Eski satırların Logo durumu değişmez.
export function duzeltmeEngeli(b: { duzeltildi: boolean }): string | null {
  return b.duzeltildi ? 'Bu belge zaten düzeltildi; son düzeltme belgesini düzeltin.' : null;
}

// Sipariş bağı (SH1 a): yalnız satın alma kabulünün satırı siparişe bağlanır; teslim bilgisini satın alma bu bağla tutar.
// Kalanı aşan miktar reddedilmez: depo saydığını yazar, fazlası siparişte "fazla teslim" görünür (kullanıcı kararı).
// Soru 104 a: satın alma kabulü her satırda sipariş satırıyla yazılır, yoksa mal stoğa girer ama siparişte teslim görünmez.
export function siparisBagiEngeli(tur: string, siparisSatirId: number | null): string | null {
  if (siparisSatirId !== null && tur !== 'satin_alma') return 'Sipariş satırı yalnız satın alma kabulünde seçilir.';
  if (siparisSatirId === null && tur === 'satin_alma') return 'Satın alma kabulü sipariş satırıyla yapılır; siparişi olmayan malı "diğer" türüyle ve açıklamayla alın.';
  return null;
}
// Mal kabul satırının türü (K-080 c, DEP-58): sipariş satırı hizmet kartınınsa satır fasondan dönüştür (kartı dönen malzeme,
// giden fason konumundan düşer) ya da satırın kartı da hizmetse saf hizmettir (stok yazmaz, yalnız teslim). Fason bilgisi
// yalnız hizmet siparişinde anlamlıdır; saf hizmette konum ve parti yoktur.
export type MalKabulSatirTuru = 'stok' | 'fason' | 'hizmet';
export interface MalKabulSatirBilgisi {
  malzemeTuru: string; siparisMalzemeTuru: string | null; siparisVar: boolean; fasonVar: boolean; konumVar: boolean; partiVar: boolean;
}
export function malKabulSatirTuru(b: MalKabulSatirBilgisi): { tur: MalKabulSatirTuru } | { hata: string; alan: 'malzemeId' | 'siparisSatirId' | 'fason' } {
  if (!stoklanirMi(b.malzemeTuru)) {
    if (!b.siparisVar) return { hata: 'Hizmet stoklanmaz; hizmet satırı yalnız hizmet sipariş satırıyla teslim alınır.', alan: 'siparisSatirId' };
    if (b.fasonVar) return { hata: 'Fason dönüşünde satırın kartı dönen malzemedir, hizmet kartı değil.', alan: 'malzemeId' };
    if (b.konumVar || b.partiVar) return { hata: 'Malzemesiz hizmet stoğa girmez; konum ve parti girilmez.', alan: 'malzemeId' };
    return { tur: 'hizmet' };
  }
  if (b.siparisMalzemeTuru !== null && !stoklanirMi(b.siparisMalzemeTuru)) {
    return b.fasonVar ? { tur: 'fason' } : { hata: 'Hizmet siparişinde malzeme döndüyse giden malzemeyi ve fason konumunu seçin; dönmediyse satırın kartı hizmet kartıdır.', alan: 'fason' };
  }
  if (b.fasonVar) return { hata: 'Fason dönüşü yalnız hizmet sipariş satırıyla yazılır.', alan: 'fason' };
  return { tur: 'stok' };
}

// Teslim, satın almada sipariş satırının kartına düşer: başka kartın satırına bağlanan kabul, stokta bir kartı artırıp
// satın almada başka kartın siparişini kapatırdı. Kartsız (katalogsuz) kalemin karşılaştıracak kartı yoktur.
export function siparisMalzemeEngeli(malzemeId: number, siparisMalzemeNo: number | null): string | null {
  return siparisMalzemeNo !== null && siparisMalzemeNo !== malzemeId ? 'Sipariş satırı başka bir malzeme kartına ait; bu kartın sipariş satırını seçin.' : null;
}

// ---- Toplama rotası (DEP-42): önce rafsız konumlar (kabul, zemin), sonra raf kodu sırası; koridorda yılan düzeni
// (sıradaki her ikinci rafta bölmeler geriye), göz içinde kat yukarı.
export interface RotaDurak { konumKod: string; rafKod: string | null; bolmeNo: number | null; katNo: number | null }
export function rotaSirala<T extends RotaDurak>(duraklar: readonly T[]): T[] {
  const raflar = [...new Set(duraklar.flatMap((d) => (d.rafKod === null ? [] : [d.rafKod])))].sort((a, b) => a.localeCompare(b, 'tr'));
  const yon = (raf: string): number => (raflar.indexOf(raf) % 2 === 0 ? 1 : -1);
  return [...duraklar].sort((a, b) => {
    if ((a.rafKod === null) !== (b.rafKod === null)) return a.rafKod === null ? -1 : 1;
    if (a.rafKod === null || b.rafKod === null) return a.konumKod.localeCompare(b.konumKod, 'tr');
    if (a.rafKod !== b.rafKod) return raflar.indexOf(a.rafKod) - raflar.indexOf(b.rafKod);
    const db = ((a.bolmeNo ?? 0) - (b.bolmeNo ?? 0)) * yon(a.rafKod);
    return db !== 0 ? db : (a.katNo ?? 0) - (b.katNo ?? 0);
  });
}

// ---- Parti etiketi (ekranda) --------------------------------------------------------------------------------------------
// Lot numarası önce gelir (#1018); tedarikçi parti, döküm no ya da emir yanında okunur.
// Emir numarası bilinmiyorsa kimlik gösterilir (numara uydurulmaz).
export function partiEtiketi(p: { lotNo: string | null; tedarikciPartiNo: string | null; dokumNo: string | null; uretimEmriId: number | null } | null, emirNo: string | null = null): string | null {
  if (!p) return null;
  const kaynak = p.uretimEmriId !== null ? [emirNo !== null ? `Emir ${emirNo}` : `Emir #${p.uretimEmriId}`] : [p.tedarikciPartiNo, p.dokumNo ? `döküm ${p.dokumNo}` : null];
  return [p.lotNo, ...kaynak].filter(Boolean).join(' · ') || null;
}

// ---- Statülü stok (#1108, STK-S1, STK-S4) -----------------------------------------------------------------------------------
// Statü yalnız hareketle değişir: değişim aynı statüye olmaz, statüdeki mevcuttan fazlası taşınmaz (statülü stok eksiye düşmez).
export function statuDegisimiEngeli(kaynakStatuId: number | null, hedefStatuId: number | null, mevcut: string, miktar: string): string | null {
  if (kaynakStatuId === hedefStatuId) return 'Kaynak ve hedef statü aynı.';
  if (binde(mevcut) < binde(miktar)) return `Statüde yeterli stok yok. Mevcut: ${bindenMetin(binde(mevcut))}.`;
  return null;
}
// Toplam stoğun statü kırılımı: önce serbest, sonra statü kimliği sırası. Bekleme süresi statüye girişten sayılır: satırın
// ilk girişi o statüdeki en eski giriştir (statü değişiminde yeni satır değişim anıyla açılır).
export function statuKirilimi(b: readonly { statuId: number | null; miktar: string; ilkGiris: string }[]): { statuId: number | null; miktar: string; ilkGiris: string }[] {
  const t = new Map<number | null, { miktar: bigint; ilkGiris: string }>();
  for (const x of b) {
    const o = t.get(x.statuId);
    t.set(x.statuId, { miktar: (o?.miktar ?? 0n) + binde(x.miktar), ilkGiris: o && Date.parse(o.ilkGiris) <= Date.parse(x.ilkGiris) ? o.ilkGiris : x.ilkGiris });
  }
  return [...t].filter(([, v]) => v.miktar !== 0n).sort(([a], [c]) => (a ?? 0) - (c ?? 0)).map(([statuId, v]) => ({ statuId, miktar: bindenMetin(v.miktar), ilkGiris: v.ilkGiris }));
}
// Statü Reçete ve Rota'nın rota tanımından gelir (recete_rota_statu); stok yalnız kimliğini tutar. Statü kartına malzeme numarası
// metniyle bağlıdır (yabancı anahtar yok): kart kodu büyük harfe çevrilip karşılaştırılır, malzemeler de kodu böyle arar.
export interface StatuOzeti { id: number; malzemeNo: string; ad: string; urunKodu: string | null }
const statuKodu = (kod: string): string => kod.trim().toLocaleUpperCase('tr-TR');
// Metnin statü adında, statünün malzeme kodunda ya da mamül kodunda geçtiği statüler ("OP 10" gibi).
export function statuAramasi(statuler: readonly StatuOzeti[], metin: string): number[] {
  const m = metin.trim().toLocaleLowerCase('tr-TR');
  if (m === '') return [];
  return statuler.filter((s) => [s.ad, s.malzemeNo, s.urunKodu ?? ''].some((x) => x.toLocaleLowerCase('tr-TR').includes(m))).map((s) => s.id);
}
// Statülerin bağlı olduğu kart kodları, tekrarsız.
export const statuKodlari = (statuler: readonly StatuOzeti[]): string[] => [...new Set(statuler.map((s) => statuKodu(s.malzemeNo)).filter((k) => k !== ''))];
// Kartın tanımlı ama stoğu olmayan statüleri, kimlik sırasıyla (ayrıntıda salt okunur "tanımlı, stok yok" satırı).
export function stoksuzStatuler(statuler: readonly StatuOzeti[], kartKodu: string, kirilim: readonly { statuId: number | null }[]): { statuId: number }[] {
  const kod = statuKodu(kartKodu);
  const stoklu = new Set(kirilim.flatMap((k) => (k.statuId === null ? [] : [k.statuId])));
  return statuler.filter((s) => statuKodu(s.malzemeNo) === kod && !stoklu.has(s.id)).map((s) => s.id).sort((a, b) => a - b).map((statuId) => ({ statuId }));
}

// ---- Stok değeri (kullanıcı kararı 12.10.2026, #544: ağırlıklı ortalama alış fiyatı) ------------------------------------------
// Değer = her kartın pozitif toplamı x birim fiyat (TRY; servis ağırlıklı ortalama alış fiyatını verir). Fiyatı (ya da TRY karşılığı) olmayan stoklu kart değere katılmaz,
// sayılır; hiç fiyatlı kart yoksa değer null (sıfır uydurulmaz). Hesap tam sayıyla: miktar binde, fiyat on binde, sonuç kuruşa yarım yukarı.
const FIYAT = /^(\d+)(?:\.(\d+))?$/;
function onBinde(fiyat: string): bigint {
  const p = FIYAT.exec(fiyat.trim());
  if (!p) throw new Error(`Fiyat biçimi geçersiz: ${fiyat}`);
  const ondalik = (p[2] ?? '').padEnd(5, '0');
  const kesik = BigInt(p[1]!) * 10000n + BigInt(ondalik.slice(0, 4));
  return Number(ondalik[4]) >= 5 ? kesik + 1n : kesik;
}
export function stokDegeri(toplamlar: readonly { malzemeId: number; toplam: string }[], tryFiyat: ReadonlyMap<number, string | null>): { deger: string | null; fiyatsizKart: number } {
  let toplam = 0n, fiyatli = 0, fiyatsizKart = 0;
  for (const t of toplamlar) {
    const m = binde(t.toplam);
    if (m <= 0n) continue;
    const f = tryFiyat.get(t.malzemeId) ?? null;
    if (f === null) { fiyatsizKart += 1; continue; }
    fiyatli += 1;
    toplam += m * onBinde(f);
  }
  if (fiyatli === 0) return { deger: null, fiyatsizKart };
  const kurus = (toplam + 50000n) / 100000n;
  return { deger: `${kurus / 100n}.${(kurus % 100n).toString().padStart(2, '0')}`, fiyatsizKart };
}


// ---- Alış fiyatı ile değerleme (1382 d) ----------------------------------------------------------------------------------------
// Mal kabuller zaman sırasıyla işlenir; her kesimde (o andan önceki olaylar; null bütün geçmiş) kart başına iki fiyat çıkar:
// - Hareketli ortalama: mal kabulde (eldeki x ortalama + miktar x fiyat) / (eldeki + miktar). Eldeki, hareketten önceki stoktur;
//   eksiyse sıfır sayılır. Çıkış ortalamayı değiştirmez. Ortalama yokken (ilk fiyatlı kabul) eldeki her şey o fiyatla sayılır.
//   Geri alınan mal kabul kendi fiyatıyla çıkar: (eldeki x ortalama - miktar x fiyat) / (eldeki - miktar); kalan sıfırsa ya da
//   sonuç eksiye düşerse ortalama değişmez.
// - Son alış: geri alınmamış en son fiyatlı mal kabulün fiyatı.
// Fiyatı olmayan mal kabul (TRY karşılığı yok) fiyatı değiştirmez. Fiyat TRY, on binde yuvarlanır (yarım yukarı).
export interface AlisOlayi { malzemeId: number; zaman: string; miktar: string; once: string; malKabulSatirId: number; geri: boolean; fiyat: string | null }
export interface AlisFiyatlari { ortalama: string | null; sonAlis: string | null }
function onBindenMetin(d: bigint): string {
  const kalan = (d % 10000n).toString().padStart(4, '0').replace(/0+$/, '');
  return kalan === '' ? `${d / 10000n}` : `${d / 10000n}.${kalan}`;
}
const yuvarlaBol = (pay: bigint, payda: bigint): bigint => (2n * pay + payda) / (2n * payda);
export function alisFiyatlari(olaylar: readonly AlisOlayi[], kesimler: readonly (string | null)[]): Map<number, AlisFiyatlari>[] {
  const sinirlar = kesimler.map((k) => (k === null ? Infinity : Date.parse(k)));
  const sonuc = kesimler.map(() => new Map<number, AlisFiyatlari>());
  const kartlar = new Map<number, AlisOlayi[]>();
  for (const o of olaylar) kartlar.set(o.malzemeId, [...(kartlar.get(o.malzemeId) ?? []), o]);
  for (const [malzemeId, liste] of kartlar) {
    const sirali = [...liste].sort((a, b) => Date.parse(a.zaman) - Date.parse(b.zaman));
    let ortalama: bigint | null = null;
    const acik: { malKabulSatirId: number; fiyat: bigint }[] = [];
    const yaz = (i: number) => {
      const son = acik.at(-1);
      sonuc[i]!.set(malzemeId, { ortalama: ortalama === null ? null : onBindenMetin(ortalama), sonAlis: son === undefined ? null : onBindenMetin(son.fiyat) });
    };
    const bekleyen = sinirlar.map((_, i) => i).sort((a, b) => sinirlar[a]! - sinirlar[b]!);
    let k = 0;
    for (const o of sirali) {
      const an = Date.parse(o.zaman);
      while (k < bekleyen.length && sinirlar[bekleyen[k]!]! <= an) yaz(bekleyen[k++]!);
      if (o.fiyat === null) continue;
      const f = onBinde(o.fiyat), q = binde(o.miktar), eldeki = binde(o.once) > 0n ? binde(o.once) : 0n;
      if (!o.geri) {
        acik.push({ malKabulSatirId: o.malKabulSatirId, fiyat: f });
        ortalama = ortalama === null || eldeki === 0n ? f : yuvarlaBol(eldeki * ortalama + q * f, eldeki + q);
        continue;
      }
      const i = acik.findIndex((x) => x.malKabulSatirId === o.malKabulSatirId);
      if (i >= 0) acik.splice(i, 1);
      const pay = ortalama === null ? -1n : eldeki * ortalama - q * f;
      if (ortalama !== null && eldeki > q && pay >= 0n) ortalama = yuvarlaBol(pay, eldeki - q);
    }
    while (k < bekleyen.length) yaz(bekleyen[k++]!);
  }
  return sonuc;
}

// ---- Fabrika Haritası eşlemesi (kart #686, #711) -----------------------------------------------------------------------------
// Harita raf, göz ve alanın tek kaynağıdır; stok konumu yerin stok tarafıdır. Yalnız depo seçilmiş bölümün (aktif stok deposu
// bağlı) gözü ve stok alanı konum olur; üretim bölümünün rafı stok sayılmaz. Haritadan açılan göz konumunun kodu göz adresidir ve
// adres değişince izler; stok rafından gelen konum basılı etiketi korumak için kodunu tutar. Stoğu olan konum kapatılmaz.
// Fason, ara alan (bekleme) ve hurda fabrikanın her yerinde olur (kart #1304): depo olmayan bölümde de konum açılır ve ANA depoya
// bağlanır. Alanın türü değişince konumun türü izler; stoklu konumun türü ve deposu değişmez (kullanılabilir stok kendiliğinden
// değişmesin), bildirilir.
// Haritadaki bütün kutular stok barındırır (QR teslim, karar 97): oda, cam oda, bölge, karantina, sevkiyat ve palet de konum olur;
// karantina ve sevkiyat ayrılmış yerdir (AYRILMIS_KONUM_TURLERI). Yürüyüş yolu yer değil geçittir, konum olmaz.
export const HARITA_ALAN_TURLERI = ['kabul', 'uretim_cikisi', 'depo_zemini', 'fason', 'ara_alan', 'hurda', 'oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet'] as const;
const FABRIKA_GENELI = new Set<string>(['fason', 'ara_alan', 'hurda', 'oda', 'cam_oda', 'bolge', 'karantina', 'sevkiyat', 'palet'] satisfies HaritaAlanTuru[]);
export type HaritaAlanTuru = (typeof HARITA_ALAN_TURLERI)[number];
export interface HaritaGozu { id: number; adres: string; salonId: number; salonKodu: string; bolme: number; kat: number; rafAktif: boolean }
export interface HaritaAlani { id: number; salonId: number; tur: string; ad: string }
export interface HaritaDeposu { id: number; kod: string; salonId: number | null; aktif: boolean }
export interface HaritaKonumu { id: number; kod: string; tur: string; depoId: number; aktif: boolean; rafId: number | null; gozId: number | null; alanId: number | null; satirSayisi: number }
export interface YeniHaritaKonumu { depoId: number; salonId: number; kod: string; tur: 'raf_gozu' | HaritaAlanTuru; bolme: number | null; kat: number | null; ad: string | null; gozId: number | null; alanId: number | null; aktif: boolean }
export interface HaritaPlani {
  ekle: YeniHaritaKonumu[];
  guncelle: { id: number; kod: string; aktif: boolean }[];
  turDegisimi: { id: number; tur: HaritaAlanTuru; depoId: number }[];
  kapat: number[];
  atlanan: string[];
}
export const haritaAlaniMi = (tur: string): tur is HaritaAlanTuru => (HARITA_ALAN_TURLERI as readonly string[]).includes(tur);

// Depo kodu bölüm kodundan (en çok 10 büyük harf ya da rakam); doluysa sonuna sıra eklenir.
export function depoKoduOner(salonKodu: string, kullanilan: ReadonlySet<string>): string {
  const taban = salonKodu.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'DEPO';
  if (!kullanilan.has(taban)) return taban;
  for (let n = 2; ; n++) {
    const kod = taban.slice(0, 10 - String(n).length) + String(n);
    if (!kullanilan.has(kod)) return kod;
  }
}

export function haritaPlani(g: { gozler: readonly HaritaGozu[]; alanlar: readonly HaritaAlani[]; depolar: readonly HaritaDeposu[]; konumlar: readonly HaritaKonumu[]; kodlar: ReadonlySet<string> }): HaritaPlani {
  const plan: HaritaPlani = { ekle: [], guncelle: [], turDegisimi: [], kapat: [], atlanan: [] };
  const kodlar = new Set(g.kodlar);
  const bolumDeposu = new Map(g.depolar.flatMap((d) => (d.salonId !== null && d.aktif ? [[d.salonId, d.id] as const] : [])));
  const depolu = new Set(bolumDeposu.keys());
  const anaDepo = g.depolar.find((d) => d.kod === 'ANA' && d.aktif)?.id ?? null;
  const gozKonumu = new Map(g.konumlar.flatMap((k) => (k.gozId === null ? [] : [[k.gozId, k] as const])));
  const alanKonumu = new Map(g.konumlar.flatMap((k) => (k.alanId === null ? [] : [[k.alanId, k] as const])));
  const kapanacak = new Set<HaritaKonumu>();

  for (const z of g.gozler) {
    const k = gozKonumu.get(z.id);
    if (!depolu.has(z.salonId)) { if (k) kapanacak.add(k); continue; }
    if (!k) {
      if (kodlar.has(z.adres)) { plan.atlanan.push(z.adres); continue; }
      kodlar.add(z.adres);
      plan.ekle.push({ depoId: bolumDeposu.get(z.salonId)!, salonId: z.salonId, kod: z.adres, tur: 'raf_gozu', bolme: z.bolme, kat: z.kat, ad: null, gozId: z.id, alanId: null, aktif: z.rafAktif });
      continue;
    }
    let kod = k.kod;
    if (k.rafId === null && k.kod !== z.adres) {
      if (kodlar.has(z.adres)) plan.atlanan.push(z.adres);
      else { kodlar.delete(k.kod); kodlar.add(z.adres); kod = z.adres; }
    }
    // Pasif rafın stoklu gözü açık kalır (bakiye pasif konumda duramaz) ve bildirilir; stok taşınınca sonraki eşleme kapatır.
    let aktif = z.rafAktif;
    if (!aktif && k.aktif && k.satirSayisi > 0) { aktif = true; plan.atlanan.push(kod); }
    if (kod !== k.kod || k.aktif !== aktif) plan.guncelle.push({ id: k.id, kod, aktif });
  }

  for (const a of g.alanlar) {
    const k = alanKonumu.get(a.id);
    const depoId = !haritaAlaniMi(a.tur) ? null : bolumDeposu.get(a.salonId) ?? (FABRIKA_GENELI.has(a.tur) ? anaDepo : null);
    if (depoId === null || !haritaAlaniMi(a.tur)) { if (k) kapanacak.add(k); continue; }
    if (k) {
      if (!k.aktif) plan.guncelle.push({ id: k.id, kod: k.kod, aktif: true });
      if (k.tur === a.tur && k.depoId === depoId) continue;
      if (k.satirSayisi > 0) plan.atlanan.push(k.kod);
      else plan.turDegisimi.push({ id: k.id, tur: a.tur, depoId });
      continue;
    }
    const kod = `ALAN-${a.id}`;
    if (kodlar.has(kod)) { plan.atlanan.push(kod); continue; }
    kodlar.add(kod);
    plan.ekle.push({ depoId, salonId: a.salonId, kod, tur: a.tur, bolme: null, kat: null, ad: a.ad.slice(0, 60), gozId: null, alanId: a.id, aktif: true });
  }

  // Haritadan açılmış, gözü silinmiş konum ya da depo olmayan bölümdeki konum: stoğu yoksa kapanır, varsa kalır ve bildirilir.
  for (const k of g.konumlar) if (k.rafId === null && k.gozId === null && k.alanId === null) kapanacak.add(k);
  for (const k of kapanacak) {
    if (!k.aktif) continue;
    if (k.satirSayisi > 0) plan.atlanan.push(k.kod);
    else plan.kapat.push(k.id);
  }
  return plan;
}

// DEP-62 (kart #1304): türü yalnız elle açılan konumda değişir. Haritaya bağlı konumun türü alanın türünden gelir; stoklu konumun
// türü değişmez (kullanılabilir stok yalnız taşımayla değişsin); sabit konum (KABUL, URETIM) kendi türünde kalır.
export function konumTurDegisimEngeli(k: { kod: string; tur: KonumTuru; haritaGozId: number | null; haritaAlanId: number | null; satirSayisi: number }, yeni: KonumTuru): string | null {
  if (k.tur === yeni) return null;
  if (k.haritaGozId !== null || k.haritaAlanId !== null) return 'Bu konum Fabrika Haritası\'na bağlı; türü haritada alanın türünden gelir.';
  if (!(ELLE_KONUM_TURLERI as readonly string[]).includes(k.tur) || ['KABUL', 'URETIM'].includes(k.kod)) return 'Bu konumun türü değiştirilemez.';
  if (k.satirSayisi > 0) return 'Konumda stok var; türü değiştirmeden önce stoğu taşıyın.';
  return null;
}

// ---- Malzeme · Teslim (kart #1208) ------------------------------------------------------------------------------------------
// STK-T1: istek açılışta depo konumlarındaki stok (serbest ve statülü) istenenden azsa "stok yok" durumunda açılır; depo ve satın
// alma görür, istek yine karşılanabilir.
export const istekAcilisDurumu = (depodaki: string, istenen: string): 'acik' | 'stok_yok' => (binde(depodaki) >= binde(istenen) ? 'acik' : 'stok_yok');
// STK-T2: teslim yalnız yoldayken kapanır (teslim alınır, reddedilir ya da iptal edilir); kapanan değişmez.
export function teslimKapanisEngeli(durum: TeslimDurumu): string | null {
  if (durum === 'yolda') return null;
  if (durum === 'teslim') return 'Teslim alındı; değiştirilemez.';
  if (durum === 'red') return 'Teslim reddedildi; değiştirilemez.';
  return 'Teslim iptal edildi; değiştirilemez.';
}
// STK-T3: teslimi yalnız gönderen iptal eder. STK-T4: istasyona geleni o istasyonun kapsamındaki kişi, istasyon olmayan konuma
// (depo) geleni depo işlemi olan alır ya da reddeder; gönderen kendi gönderdiğini teslim almaz.
export type TeslimAlani = { tur: 'istasyon'; kapsamda: boolean } | { tur: 'depo'; depoIslemi: boolean };
// STK-T8 (299 b): kişiye yazılan teslimi yalnız o kişi alır ya da reddeder.
// Soru 133: kişiye teslim istasyona teslimdir; istasyonun kapsamındaki herkes alır (299 b'deki "yalnız o kişi" kalktı).
// Kişisiz hedef (depo) kişiye bağlanmaz; baskasinaGeliyor yalnız istasyon dışı hedefte reddeder.
export function teslimAlmaEngeli(gonderenBenMi: boolean, alan: TeslimAlani, baskasinaGeliyor = false): string | null {
  if (gonderenBenMi) return 'Kendi gönderdiğiniz teslimi alamazsınız; karşı taraf alır.';
  if (baskasinaGeliyor && alan.tur !== 'istasyon') return 'Bu teslim başka bir kişiye geliyor.';
  if (alan.tur === 'istasyon' ? !alan.kapsamda : !alan.depoIslemi) return 'Bu teslim size gelmiyor.';
  return null;
}

// STK-T5: isteğe bağlı teslimi depo gönderir; istek kapanmamış, malzemesi aynı ve hedefi isteğin istasyonudur.
// İstasyonsuz istek kişiye teslim edilir; stok konumu olmadığı için teslimle değil istekteki "teslim edildi" ile kapanır.
// STK-H3: istek yolda bir teslimle karşılanıyorsa ikinci teslim açılmaz; açık bir hazırlık listesindeyse liste karşılar.
export function istekliTeslimEngeli(
  istek: { durum: MalzemeIstegiDurumu; malzemeId: number; istasyonId: number | null; toplamaNo?: string | null; toplamaDurumu?: string | null },
  teslim: { malzemeId: number; hedefIstasyonId: number | null; depoIslemi: boolean; yoldaVar?: boolean },
): string | null {
  if (!teslim.depoIslemi) return 'İsteği yalnız depo karşılar.';
  if (!ISTEK_GECIS_KAYNAKLARI.teslim.includes(istek.durum)) return 'İstek kapandı; teslim bağlanamaz.';
  if (teslim.yoldaVar) return 'Bu istek için yolda bir teslim var; istasyon alınca ya da reddedince yenisi gönderilir.';
  const liste = istekListeEngeli(istek);
  if (liste) return liste;
  if (istek.malzemeId !== teslim.malzemeId) return 'Teslim edilen malzeme istenenle aynı değil.';
  if (istek.istasyonId === null) return 'İstasyonsuz istek kişiye teslim edilir; istekte "Teslim et" ile kapatın.';
  if (istek.istasyonId !== teslim.hedefIstasyonId) return 'Teslim isteğin istasyonuna gider.';
  return null;
}
// STK-T7: "nereden" kendiliğinden dolar: kişinin açık işinin istasyonu kapsamındaysa o; açık işi yoksa kapsamında tek istasyon
// varsa o; ikisi de değilse kişi seçer.
export function buradakiIstasyon(acikIstasyonId: number | null, kapsamdakiler: readonly number[]): number | null {
  if (acikIstasyonId !== null && kapsamdakiler.includes(acikIstasyonId)) return acikIstasyonId;
  return kapsamdakiler.length === 1 ? kapsamdakiler[0]! : null;
}
// İstenenden fazla teslim edilebilir (kullanıcı kararı "Uyarıyla izin", kart #1413); kayda yazılacak not, fazla değilse null.
export function istenenFazlaNotu(istenen: string, verilen: string): string | null {
  return binde(verilen) > binde(istenen) ? `istenenden fazla (istenen ${bindenMetin(binde(istenen))})` : null;
}
// STK-T6: teslim alan gönderilenden fazlasını alamaz; kaynakta alınan kadar yoksa teslim alınamaz. Eksiye düşmeyi alan
// onaylayamaz: kaynağın sahibi gönderen olduğundan teslimi o iptal edip düzeltir.
export function teslimAlimMiktariEngeli(gonderilen: string, alinan: string, kaynakta: string): string | null {
  if (binde(alinan) > binde(gonderilen)) return `Gönderilenden (${bindenMetin(binde(gonderilen))}) fazla alınamaz.`;
  if (binde(alinan) > binde(kaynakta)) return `Kaynakta yeterli stok yok (mevcut ${bindenMetin(binde(kaynakta))}); gönderen teslimi iptal edip düzeltmeli.`;
  return null;
}
// Kısmi karşılanan isteğin kalanı (kart #1410, kullanıcı kararı "Kalanla açık"): istek karşılananla kapanır, kalan yeni istekle açık kalır.
export function istekKalani(istenen: string, karsilanan: string): string | null {
  const k = binde(istenen) - binde(karsilanan);
  return k > 0n ? bindenMetin(k) : null;
}
// Yoldaki teslim kaynağında ayrılmıştır (kart #1410): gönderilen ya da kullanılan miktar bakiyeden yoldakiler düşülünce kalanı aşamaz;
// yoksa aynı parça iki kez gönderilir ve hata ancak alan teslim alırken çıkar.
export function serbestMiktarEngeli(bakiye: string, yolda: string, miktar: string, eylem: string): string | null {
  const serbest = binde(bakiye) - binde(yolda);
  if (binde(miktar) <= serbest) return null;
  const s = bindenMetin(serbest > 0n ? serbest : 0n);
  return binde(yolda) > 0n ? `Burada ${s} serbest var (${bindenMetin(binde(yolda))} yolda); fazlası ${eylem}.` : `Burada ${s} var; fazlası ${eylem}.`;
}

// ---- Malzeme iste: istasyondan istek ve okutarak alma (kart #95, soru 96) ---------------------------------------------------------
// Soru 98 a: mamul ve yarı mamul elle sevkte stoktan düşülmez; okutulan ürünün sevkiyat işi ilerler ve stok iş durumuyla bir kez düşer.
// Elle sevk çıkışı yalnız emirsiz malzemede (hammadde, ticari mal vb.) kalır; öteki çıkış nedenleri değişmez.
export function sevkCikisEngeli(tur: KatalogTuru | string, cikisNedeni: string): string | null {
  if (cikisNedeni !== 'sevk' || (tur !== 'mamul' && tur !== 'yarimamul')) return null;
  return 'Mamul ve yarı mamul elle sevk çıkışıyla düşülmez; ürünü okutup Teslim et > Sevk ile sevkiyat işini ilerletin.';
}
// İstasyondan istek: teslim yeri istasyon olmalı ve kaynaktan farklı olmalı (o istasyonun yetkilisi teslimi oraya gönderir).
export function istasyondanIstekEngeli(kaynakIstasyonId: number, hedefIstasyonId: number | null): string | null {
  if (hedefIstasyonId === null) return 'İstasyondan istenen malzeme bir istasyona teslim edilir; teslim yerini seçin.';
  if (hedefIstasyonId === kaynakIstasyonId) return 'Malzeme zaten bu istasyonda; başka bir istasyon seçin.';
  return null;
}
// Telafi 1: okutarak yalnız kalitesi serbest stok alınır (karar bekleyen ve red alınmaz; yoldaki ayrılmış serbestMiktarEngeli ile düşülür).
// K2: başka emrin partisi alınmaz; emirli parti yalnız aynı emir için alınır, emirsiz parti serbesttir.
export function okutarakAlmaEngeli(s: { kalite: KaliteDurumu; partiEmriId: number | null; uretimEmriId: number | null; kaynakIstasyonId: number; hedefIstasyonId: number }): string | null {
  if (s.kaynakIstasyonId === s.hedefIstasyonId) return 'Malzeme zaten bu istasyonda.';
  if (s.kalite !== 'serbest') return 'Kalite kararı bekleyen ya da red parça okutarak alınmaz.';
  if (s.partiEmriId !== null && s.partiEmriId !== s.uretimEmriId) return 'Bu parti başka bir emrin; yalnız o emir için alınır.';
  return null;
}
// Telafi 3: itiraz süresi alındığı günün vardiya bitişine kadardır; vardiya bitişi yoksa ya da geçtiyse tesis gününün sonuna kadar.
export function itirazSonu(an: number, vardiyaBitisi: string | null, gunSonu: number): string {
  const v = vardiyaBitisi === null ? Number.NaN : Date.parse(vardiyaBitisi);
  return new Date(Number.isFinite(v) && v > an ? v : gunSonu).toISOString();
}

// ---- Üretim sayımının stoğa yansıması (kart #1289) ------------------------------------------------------------------------------
export interface IstasyonEmirBakiyesi { partiId: number; statuId: number | null; kaliteDurumu?: KaliteDurumu; miktar: string; ayrilan: string }
export interface SayimYansimaPlani {
  // Aynı konumda statü dönüşümü (kaynak → hedef); kalite durumu da dönüşebilir (miras, 138 a).
  donusumler: { partiId: number; kaynakStatuId: number | null; hedefStatuId: number | null; kaynakKalite: KaliteDurumu; hedefKalite: KaliteDurumu; miktar: bigint }[];
  // Emrin partisine yeni üretim girişi (yalnız artışta).
  giris: bigint;
  // Azalışta dönüşümle karşılanmayan, üretim girişi geri alınarak düşülecek miktar (parti ve kalite durumu başına).
  geriAlinacaklar: { partiId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: bigint }[];
}
const serbest = (b: IstasyonEmirBakiyesi): bigint => { const k = binde(b.miktar) - binde(b.ayrilan); return k > 0n ? k : 0n; };
// 138 a: girdiden ürüne en kötü kalite durumu geçer (red > karar_bekliyor > sartli > serbest).
const KALITE_SIRASI: readonly KaliteDurumu[] = ['serbest', 'sartli', 'karar_bekliyor', 'red'];
export function enKotuKalite(...durumlar: readonly KaliteDurumu[]): KaliteDurumu {
  return durumlar.reduce<KaliteDurumu>((a, b) => (KALITE_SIRASI.indexOf(b) > KALITE_SIRASI.indexOf(a) ? b : a), 'serbest');
}
// STK-U1: sağlam artışı önce istasyondaki emrin başka statüdeki (önceki adımdan gelen) parçasını adımın statüsüne çevirir; yoldaki
// teslime ayrılan çevrilmez. Kalan yeni üretim girişidir (ilk adımda girdi parça yoktur). Çevrilen parça sayımın ve kendi kalite
// durumunun kötüsünü alır (karar bekleyen sayım, 131 b; miras, 138 a).
export function sayimArtisPlani(artis: bigint, hedefStatuId: number | null, bakiyeler: readonly IstasyonEmirBakiyesi[], kalite: KaliteDurumu = 'serbest'): SayimYansimaPlani {
  let kalan = artis;
  const donusumler: SayimYansimaPlani['donusumler'] = [];
  for (const b of bakiyeler) {
    if (kalan <= 0n) break;
    if (b.statuId === hedefStatuId) continue;
    const al = serbest(b) < kalan ? serbest(b) : kalan;
    if (al <= 0n) continue;
    const kaynakKalite = b.kaliteDurumu ?? 'serbest';
    donusumler.push({ partiId: b.partiId, kaynakStatuId: b.statuId, hedefStatuId, kaynakKalite, hedefKalite: enKotuKalite(kalite, kaynakKalite), miktar: al });
    kalan -= al;
  }
  return { donusumler, giris: kalan, geriAlinacaklar: [] };
}
// STK-U2: sağlam azalışı yalnız adımın statüsünde istasyonda kalan ve yoldaki teslime ayrılmamış miktardan düşülür; teslim edilen
// (yoldaki ya da alınan) sayı kilitlidir, fazlası reddedilir (null). Düşüş önce o partideki dönüşümü geri çevirir, kalanı üretim
// girişinden geri alınır. Önce sayımın kalite durumundaki parça düşülür (karar bekleyen düzeltme karar bekleyenden); kalite geri çevrilmez.
export function sayimAzalisPlani(
  azalis: bigint, hedefStatuId: number | null, bakiyeler: readonly IstasyonEmirBakiyesi[],
  donusumler: readonly { partiId: number; oncekiStatuId: number | null; miktar: string }[], kalite: KaliteDurumu = 'serbest',
): SayimYansimaPlani | null {
  const adimdaki = bakiyeler.filter((b) => b.statuId === hedefStatuId);
  adimdaki.sort((a, b) => Number((b.kaliteDurumu ?? 'serbest') === kalite) - Number((a.kaliteDurumu ?? 'serbest') === kalite));
  if (adimdaki.reduce((t, b) => t + serbest(b), 0n) < azalis) return null;
  const geri = new Map(donusumler.map((d) => [`${d.partiId}:${String(d.oncekiStatuId)}`, binde(d.miktar)]));
  const plan: SayimYansimaPlani = { donusumler: [], giris: 0n, geriAlinacaklar: [] };
  let kalan = azalis;
  for (const b of adimdaki) {
    if (kalan <= 0n) break;
    const k = b.kaliteDurumu ?? 'serbest';
    let al = serbest(b) < kalan ? serbest(b) : kalan;
    kalan -= al;
    for (const d of donusumler) {
      if (al <= 0n) break;
      if (d.partiId !== b.partiId) continue;
      const anahtar = `${d.partiId}:${String(d.oncekiStatuId)}`;
      const acik = geri.get(anahtar) ?? 0n;
      const cevir = acik < al ? acik : al;
      if (cevir <= 0n) continue;
      plan.donusumler.push({ partiId: b.partiId, kaynakStatuId: hedefStatuId, hedefStatuId: d.oncekiStatuId, kaynakKalite: k, hedefKalite: k, miktar: cevir });
      geri.set(anahtar, acik - cevir);
      al -= cevir;
    }
    if (al > 0n) plan.geriAlinacaklar.push({ partiId: b.partiId, statuId: hedefStatuId, kaliteDurumu: k, miktar: al });
  }
  return plan;
}

// ---- Hazırlık (toplama ve istek birleşik) ----------------------------------------------------------------------------------
// STK-H1: açık hazırlık listesindeki istek tek başına teslim edilmez ve başka listeye girmez.
export function istekListeEngeli(istek: { toplamaNo?: string | null; toplamaDurumu?: string | null }): string | null {
  return istek.toplamaDurumu === 'topluyor' ? `İstek ${istek.toplamaNo ?? 'bir'} hazırlık listesinde; liste karşılar.` : null;
}
// STK-H2: adımda planlanandan az toplanabilir (kısmi), fazlası toplanmaz; sıfır toplanmaz.
export function adimMiktarEngeli(planlanan: string, toplanan: string): string | null {
  const t = binde(toplanan);
  if (t <= 0n) return 'Toplanan miktar sıfırdan büyük olmalı.';
  if (t > binde(planlanan)) return `Bu gözden en çok ${bindenMetin(binde(planlanan))} toplanır; fazlası için yeni liste açın.`;
  return null;
}
// STK-H4: liste bitince toplanan miktar, aynı malzemenin istekleri arasında açılış sırasıyla dağıtılır; bir isteğe istediğinden
// fazlası yazılmaz. Hiç karşılanamayan istek açık kalır (listeden çıkar, yeniden listelenebilir).
export function istekKarsilamalari(istekler: readonly { id: number; malzemeId: number; miktar: string }[], toplanan: ReadonlyMap<number, string>): Map<number, string> {
  const kalan = new Map([...toplanan].map(([m, t]) => [m, binde(t)]));
  const sonuc = new Map<number, string>();
  for (const i of istekler) {
    const eldeki = kalan.get(i.malzemeId) ?? 0n;
    const verilen = eldeki < binde(i.miktar) ? eldeki : binde(i.miktar);
    if (verilen <= 0n) continue;
    sonuc.set(i.id, bindenMetin(verilen));
    kalan.set(i.malzemeId, eldeki - verilen);
  }
  return sonuc;
}

// ---- İstasyon sepeti: sonraki istasyon (kart #1353) ---------------------------------------------------------------------------
// Parçanın bulunduğu adım, rotada bu istasyondaki adımlardan statüsü parçanınkiyle eşleşendir; statüsüz parça son işlenmiş hâldir
// (istasyondaki son adım). Sonraki istasyon, ondan sonraki ilk farklı istasyondur; aynı istasyondaki ardışık adım teslim istemez.
export interface SepetAdimi { sira: number; opNo: number; istasyonId: number | null; statuId: number | null }
export type SonrakiIstasyon = { istasyonId: number; opNo: number } | { yok: 'son-adim' | 'fason' | 'rota-disi' };
export function sonrakiIstasyon(adimlar: readonly SepetAdimi[], buradakiIstasyonId: number, parcaStatuId: number | null): SonrakiIstasyon {
  const sirali = [...adimlar].sort((a, b) => a.sira - b.sira || a.opNo - b.opNo);
  const burada = sirali.flatMap((a, i) => (a.istasyonId === buradakiIstasyonId ? [i] : []));
  if (burada.length === 0) return { yok: 'rota-disi' };
  const eslesen = parcaStatuId === null ? burada.at(-1)! : burada.find((i) => sirali[i]!.statuId === parcaStatuId);
  if (eslesen === undefined) return { yok: 'rota-disi' };
  const sonraki = sirali.slice(eslesen + 1).find((a) => a.istasyonId !== buradakiIstasyonId);
  if (sonraki === undefined) return { yok: 'son-adim' };
  return sonraki.istasyonId === null ? { yok: 'fason' } : { istasyonId: sonraki.istasyonId, opNo: sonraki.opNo };
}

// ---- Terminal üretim girişi: adımın girdisi ve çıktısı ------------------------------------------------------------------------
// Bir adet için reçete miktarı (dört ondalık) x adet (binde); stoğun üç ondalığına yukarı yuvarlanır (eksik düşülmez).
export function adetMiktari(adetBinde: bigint, birimMiktar: string): bigint {
  return onBindeCarp(adetBinde, onBindeOku(birimMiktar));
}
function onBindeOku(birimMiktar: string): bigint {
  const p = DORT_ONDALIK.exec(birimMiktar.trim());
  if (!p) throw new Error(`Reçete miktarı biçimi geçersiz: ${birimMiktar}`);
  return BigInt(p[1] ?? '0') * 10000n + BigInt((p[2] ?? '').padEnd(4, '0'));
}
const onBindeCarp = (adetBinde: bigint, onBinde: bigint): bigint => (adetBinde * onBinde + 9999n) / 10000n;

// Başlatmadan önce adımın girdileri (kart #1289): istasyonda en az bir adetlik girdi yoksa eksiktir. İstenecek, emrin bütün adedi
// için gereken miktarın istasyondakinden fazlasıdır. Aynı malzeme adımda iki kez yazılmışsa miktarları toplanır.
export interface BaslatmaEksigi { malzemeId: number; gereken: bigint; istasyonda: bigint; istenecek: bigint }
export function baslatmaEksikleri(
  girdiler: readonly { malzemeNo: number; miktar: string }[], istasyonda: ReadonlyMap<number, bigint>, adetBinde: bigint,
): BaslatmaEksigi[] {
  // Toplam, bir adetin yuvarlanmış miktarından değil reçetenin dört ondalığından çarpılır: 1000 x 0,0004 kg 1 kg değil 0,4 kg'dır.
  const birim = new Map<number, bigint>();
  for (const g of girdiler) birim.set(g.malzemeNo, (birim.get(g.malzemeNo) ?? 0n) + onBindeOku(g.miktar));
  const eksikler: BaslatmaEksigi[] = [];
  for (const [malzemeId, onBinde] of birim) {
    const gereken = onBindeCarp(1000n, onBinde);
    const mevcut = istasyonda.get(malzemeId) ?? 0n;
    if (gereken <= 0n || mevcut >= gereken) continue;
    const toplam = onBindeCarp(adetBinde, onBinde);
    eksikler.push({ malzemeId, gereken, istasyonda: mevcut, istenecek: toplam > mevcut ? toplam - mevcut : gereken - mevcut });
  }
  return eksikler;
}

// Sayım farkının stoğa planı. Adım taşınan malzemeyi (statü kuralı: ilk adımın ilk girdisi; çıktılı adımdan sonra o adımın çıktısı)
// üç biçimde işler: ara adımda aynı malzeme kalır, önceki statüden adımın statüsüne çevrilir; çıktılı adımda (adım çıktısı dolu) taşınan
// düşülür, çıktı kartı girer; son adımda taşınan düşülür, emrin ürünü (ya da adımın çıktısı) girer. Adımın öteki girdileri üretime
// sarftır. İlk adımda taşınan malzeme adımın girdisidir: ara adımsa sarf değil çevirmedir, öteki hâllerde girdi olarak düşülür.
// Çıktı statüsüz girer; çıktılı adımdan sonraki adım taşınanı statüsüzden alır.
export interface UretimAdimPlani {
  // tasinan: önceki adımlardan gelen parça; statüsüz olsa da istasyonda ya da üretim çıkışında bulunabilir.
  sarflar: { malzemeId: number; statuId: number | null; miktar: bigint; tasinan?: true }[];
  cevirme: { malzemeId: number; kaynakStatuId: number | null; hedefStatuId: number | null; miktar: bigint; tasinan?: true } | null;
  // malzemeId null: emrin ürünü. statuId: birleştirmede dalların parçasından doğan ürün adımın statüsüne girer (1348 a); öteki hâllerde yok.
  giris: { malzemeId: number | null; miktar: bigint; statuId?: number | null } | null;
}
export function uretimAdimPlani(g: {
  adet: bigint; ilkAdim: boolean; sonAdim: boolean; statuId: number | null; oncekiStatuId: number | null; oncekiCiktili: boolean;
  cikti: number | null; girdiler: readonly { malzemeNo: number; miktar: string }[]; tasinan: { malzemeNo: number; miktar: string };
}): UretimAdimPlani {
  const cevirmeli = !g.sonAdim && g.cikti === null;
  const sarflar: UretimAdimPlani['sarflar'] = [];
  let tasinanGirdide = false;
  for (const x of g.girdiler) {
    if (g.ilkAdim && !tasinanGirdide && x.malzemeNo === g.tasinan.malzemeNo) {
      tasinanGirdide = true;
      if (cevirmeli) continue;
    }
    sarflar.push({ malzemeId: x.malzemeNo, statuId: null, miktar: adetMiktari(g.adet, x.miktar) });
  }
  const tasinanMiktari = adetMiktari(g.adet, g.tasinan.miktar);
  const kaynak = g.ilkAdim || g.oncekiCiktili ? null : g.oncekiStatuId;
  let cevirme: UretimAdimPlani['cevirme'] = null;
  if (cevirmeli) {
    if (kaynak !== g.statuId && (!g.ilkAdim || tasinanGirdide)) {
      cevirme = { malzemeId: g.tasinan.malzemeNo, kaynakStatuId: kaynak, hedefStatuId: g.statuId, miktar: tasinanMiktari, ...(g.ilkAdim ? {} : { tasinan: true as const }) };
    }
  } else if (!g.ilkAdim) {
    sarflar.push({ malzemeId: g.tasinan.malzemeNo, statuId: kaynak, miktar: tasinanMiktari, tasinan: true });
  }
  const giris = g.sonAdim ? { malzemeId: g.cikti, miktar: g.adet } : g.cikti === null ? null : { malzemeId: g.cikti, miktar: g.adet };
  return { sarflar, cevirme, giris };
}

// Dallı emirde (1348 a) adımın taşıma kaynağı, Reçete ve Rota statü kuralıyla aynı. Öncül listesi başka öncülün zaten beklediği
// öncülden arındırılır. ilk: öncülsüz dal başı ilk girdisini taşır (girdi yoksa taşımasız); oncul: tek öncülün parçasını taşır, başka dala
// geçen ve kendi girdisi olan adım ise kendi girdisini (ilk); birlesme: dalların parçası tüketilir, adım emrin ürününü taşır. Aynı öncülden
// ayrılıp onun parçasını devralacak birden çok dal varsa parçayı yalnız ilki taşır, ötekiler taşımasızdır (yok): bir parça iki kez
// tüketilmez. Listesi olmayan adım (1248 öncesi) için null.
export interface ZincirAdimi {
  opNo: number; dal: string | null; adetCarpani?: number | null; onculOpNolari: readonly number[] | null; girdiler: readonly { malzemeNo: number; miktar: string }[];
}
// 1360 (1257 a): öncülden gelen parça adedi = adım adedi x öncül çarpanı / adım çarpanı (uretim-emirleri onculdenGelen'in tersi; boş çarpan 1).
// Bindelik adet tam sayıya aşağı yuvarlanır.
export interface GelenOrani { pay: number; payda: number }
export const gelenOrani = (oncul: { adetCarpani?: number | null }, adim: { adetCarpani?: number | null }): GelenOrani =>
  ({ pay: oncul.adetCarpani ?? 1, payda: adim.adetCarpani ?? 1 });
export const oranliAdet = (adet: bigint, oran: GelenOrani | undefined): bigint =>
  (oran === undefined ? adet : (adet * BigInt(oran.pay)) / BigInt(oran.payda));
export type TasimaKaynagi =
  | { tur: 'ilk'; girdi: { malzemeNo: number; miktar: string } | null }
  | { tur: 'oncul'; opNo: number }
  | { tur: 'birlesme'; opNolari: number[] }
  | { tur: 'yok' };
export function dalliOnculler(zincir: readonly ZincirAdimi[]): Map<number, number[] | null> {
  const sira = new Map(zincir.map((a, i) => [a.opNo, i]));
  const atalar = new Map<number, Set<number>>();
  const sonuc = new Map<number, number[] | null>();
  for (const a of zincir) {
    const i = sira.get(a.opNo)!;
    const dogrudan = a.onculOpNolari === null ? null : [...new Set(a.onculOpNolari.filter((o) => (sira.get(o) ?? i) < i))];
    const ata = new Set<number>();
    for (const o of dogrudan ?? []) { ata.add(o); for (const x of atalar.get(o) ?? []) ata.add(x); }
    atalar.set(a.opNo, ata);
    sonuc.set(a.opNo, dogrudan === null ? null : dogrudan.filter((o) => !dogrudan.some((d) => d !== o && atalar.get(d)?.has(o)))
      .sort((x, y) => sira.get(x)! - sira.get(y)!));
  }
  return sonuc;
}
export function tasimaKaynagi(zincir: readonly ZincirAdimi[], opNo: number): TasimaKaynagi | null {
  const onculler = dalliOnculler(zincir);
  const adim = zincir.find((a) => a.opNo === opNo);
  const liste = onculler.get(opNo);
  if (adim === undefined || liste === null || liste === undefined) return null;
  const ilkGirdi = (a: ZincirAdimi) => a.girdiler[0] ?? null;
  if (liste.length === 0) return { tur: 'ilk', girdi: ilkGirdi(adim) };
  if (liste.length > 1) return { tur: 'birlesme', opNolari: liste };
  const oncul = liste[0]!;
  const dalDegisti = (a: ZincirAdimi) => a.dal !== (zincir.find((x) => x.opNo === oncul)?.dal ?? null) && a.girdiler.length > 0;
  if (dalDegisti(adim)) return { tur: 'ilk', girdi: ilkGirdi(adim) };
  const devralan = zincir.find((a) => onculler.get(a.opNo)?.length === 1 && onculler.get(a.opNo)![0] === oncul && !dalDegisti(a));
  return devralan?.opNo === opNo ? { tur: 'oncul', opNo: oncul } : { tur: 'yok' };
}
// Dallı emirde sayımın planı (1348 a). Gelenler öncüllerden bu adıma gelen parçalardır (birer adet için miktar). Tek öncülden devam eden
// parça ara adımda adımın statüsüne çevrilir; birleştirmede gelen her parça tüketilir ve ara adımda emrin ürünü adımın statüsüne girer.
// Dal başı uretimAdimPlani'nin ilk adımı gibidir. Son ve çıktılı adım gelenleri tüketir, ürünü ya da çıktıyı girer.
export function dalliAdimPlani(g: {
  adet: bigint; sonAdim: boolean; statuId: number | null; cikti: number | null; girdiler: readonly { malzemeNo: number; miktar: string }[];
  tasinan: { malzemeNo: number; miktar: string }; gelenler: readonly { malzemeId: number; statuId: number | null; miktar: string; oran?: GelenOrani }[]; kaynak: TasimaKaynagi['tur'];
}): UretimAdimPlani {
  const cevirmeli = !g.sonAdim && g.cikti === null;
  const ilk = g.kaynak === 'ilk';
  const sarflar: UretimAdimPlani['sarflar'] = [];
  let tasinanGirdide = false;
  for (const x of g.girdiler) {
    if (ilk && cevirmeli && !tasinanGirdide && x.malzemeNo === g.tasinan.malzemeNo) { tasinanGirdide = true; continue; }
    sarflar.push({ malzemeId: x.malzemeNo, statuId: null, miktar: adetMiktari(g.adet, x.miktar) });
  }
  let cevirme: UretimAdimPlani['cevirme'] = null;
  let giris: UretimAdimPlani['giris'] = cevirmeli ? null : { malzemeId: g.cikti, miktar: g.adet };
  const devam = g.kaynak === 'oncul' ? g.gelenler[0] : undefined;
  if (cevirmeli && devam !== undefined) {
    if (devam.statuId !== g.statuId) {
      cevirme = { malzemeId: devam.malzemeId, kaynakStatuId: devam.statuId, hedefStatuId: g.statuId, miktar: adetMiktari(oranliAdet(g.adet, devam.oran), devam.miktar), tasinan: true };
    }
    return { sarflar, cevirme, giris };
  }
  for (const p of g.gelenler) sarflar.push({ malzemeId: p.malzemeId, statuId: p.statuId, miktar: adetMiktari(oranliAdet(g.adet, p.oran), p.miktar), tasinan: true });
  if (cevirmeli && tasinanGirdide && g.statuId !== null) {
    cevirme = { malzemeId: g.tasinan.malzemeNo, kaynakStatuId: null, hedefStatuId: g.statuId, miktar: adetMiktari(g.adet, g.tasinan.miktar) };
  } else if (cevirmeli && g.kaynak === 'birlesme') {
    giris = { malzemeId: g.tasinan.malzemeNo, miktar: g.adet, statuId: g.statuId };
  }
  return { sarflar, cevirme, giris };
}

// Denetim #1: emre elle sarf edilen statüsüz girdi sayımda yeniden düşülmez. Sayımın istediğinden, emrin ihtiyacını aşan kısım elle
// verilenden mahsup edilir (en çok elle verilen kadar): toplam düşüm ihtiyacı aşmaz. İhtiyaç bilinmiyorsa mahsup yoktur. Elle verilen
// emrin sonuna sayılır: önce gelen sayım depodan düşebilir, emir bitince toplam doğrudur.
export function elleSarfMahsubu(g: { istenen: bigint; elle: bigint; net: bigint; ihtiyac: bigint | null }): bigint {
  if (g.ihtiyac === null || g.elle <= 0n) return 0n;
  const fazla = g.net + g.istenen - g.ihtiyac;
  const m = fazla < g.elle ? fazla : g.elle;
  return m <= 0n ? 0n : m < g.istenen ? m : g.istenen;
}

// Bulunan kaynaklardan sırayla istenen kadar alınır; yetmezse bulunan kadarı (eksik tamamlamada görünür).
export function kaynaklardanAl<T extends { serbest: string }>(kaynaklar: readonly T[], istenen: bigint): (T & { miktar: bigint })[] {
  const alinan: (T & { miktar: bigint })[] = [];
  let kalan = istenen;
  for (const k of kaynaklar) {
    if (kalan <= 0n) break;
    const s = binde(k.serbest);
    if (s <= 0n) continue;
    const al = s < kalan ? s : kalan;
    alinan.push({ ...k, miktar: al });
    kalan -= al;
  }
  return alinan;
}

// Sayımın girdisi kaynak sırasıyla alınır; serbest olmayan (karar bekleyen, red) istasyondaki parça rezerve dışıdır ve uyarıyla
// kullanılır (135), serbestten yalnız emrin kullanabileceği kadarı (serbestHakki) alınır.
export function girdiSec<T extends { serbest: string; kaliteDurumu: KaliteDurumu }>(kaynaklar: readonly T[], istenen: bigint, serbestHakki: bigint): (T & { miktar: bigint })[] {
  const alinan: (T & { miktar: bigint })[] = [];
  let kalan = istenen;
  let hak = serbestHakki;
  for (const k of kaynaklar) {
    if (kalan <= 0n) break;
    let s = binde(k.serbest);
    if (k.kaliteDurumu === 'serbest' && s > hak) s = hak;
    if (s <= 0n) continue;
    const al = s < kalan ? s : kalan;
    alinan.push({ ...k, miktar: al });
    kalan -= al;
    if (k.kaliteDurumu === 'serbest') hak -= al;
  }
  return alinan;
}

// Rezerve sınırı: emir statüdeki toplamdan başka emirlere ayrılanı kullanamaz; istenen bunun üstündeyse kalan kadarı.
export function rezerveSiniri(toplam: bigint, digerlerine: bigint, istenen: bigint): bigint {
  const serbest = toplam - digerlerine;
  if (serbest <= 0n) return 0n;
  return istenen < serbest ? istenen : serbest;
}

// Fason gönderimi eksik gitti mi: istasyonda yeterli parça yoksa olan kadar taşınır (reddedilmez); beklenenden az taşınmışsa eksiktir.
export const fasonGonderimiEksikMi = (beklenen: bigint, tasinan: bigint): boolean => beklenen > 0n && tasinan < beklenen;

// 94 a: eski etiketin QR'ı eski kodu taşır; kodu değişip açık kalan konum yeniden basılır, kapanan konuma etiket gerekmez.
export function koduDegisenler(
  onceki: readonly { id: number; kod: string }[],
  sonraki: readonly { id: number; kod: string; tur: KonumTuru; ad: string | null; bolmeNo: number | null; katNo: number | null; aktif: boolean }[],
): KoduDegisenKonum[] {
  const eski = new Map(onceki.map((k) => [k.id, k.kod]));
  return sonraki.flatMap((k) => {
    const eskiKod = eski.get(k.id);
    return eskiKod === undefined || eskiKod === k.kod || !k.aktif ? []
      : [{ konumId: k.id, eskiKod, yeniKod: k.kod, tur: k.tur, ad: k.ad, bolmeNo: k.bolmeNo, katNo: k.katNo }];
  }).sort((a, b) => a.yeniKod.localeCompare(b.yeniKod, 'tr'));
}

// 147 b: red parça sevke uyarıyla çıkar ve sevk kaydına "red" notu düşer; karar bekleyen parça sevke çıkamaz. Öbür çıkışlarda (sarf, fire,
// numune) karar bekleyen ve red parça uyarıyla düşer (135). Serbest ve şartlıda uyarı yok.
export function cikisKaliteKarari(kalite: KaliteDurumu, cikisNedeni: string): { engel: string } | { uyari: string; not: string | null } | null {
  if (kalite === 'serbest' || kalite === 'sartli') return null;
  if (cikisNedeni === 'sevk') {
    return kalite === 'karar_bekliyor' ? { engel: 'Karar bekleyen parça sevke çıkamaz; kalite kararını bekleyin.' }
      : { uyari: 'Red parça sevke çıktı; sevk kaydına "red" notu düştü.', not: 'Red parça' };
  }
  return { uyari: kalite === 'red' ? 'Red parça düşüldü.' : 'Karar bekleyen parça düşüldü.', not: null };
}
// Denetim #15 (229 a, 147 b): karantinadaki parça depoda yalnız imha edilir; hurdaya taşınır ya da fire nedeniyle çıkar. Serbest bırakma
// Kalite Merkezi'nin kararıyla olur (stok/disari karantinadanBirak). Karantinaya taşıma serbesttir.
export const KARANTINA_ENGELI = 'Karantinadaki parça yalnız hurdaya taşınır ya da fire nedeniyle çıkar; serbest bırakma Kalite Merkezi kararıyla olur.';
export function karantinaEngeli(kaynakTuru: KonumTuru, g: { cikisNedeni: string } | { hedefTuru: KonumTuru }): string | null {
  if (kaynakTuru !== 'karantina') return null;
  return ('cikisNedeni' in g ? g.cikisNedeni === 'fire' : g.hedefTuru === 'hurda') ? null : KARANTINA_ENGELI;
}
// 1205, 1206: fason işinden dönen parça GKK kararına kadar karantinada karar bekliyor durur; konum seçilirse karantina türündedir.
export const FASON_DONUS_KARANTINA = 'Fason dönüşü karantina konumuna girer; GKK kararından sonra çıkar.';
export const KARANTINA_KONUMU_YOK = 'Karantina konumu yok; fason dönüşü için Depo haritasına karantina alanı ekleyin.';
export const fasonDonusKonumuEngeli = (tur: KonumTuru): string | null => (tur === 'karantina' ? null : FASON_DONUS_KARANTINA);
// 1246 (1247 d, 1251): kartı GKK isteyen satın alma lotu karantinaya karar bekliyor girer; konum seçilirse karantina türündedir.
export const GKK_GIRIS_KARANTINA = 'Giriş kalite kontrolü isteyen kart karantina konumuna girer; kalite kararından sonra çıkar.';
export const GKK_KARANTINA_KONUMU_YOK = 'Karantina konumu yok; giriş kalite kontrolü için Depo haritasına karantina alanı ekleyin.';
export const gkkGirisKonumuEngeli = (tur: KonumTuru): string | null => (tur === 'karantina' ? null : GKK_GIRIS_KARANTINA);
// 1246 (VARSAYIM): kalite kararı verilmiş GKK satırının stoğu karantinadan çıkmış ya da red olmuştur; ters hareket onu geri alamaz.
export function girisKontroluDuzeltmeEngeli(satirlar: readonly { miktar: string; bekleyen: string }[]): string | null {
  return satirlar.some((s) => binde(s.bekleyen) < binde(s.miktar))
    ? 'Bu belgede giriş kontrolü kararı verilmiş satır var; düzeltme onu geri alamaz. Farkı Kalite Merkezi ve Stok Merkezi\'nde düzeltin.'
    : null;
}
export function kaliteDegisimiEngeli(kaynak: KaliteDurumu, hedef: KaliteDurumu, mevcut: string, miktar: string): string | null {
  if (kaynak === hedef) return 'Kaynak ve hedef kalite durumu aynı.';
  if (binde(mevcut) < binde(miktar)) return `Bu kalite durumunda yeterli stok yok. Mevcut: ${bindenMetin(binde(mevcut))}.`;
  return null;
}

// ---- Ürün sevki (235 a) -------------------------------------------------------------------------------------------------------------
// Sevkiyat işinin durum değişimi stokta adımlara açılır: yola çıkan iş ürünü müşterinin Yolda konumuna taşır, teslim Yolda'dan çıkış
// yazar; geri dönüşler bunların geri almasıdır. Havuzda ile planlandı stokta aynıdır. Atlanan ara durum (havuzdan teslime) iki adımdır.
export type UrunSevkAdimi = 'yola_cik' | 'teslim' | 'teslim_geri' | 'yola_geri';
const SEVK_SEVIYESI = { havuzda: 0, planlandi: 0, yolda: 1, tamamlandi: 2 } as const;
export function urunSevkAdimlari(onceki: keyof typeof SEVK_SEVIYESI, yeni: keyof typeof SEVK_SEVIYESI): UrunSevkAdimi[] {
  const a = SEVK_SEVIYESI[onceki], b = SEVK_SEVIYESI[yeni];
  const adimlar: UrunSevkAdimi[] = [];
  for (let s = a; s < b; s += 1) adimlar.push(s === 0 ? 'yola_cik' : 'teslim');
  for (let s = a; s > b; s -= 1) adimlar.push(s === 2 ? 'teslim_geri' : 'yola_geri');
  return adimlar;
}

// Sevkiyatın adedi dört haneli ondalıktır (numeric); stok binde tutar. Sondaki sıfırlar atılır, binde sığmayan kesir null'dur.
export function sevkAdediBinde(adet: string): bigint | null {
  const p = /^(\d+)(?:\.(\d+))?$/.exec(adet.trim());
  if (!p) return null;
  const kesir = (p[2] ?? '').replace(/0+$/, '');
  return kesir.length > 3 ? null : binde(kesir === '' ? p[1]! : `${p[1]!}.${kesir}`);
}

// 147 b: karar bekleyen ve karantinadaki parça sevk edilmez; red parça uyarıyla çıkar. 1222 a: açık uygunsuzluğu (NCR) olan parti
// sevk edilmez; red parça serbest ve şartlı bitmeden alınmaz. Bunun dışında bakiyeler verilen sırayla (öncelik çağıranda) tüketilir;
// yolda teslime ayrılan dokunulmaz. Yetmezse eksik, kalite yüzünden ve açık NCR yüzünden alınamayan miktar döner.
export interface SevkBakiyesi { konumId: number; konumTuru: KonumTuru; partiId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; ayrilan: string }
export function sevkKaynaklariSec(
  bakiyeler: readonly SevkBakiyesi[], istenen: bigint, acikNcrPartileri: ReadonlySet<number> = new Set(),
): { secim: (SevkBakiyesi & { alinan: bigint })[]; eksik: bigint; engelli: bigint; ncrEngelli: bigint } {
  const secim: (SevkBakiyesi & { alinan: bigint })[] = [];
  let kalan = istenen, engelli = 0n, ncrEngelli = 0n;
  const sirali = [...bakiyeler.filter((b) => b.kaliteDurumu !== 'red'), ...bakiyeler.filter((b) => b.kaliteDurumu === 'red')];
  for (const b of sirali) {
    const serbest = binde(b.miktar) - binde(b.ayrilan);
    if (serbest <= 0n) continue;
    if (acikNcrPartileri.has(b.partiId)) { ncrEngelli += serbest; continue; }
    if (b.kaliteDurumu === 'karar_bekliyor' || b.konumTuru === 'karantina') { engelli += serbest; continue; }
    if (kalan === 0n) continue;
    const alinan = serbest < kalan ? serbest : kalan;
    secim.push({ ...b, alinan });
    kalan -= alinan;
  }
  return { secim, eksik: kalan, engelli, ncrEngelli };
}

// ---- Kişi kodu (299 b): teslim alacak kişinin gösterdiği, sunucu anahtarıyla imzalı ve kısa süre geçerli kod ------------------
// Biçim KSI-<kişi>-<son>-<imza>; son, geçerliliğin bittiği an (saniye, 36 tabanında). İmzayı servis hesaplar, burada biçim ve süre.
// Süre, gönderenin miktarı yazıp göndermesine yetecek kadardır; ekran kodu süre dolmadan yeniler.
export const KISI_KODU_SURESI_SN = 120;
export const kisiKoduGovdesi = (kisiId: number, sonSn: number): string => `KSI-${kisiId}-${sonSn.toString(36).toUpperCase()}`;
export function kisiKoduAyristir(ham: string): { govde: string; kisiId: number; sonSn: number; imza: string } | null {
  const p = /^KSI-(\d{1,9})-([0-9A-Z]{1,10})-([0-9a-f]{32})$/i.exec(ham.trim());
  if (!p) return null;
  const kisiId = Number(p[1]), sonSn = parseInt(p[2]!, 36);
  return { govde: kisiKoduGovdesi(kisiId, sonSn), kisiId, sonSn, imza: p[3]!.toLowerCase() };
}
export function kisiKoduEngeli(sonSn: number, simdiSn: number, imzaDogru: boolean): string | null {
  if (!imzaDogru || sonSn > simdiSn + KISI_KODU_SURESI_SN) return 'Kişi kodu geçersiz; karşıdakinden ekrandaki kodu yeniden göstermesini isteyin.';
  if (sonSn < simdiSn) return 'Kişi kodunun süresi geçti; karşıdakinden ekrandaki yeni kodu göstermesini isteyin.';
  return null;
}

// DEP-64 (372 a, 373 a): Malzemeler ve Hizmetler'in kendi etiketi QR'a "MK:<stok kodu>" yazar; ortak sözlük bu öneki tanımaz. Stok kodu
// bu önekten çıkarılır, kart no'ya Malzemeler çevirir; önek yoksa ya da gövde boşsa null.
export function katalogEtiketiStokKodu(ham: string): string | null {
  const p = /^\s*MK\s*:\s*(\S+)\s*$/i.exec(ham);
  return p ? p[1]!.toUpperCase() : null;
}

// ---- Refakat partisi (kart #123): emir + depodan verilen lot -------------------------------------------------------------
// Kartın okunur adı emir no ve sıradır (UE-000120-P2); emir no bilinmezse kimlik yazılır, uydurulmaz.
export const refakatEtiketi = (emirNo: string | null, uretimEmriId: number, sira: number): string => `${emirNo ?? `Emir #${uretimEmriId}`}-P${sira}`;
// Kart yalnız depoya mal kabulle girmiş lotla açılır; üretim partisi (emrin çıktısı) kaynak olmaz.
// Tek kart (614 1a): refakat kartı okutulunca tek ana eylem. Okutana kartla yolda gelen teslim varsa önce o alınır; kartın malzemesi
// okutanın kapsamındaki bir istasyonda duruyorsa iş açılır (iş başka istasyondaysa terminal söyler); yoksa malzeme teslim edilir.
export type RefakatAnaEylemi = 'teslim-al' | 'isi-ac' | 'teslim-et';
export function refakatAnaEylemi(k: { gelenSayisi: number; kartAcik: boolean; satirIstasyonlari: readonly (number | null)[]; kapsamdakiIstasyonlar: ReadonlySet<number> }): RefakatAnaEylemi {
  if (k.gelenSayisi > 0) return 'teslim-al';
  if (k.kartAcik && k.satirIstasyonlari.some((i) => i !== null && k.kapsamdakiIstasyonlar.has(i))) return 'isi-ac';
  return 'teslim-et';
}

export function refakatLotEngeli(lot: { uretimEmriId: number | null }): string | null {
  return lot.uretimEmriId !== null ? 'Bu lot bir üretim emrinin çıktısı; refakat kartı depodan verilen lotla açılır.' : null;
}
// Emre giden malzeme kartla gider (615-2 a, 632 a, 633 b): lotlu teslim lotun kartını, lotsuz teslim emrin o malzemedeki lot bekleyen
// (istisna) kartını ister. Kart sessizce açılmaz; depocu tek adımda onaylar. Üretim çıktısı partisi kendi kartını taşır; kapalı emre kart açılmaz.
export type KartOnayiTuru = 'lot' | 'istisna';
export function kartOnayiTuru(g: { uretimEmriId: number | null; partiId: number | null }, lot: { uretimEmriId: number | null } | null, emirDurumu: string | null): KartOnayiTuru | null {
  if (g.uretimEmriId === null || emirDurumu === null || emirDurumu === 'bitti' || emirDurumu === 'iptal') return null;
  if (g.partiId === null) return 'istisna';
  if (lot === null || refakatLotEngeli(lot) !== null) return null;
  return 'lot';
}
// Hiç teslimi ve sayımı olmayan parti iptal edilir; teslim ya da üretim varsa iz bozulmasın diye kalır.
export function refakatIptalEngeli(r: { durum: 'acik' | 'iptal'; verilen: string }, uretildi = false): string | null {
  if (r.durum === 'iptal') return 'Refakat kartı zaten iptal.';
  if (binde(r.verilen) > 0n) return 'Bu kartla teslim yapıldı; kart iptal edilemez.';
  return uretildi ? 'Bu kartla üretim sayıldı; kart iptal edilemez.' : null;
}
// Sayım kartın emrine yazılır (#126); iptal kartla sayım olmaz. Kart yoksa sayım reddedilir (kimlik başka modülden gelir, FK yok).
// Kol (alt parti) üst emrin kartıyla sayamaz; kola üst karttan alt parti kartı açılır.
export function refakatSayimEngeli(r: { durum: 'acik' | 'iptal'; uretimEmriId: number } | null, uretimEmriId: number, ustEmirId: number | null = null): string | null {
  if (r === null) return 'Refakat kartı bulunamadı.';
  if (r.uretimEmriId !== uretimEmriId && r.uretimEmriId === ustEmirId) return 'Bu kart üst partinin; bu alt parti için üst karttan alt parti kartı açın.';
  if (r.uretimEmriId !== uretimEmriId) return 'Bu refakat kartı başka bir emrin; işin kartını okutun.';
  return r.durum === 'iptal' ? 'Refakat kartı iptal edilmiş; geçerli kartı okutun.' : null;
}
// Alt parti kartı üst karttan açılır: emir üst kartın emrinden bölünmüş, açık bir kol olmalı; üst kart açık ve birleşmemiş olmalı.
export function refakatKolEngeli(
  ust: { durum: 'acik' | 'iptal'; uretimEmriId: number; birlestigiRefakatPartisiId: number | null },
  kol: { ustEmirId: number | null; durum: string; emirNo: string },
): string | null {
  if (ust.durum === 'iptal') return 'Üst refakat kartı iptal edilmiş.';
  if (ust.birlestigiRefakatPartisiId !== null) return 'Üst refakat kartı başka karta birleşti; birleştiği kartı okutun.';
  if (kol.ustEmirId !== ust.uretimEmriId) return `Emir ${kol.emirNo} bu kartın emrinden bölünmüş bir alt parti değil.`;
  if (kol.durum === 'bitti' || kol.durum === 'iptal') return `Emir ${kol.emirNo} ${kol.durum === 'bitti' ? 'bitti' : 'iptal edildi'}; kart açılmaz.`;
  return null;
}
// Kartla teslimde malzeme, lot ve emir karttan gelir; gövdede verilen farklıysa teslim reddedilir (yanlış kart ya da yanlış satır).
export function refakatTeslimEngeli(
  r: { durum: 'acik' | 'iptal'; malzemeId: number; partiId: number | null; uretimEmriId: number },
  g: { malzemeId: number; partiId: number | null | undefined; uretimEmriId: number | null | undefined },
): string | null {
  if (r.durum === 'iptal') return 'Refakat kartı iptal edilmiş; geçerli kartı okutun.';
  if (r.partiId === null) return 'Bu kart lot bekliyor; kartla teslimden önce depo kartı lota bağlar.';
  if (g.malzemeId !== r.malzemeId) return 'Malzeme refakat kartındakiyle aynı değil.';
  if (g.partiId !== undefined && g.partiId !== null && g.partiId !== r.partiId) return 'Lot refakat kartındakiyle aynı değil.';
  if (g.uretimEmriId !== undefined && g.uretimEmriId !== null && g.uretimEmriId !== r.uretimEmriId) return 'Emir refakat kartındakiyle aynı değil.';
  return null;
}

// İstisna kartı (Soru 129, 131 a): yalnız açık, birleşmemiş, lotsuz kart bağlanır; lot mal kabulle girmiş ve kartın malzemesinden olmalı.
// Sürüm, kartı başka biri bu arada bağladıysa ikinci bağlamayı durdurur.
export function refakatBaglamaEngeli(
  r: { durum: 'acik' | 'iptal'; partiId: number | null; malzemeId: number; birlestigiRefakatPartisiId: number | null; surum: number },
  lot: { uretimEmriId: number | null; malzemeId: number }, surum: number,
): string | null {
  if (r.durum === 'iptal') return 'Refakat kartı iptal edilmiş.';
  if (r.birlestigiRefakatPartisiId !== null) return 'Kart başka karta birleşti; birleştiği kartı açın.';
  if (r.partiId !== null) return 'Bu kartın lotu var; yalnız lot bekleyen kart bağlanır.';
  if (r.surum !== surum) return 'Kart bu sırada değişti; listeyi yenileyip yeniden deneyin.';
  if (lot.uretimEmriId !== null) return 'Bu lot bir üretim emrinin çıktısı; kart depodan verilen lota bağlanır.';
  if (lot.malzemeId !== r.malzemeId) return 'Lot kartın malzemesinden değil.';
  return null;
}

// Yolda süresi (Soru 133, ayar `stok.yolda-suresi-dk`): süre boşsa teslim kendiliğinden düşmez. Döner: sürenin bittiği an ya da null.
export function yoldaSureSonu(gonderim: string, dakika: number | null): string | null {
  if (dakika === null || dakika <= 0) return null;
  return new Date(Date.parse(gonderim) + dakika * 60_000).toISOString();
}


// ---- Malzeme fişi (293 a, 294 c; kart #492) -------------------------------------------------------------------------------------------
// Hareketin fişi: emirli sarf, fire ve üretim girişi emrin fişine; sayım farkı komutun sayım fişine; depolar arası taşıma (iki deponun Logo
// ambarı tanımlı ve farklıysa, sorguda bakılır) komutun ambar fişine; geri alma geri aldığı hareketin fişine. Diğer hareketin fişi yok.
export type HareketFisBagi =
  | { tur: 'sarf' | 'uretim_girisi' | 'fire'; uretimEmriId: number }
  | { tur: 'sayim_fazlasi' | 'sayim_eksigi' }
  | { tur: 'ambar_adayi' }
  | { tur: 'geri_alma' }
  | null;
// Hareket fişinin türü (1385 a): sayım fazlası ve eksiği tek sayım fişindedir; geri alma kendi fişindedir.
export type HareketFisiTuru = 'giris' | 'cikis' | 'transfer' | 'sayim' | 'geri_alma';
export function hareketFisiTuru(tur: string): HareketFisiTuru {
  if (tur === 'giris' || tur === 'cikis' || tur === 'transfer' || tur === 'geri_alma') return tur;
  if (tur === 'sayim_fazla' || tur === 'sayim_eksik') return 'sayim';
  throw new Error(`Bilinmeyen hareket türü: ${tur}`);
}
export function hareketinFisBagi(h: { tur: string; cikisNedeni: string | null; girisKaynagi: string | null; uretimEmriId: number | null }): HareketFisBagi {
  if (h.tur === 'geri_alma') return { tur: 'geri_alma' };
  if (h.tur === 'sayim_fazla') return { tur: 'sayim_fazlasi' };
  if (h.tur === 'sayim_eksik') return { tur: 'sayim_eksigi' };
  if (h.tur === 'transfer') return { tur: 'ambar_adayi' };
  if (h.uretimEmriId === null) return null;
  if (h.tur === 'giris' && h.girisKaynagi === 'uretim') return { tur: 'uretim_girisi', uretimEmriId: h.uretimEmriId };
  if (h.tur === 'cikis' && h.cikisNedeni === 'uretime_sarf') return { tur: 'sarf', uretimEmriId: h.uretimEmriId };
  if (h.tur === 'cikis' && h.cikisNedeni === 'fire') return { tur: 'fire', uretimEmriId: h.uretimEmriId };
  return null;
}

// Emir fişinin numarası emir numarasıdır (üç türde aynı; Logo türleri ayrı numaralar). Sayım ve ambar fişi önek ve kimlikle numaralanır
// (VARSAYIM: Logo fiş numarası en çok 16 karakter, bu biçim sığar). Emir numarası okunamazsa emir kimliği yazılır, numara uydurulmaz.
const FIS_ONEKLERI = { sayim_fazlasi: 'SF', sayim_eksigi: 'SE', ambar: 'AF' } as const;
export function malzemeFisiNo(f: { id: number; tur: MalzemeFisiTuru; uretimEmriId: number | null }, emirNo: string | null): string {
  if (f.tur === 'sarf' || f.tur === 'uretim_girisi' || f.tur === 'fire') return emirNo ?? `#${f.uretimEmriId ?? f.id}`;
  return `${FIS_ONEKLERI[f.tur]}-${String(f.id).padStart(6, '0')}`;
}
// Fiş numarası aramada kimliğe çözülür; biçime uymayan metin null. MK- mal kabul belgesidir (listede görünür, 515 a).
export function fisNoKimligi(metin: string): { tur: 'sayim_fazlasi' | 'sayim_eksigi' | 'ambar' | 'mal_kabul'; id: number } | null {
  const m = /^(SF|SE|AF|MK)-0*(\d{1,9})$/i.exec(metin.trim());
  if (!m) return null;
  const onek = m[1]!.toUpperCase();
  const tur = onek === 'SF' ? 'sayim_fazlasi' : onek === 'SE' ? 'sayim_eksigi' : onek === 'MK' ? 'mal_kabul' : 'ambar';
  const id = Number(m[2]);
  return id >= 1 && id <= 2147483647 ? { tur, id } : null;
}

// Gönder düğmesi (295 a): elle türde gönderim bekleyen ya da hatalı fiş; satırı yoksa yalnız Logo'da duran fiş (silinmesi için).
// Logo modülü bağlı değilse ya da tür kapalıysa gönderilemez.
export function malzemeFisiGonderilebilir(logo: { durum: LogoFisDurumu; gonderimSekli: FisGonderimSekli | null; kayitNo: string | null }, satirVar: boolean): boolean {
  if (logo.gonderimSekli === null || logo.gonderimSekli === 'kapali' || logo.durum === 'bilinmiyor') return false;
  if (!satirVar && logo.kayitNo === null) return false;
  if (logo.durum === 'hata') return true;
  return logo.gonderimSekli === 'elle' && logo.durum === 'bekliyor';
}

// ---- Onaylı kapanış maddeleri (1074 a): stok, izlenebilirlik ve "stoğa işlendi" maddelerinin durumunu verir -------------------
// İzlenebilirlik: emrin iptal olmayan her refakat kartında lot ve sertifika no dolu. Kartı olmayan emir stoklu malzeme istiyorsa
// eksiktir; reçetesinde stoklu malzeme yoksa madde gerekmez.
export function kapanisIzlenebilirligi(kartlar: readonly { lotNo: string | null; sertifikaNo: string | null }[], stokluIhtiyacVar: boolean): KapanisMaddeBilgisi {
  if (kartlar.length === 0) return stokluIhtiyacVar ? { durum: 'eksik', ayrinti: 'Refakat kartı yok' } : { durum: 'gerekmez', ayrinti: 'Stoklu malzeme yok' };
  const lotsuz = kartlar.filter((k) => k.lotNo === null).length;
  const sertifikasiz = kartlar.filter((k) => k.lotNo !== null && k.sertifikaNo === null).length;
  if (lotsuz === 0 && sertifikasiz === 0) return { durum: 'tamam', ayrinti: `${kartlar.length} refakat kartında lot ve sertifika no dolu` };
  const eksikler = [...(lotsuz > 0 ? [`lot bekleyen kart: ${lotsuz}`] : []), ...(sertifikasiz > 0 ? [`sertifika no yok: ${sertifikasiz}`] : [])];
  return { durum: 'eksik', ayrinti: `${eksikler.join(', ')} (toplam ${kartlar.length} kart)` };
}
// Stoğa işlendi: emrin ürünü sağlam adedi kadar üretim girişiyle girdi, kalan sarf yok (stokta tamamlamanın "zaten tamamlandı"
// hesabı) ve emrin eksiden düştüğü istasyon satırı kapanmış (1214 O-5: teslim edilmeden sayılan parça girişi tamamlar ama istasyonda
// eksi bırakır). Sağlamsız emirde (1079 a) madde gerekmez. Bitmemiş emirde hedef emrin adedidir. Miktarlar binde.
export interface IstasyonEksisi { malzeme: string; konum: string; miktar: bigint; statulu: boolean; karsiliklar: readonly { konum: string; miktar: bigint }[] }
// K-1 a: kalan sarf maddesi yoktur (tüketim fiilidir). K-2 a (1386): istasyonda emre ait artı bakiye kalmışsa madde eksiktir; bakiye depoya
// taşıma ya da fire çıkışıyla (ikisi de fişli) kapatılır. Sağlamsız emirde giriş gerekmez ama istasyonda kalan bakiye yine kapatılır.
export interface IstasyonArtisi { malzeme: string; konum: string; miktar: bigint; statulu: boolean }
export function kapanisStoguIslendi(g: {
  adet: number; saglamAdet: number | null; girilen: bigint; istasyonEksileri: readonly IstasyonEksisi[]; istasyonArtilari: readonly IstasyonArtisi[];
}): KapanisMaddeBilgisi {
  const artilar = g.istasyonArtilari.length === 0 ? [] : [`istasyonda kalan: ${g.istasyonArtilari.map((x) => `${x.konum} ${x.malzeme} ${bindenMetin(x.miktar)}${x.statulu ? ' (statülü)' : ''}`).join(', ')} (depoya taşıyın ya da fire çıkışı yapın)`];
  if (g.saglamAdet === 0) return artilar.length === 0 ? { durum: 'gerekmez', ayrinti: 'Sağlam parça yok' } : { durum: 'eksik', ayrinti: ['Sağlam parça yok', ...artilar].join('; ') };
  const hedef = BigInt(g.saglamAdet ?? g.adet) * 1000n;
  const giris = `${bindenMetin(g.girilen)} / ${bindenMetin(hedef)} stoğa girdi`;
  if (g.girilen >= hedef && g.istasyonEksileri.length === 0 && artilar.length === 0) return { durum: 'tamam', ayrinti: giris };
  const eksi = (x: IstasyonEksisi): string => {
    const yer = x.karsiliklar.length === 0 ? '' : `; aynı statüde ${x.karsiliklar.map((k) => `${k.konum}: ${bindenMetin(k.miktar)}`).join(', ')}`;
    return `${x.konum} ${x.malzeme} ${bindenMetin(x.miktar)}${x.statulu ? ` (statülü${yer})` : ''}`;
  };
  return { durum: 'eksik', ayrinti: [
    giris,
    ...(g.istasyonEksileri.length > 0 ? [`istasyonda eksi: ${g.istasyonEksileri.map(eksi).join(', ')}`] : []),
    ...artilar,
  ].join('; ') };
}

// Sayım düşünce geri çevrilen parçanın kalitesi (1214 O-1): parça ileri çevrilirken sayımın kalitesini almış olabilir (138 a); geri
// dönen, ileri çevirmenin kaynak kalitesine döner. İleri çevirmeler en yenisi önce gelir; daha önce geri çevrilen kadarı en yenilerden
// düşülür (geri çevirme en yeniden başlar). Kaydı yetmeyen kısım (eski kayıt) varsayılan kaliteyle döner. Miktarlar binde.
export function geriCevirmeKaliteleri(
  ileri: readonly { miktar: bigint; kaynakKalite: KaliteDurumu }[], geriCevrilen: bigint, istenen: bigint, varsayilan: KaliteDurumu,
): { kalite: KaliteDurumu; miktar: bigint }[] {
  const sonuc: { kalite: KaliteDurumu; miktar: bigint }[] = [];
  const ekle = (kalite: KaliteDurumu, miktar: bigint) => {
    const son = sonuc.at(-1);
    if (son?.kalite === kalite) son.miktar += miktar;
    else sonuc.push({ kalite, miktar });
  };
  let atla = geriCevrilen, kalan = istenen;
  for (const h of ileri) {
    if (kalan <= 0n) break;
    let m = h.miktar;
    if (atla > 0n) { const d = atla < m ? atla : m; atla -= d; m -= d; }
    if (m <= 0n) continue;
    const al = m < kalan ? m : kalan;
    ekle(h.kaynakKalite, al);
    kalan -= al;
  }
  if (kalan > 0n) ekle(varsayilan, kalan);
  return sonuc;
}

// Eksiden çevirme ve düşüm uyarısı (1214 D-1, D-7): ilk adımda eksik olan hammaddedir, sonraki adımda önceki adımın parçası. İstasyondaki
// girdi başka emre ayrılı olduğu için kullanılamadıysa (rezerve konumdan bağımsızdır) bu söylenir; yoksa teslim istenir. Miktarlar binde.
export function eksidenUyari(g: { ilkAdim: boolean; eksik: bigint; baskaEmreAyrili: bigint; fiil: 'çevrildi' | 'düşüldü' }): string {
  const ne = g.ilkAdim ? 'Hammadde' : 'Önceki adımın parçası';
  const neyi = g.ilkAdim ? 'Hammaddeyi' : 'Parçayı';
  const eksiden = g.fiil === 'çevrildi' ? 'eksiden çevrildi' : 'eksiye düşüldü';
  if (g.baskaEmreAyrili > 0n) {
    return `${ne} bu istasyonda başka emre ayrılı (${bindenMetin(g.baskaEmreAyrili)}); ${bindenMetin(g.eksik)} ${eksiden}. Rezerveyi müdür kaldırır ya da bu emir için ${ne.toLocaleLowerCase('tr')} teslim ettirin.`;
  }
  return `${ne} bu istasyonda yok; ${bindenMetin(g.eksik)} ${eksiden}. ${neyi} bu istasyona teslim ettirin.`;
}
