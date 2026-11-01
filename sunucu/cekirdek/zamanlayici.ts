import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { vtHataIzi } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { gunlukKur } from './gunluk.ts';
import type { Gunluk, HamGunluk } from './gunluk.ts';
import { UygulamaHatasi } from './hata.ts';

export const IS_ADI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EN_KISA_ARALIK_MS = 1000;
export const NEDEN_EN_UZUN = 200;
const MODUL_KLASORU = join(import.meta.dirname, '..', 'moduller');

export type IsCalisi = (db: Db, gunluk: Gunluk) => Promise<void | IsBekliyor>;
export type TxDisiIs = (vt: Veritabani, gunluk: Gunluk) => Promise<void | IsBekliyor>;

// İş iki biçimden tam birini taşır; isTanimi denetler.
export interface IsTanimi {
  readonly ad: string;
  readonly aralikMs: number;
  // İşin yazdığı her satır kendi tablosunda zamanı ve sonucuyla iz bırakır: iş istek değildir, uç denetimi ona uygulanmaz.
  // İş koşamayacağını biliyorsa (ayar kapalı, bağlantı bilgisi yok) hata atmaz, isBekliyor(neden) döner. Yakalayıp sürdürdüğü
  // hatayı günlüğe yazar; satır işin adını taşır.
  // Tur tek transaction'dır: iş hata atarsa bütün yazıları geri alınır.
  readonly calis?: IsCalisi;
  // Tur transaction dışında koşar: iş kendi kısa transaction'larını vt.tx ile açar, dış servisi transaction dışında bekler.
  // Hata atan işin önceki transaction'larda yazdıkları kalır. Veritabanının oturumda yöntemi gerekir; tur kilit için bir
  // bağlantıyı tur boyunca tutar, işin transaction'ı ikinci bir bağlantı alır.
  readonly txDisi?: TxDisiIs;
}

export interface IsBekliyor {
  readonly durum: 'bekliyor';
  readonly neden: string;
}

// Neden yöneticiye sağlık ayrıntısında görünür: modülün yazdığı sabit metindir, satır değeri taşımaz.
export function isBekliyor(neden: string): IsBekliyor {
  const temiz = neden.trim();
  if (temiz === '' || temiz.length > NEDEN_EN_UZUN) throw new Error(`Bekleme nedeni 1-${NEDEN_EN_UZUN} karakter olur`);
  return Object.freeze({ durum: 'bekliyor', neden: temiz });
}

const bekliyorMu = (deger: unknown): deger is IsBekliyor =>
  typeof deger === 'object' && deger !== null && (deger as IsBekliyor).durum === 'bekliyor' && typeof (deger as IsBekliyor).neden === 'string';

export type IsSonucu = 'tamam' | 'hata' | 'atlandi' | 'bekliyor';

export interface IsDurumu {
  ad: string;
  aralikMs: number;
  sonBaslama: Date | null;
  sonBitis: Date | null;
  sonSonuc: IsSonucu | null;
  // Yalnız son tur hata verdiyse dolu; ham ileti satır değeri taşıyabilir, özet yalnız türü ve kodu söyler.
  sonHata: string | null;
  // Yalnız son tur beklemede döndüyse dolu.
  sonNeden: string | null;
  // Hata vermeden (tamam ya da bekliyor) biten son tur; sağlık uyarısı işin asılıp asılmadığını buna bakarak söyler.
  sonSaglikliBitis: Date | null;
}

export type IsGunlugu = HamGunluk;

// Yalnız testin tek turu içindir; günlüğü verilmezse işin yazdıkları atılır.
const SESSIZ: HamGunluk = { warn: () => undefined, error: () => undefined };

export interface Zamanlayici {
  baslat(): void;
  // Yeni tur kurulmaz; süren turlar en çok beklemeMs beklenir.
  durdur(beklemeMs: number): Promise<void>;
  durumlar(): IsDurumu[];
}

// Keşif yalnız bu işlevden geçmiş tanımı kabul eder: denetimsiz düz nesne işe dönüşmez.
const tanimlar = new WeakSet<IsTanimi>();

export function isTanimi(tanim: IsTanimi): IsTanimi {
  if (!IS_ADI.test(tanim.ad)) throw new Error(`İş adı küçük harf, rakam ve tireden oluşur: "${tanim.ad}"`);
  if (!Number.isInteger(tanim.aralikMs) || tanim.aralikMs < EN_KISA_ARALIK_MS) {
    throw new Error(`İş aralığı en az ${EN_KISA_ARALIK_MS} ms tam sayıdır: ${tanim.ad}`);
  }
  const { calis, txDisi } = tanim;
  if (calis !== undefined && txDisi !== undefined) throw new Error(`İş calis ve txDisi işlevlerinden yalnız birini taşır: ${tanim.ad}`);
  let donmus: IsTanimi;
  if (txDisi !== undefined) {
    if (typeof txDisi !== 'function') throw new Error(`İşin txDisi işlevi yok: ${tanim.ad}`);
    donmus = Object.freeze({ ad: tanim.ad, aralikMs: tanim.aralikMs, txDisi });
  } else {
    if (typeof calis !== 'function') throw new Error(`İşin calis ya da txDisi işlevi yok: ${tanim.ad}`);
    donmus = Object.freeze({ ad: tanim.ad, aralikMs: tanim.aralikMs, calis });
  }
  tanimlar.add(donmus);
  return donmus;
}

function adlariDenetle(isler: readonly IsTanimi[]): void {
  const gorulen = new Set<string>();
  for (const is of isler) {
    if (!tanimlar.has(is)) throw new Error('İş isTanimi ile tanımlanmalı');
    if (gorulen.has(is.ad)) throw new Error(`İş adı yineleniyor: ${is.ad}`);
    gorulen.add(is.ad);
  }
}

// Uç keşfiyle aynı kalıp: çekirdek modülü ithal etmez, klasörden bulur. Bozuk dosya açılışı durdurur.
export async function modulIsleriniKesfet(klasor: string = MODUL_KLASORU): Promise<IsTanimi[]> {
  if (!existsSync(klasor)) return [];
  const girdiler = await readdir(klasor, { withFileTypes: true });
  const adlar = girdiler.filter((g) => g.isDirectory()).map((g) => g.name).sort();
  const sonuc: IsTanimi[] = [];
  for (const ad of adlar) {
    const dosya = join(klasor, ad, 'isler.ts');
    if (!existsSync(dosya)) continue;
    const modul = (await import(pathToFileURL(dosya).href)) as { isler?: unknown };
    if (!Array.isArray(modul.isler)) {
      throw new Error(`Modül iş dizisi vermiyor (export const isler): moduller/${ad}/isler.ts`);
    }
    sonuc.push(...(modul.isler as IsTanimi[]));
  }
  adlariDenetle(sonuc);
  return sonuc;
}

// Kilit anahtarına şema katılır: aynı veritabanındaki başka şema (paralel test koşusu) bu şemanın işini atlatmasın.
// İki süreç aynı veritabanına bağlansa da bir iş aynı anda tek koşar; kilit beklenmez, tur atlanır.
export async function isiBirKezCalistir(
  vt: Veritabani, tanim: IsTanimi, gunluk: HamGunluk = SESSIZ,
): Promise<'tamam' | 'atlandi' | 'bekliyor'> {
  return (await turKos(vt, tanim, gunluk)).sonuc;
}

type TurSonucu = { sonuc: 'tamam' | 'atlandi' } | { sonuc: 'bekliyor'; neden: string };

const KILIT_ANAHTARI = "hashtext(coalesce(current_schema(), '') || ':is-' || $1)";
export const OTURUMSUZ_VERITABANI = 'txDisi iş için veritabanının oturumda yöntemi gerekir';

// isBekliyor'dan geçmemiş dönüş değeri de neden olarak kabul edilmez: biçimi bozuksa tur hatadır.
function donusuYorumla(tanim: IsTanimi, donen: void | IsBekliyor): TurSonucu {
  if (donen === undefined) return { sonuc: 'tamam' };
  if (!bekliyorMu(donen)) throw new Error(`İş tanımsız değer döndü: ${tanim.ad}`);
  return { sonuc: 'bekliyor', neden: isBekliyor(donen.neden).neden };
}

async function turKos(vt: Veritabani, tanim: IsTanimi, gunluk: HamGunluk): Promise<TurSonucu> {
  const isGunlugu = gunlukKur(gunluk, { is: tanim.ad });
  const { calis, txDisi } = tanim;
  if (txDisi !== undefined) {
    if (vt.oturumda === undefined) throw new Error(`${OTURUMSUZ_VERITABANI}: ${tanim.ad}`);
    // Kilit oturum düzeyindedir ve tur boyunca ödünç alınan tek bağlantıda durur; o bağlantıda transaction açılmaz.
    // Tur hata verirse çekirdek bağlantıyı havuza döndürmez, kapatır: kilit sunucuda oturumla birlikte düşer.
    return vt.oturumda(async (kilitDb) => {
      const kilit = await kilitDb.tek<{ alindi: boolean }>(`SELECT pg_try_advisory_lock(${KILIT_ANAHTARI}) AS alindi`, [tanim.ad]);
      if (kilit?.alindi !== true) return { sonuc: 'atlandi' };
      let donen: void | IsBekliyor;
      try {
        donen = await txDisi(vt, isGunlugu);
      } catch (hata) {
        // Bırakılamazsa da asıl hata örtülmez: bağlantı kapanınca kilit yine düşer.
        await kilitDb.sorgu(`SELECT pg_advisory_unlock(${KILIT_ANAHTARI})`, [tanim.ad]).catch(() => undefined);
        throw hata;
      }
      const birakma = await kilitDb.tek<{ birakildi: boolean }>(`SELECT pg_advisory_unlock(${KILIT_ANAHTARI}) AS birakildi`, [tanim.ad]);
      if (birakma?.birakildi !== true) throw new Error(`İş kilidi bırakılamadı: ${tanim.ad}`);
      return donusuYorumla(tanim, donen);
    });
  }
  if (calis === undefined) throw new Error(`İşin calis ya da txDisi işlevi yok: ${tanim.ad}`);
  return vt.tx(async (db) => {
    const kilit = await db.tek<{ alindi: boolean }>(`SELECT pg_try_advisory_xact_lock(${KILIT_ANAHTARI}) AS alindi`, [tanim.ad]);
    if (kilit?.alindi !== true) return { sonuc: 'atlandi' };
    return donusuYorumla(tanim, await calis(db, isGunlugu));
  });
}

export function hataOzeti(hata: unknown): string {
  const iz = vtHataIzi(hata);
  if (iz) return `Veritabanı hatası ${iz.code ?? '?'}${iz.constraint ? ` (kısıt: ${iz.constraint})` : ''}`;
  if (hata instanceof UygulamaHatasi) return `Uygulama hatası ${hata.kod}`;
  return hata instanceof Error ? `Beklenmeyen hata (${hata.name})` : 'Beklenmeyen hata';
}

// Zamanlanmış işler uygulamanın havuzunu paylaşmaz (1750): yük altında isteklerin sırası dolunca işler de MESGUL alıyordu.
// Boyut iş sayısı + 1: her işin aynı anda en çok bir turu koşar ve txDisi turu kilit için bir oturum bağlantısını tur boyunca
// tutup sorgularını ikinci bir bağlantıdan yapar. Bütün işler aynı anda oturum tutsa da en az bir bağlantı boş kalır; sorgular
// sırayla ondan geçer ve hiçbir tur ötekini beklerken kilitlenmez. İş sayısı kadar havuzda bu boş bağlantı yoktur.
export function isHavuzuBoyutu(isler: readonly IsTanimi[]): number {
  return isler.length + 1;
}

let etkin: Zamanlayici | null = null;

// Sağlık ayrıntısı için: süreçte başlatılmış zamanlayıcı yoksa (test, açılış) liste boştur.
export function isDurumlari(): IsDurumu[] {
  return etkin?.durumlar() ?? [];
}

export interface ZamanlayiciSecenegi {
  vt: Veritabani;
  gunluk: IsGunlugu;
  isler: readonly IsTanimi[];
  // Açıksa her turun sonucu zamanlanmis_is_durumu tablosuna yazılır ve açılışta oradan okunur: yeniden açılış durumu
  // sıfırlamaz. Testler göçsüz şemada koştuğu için varsayılan kapalıdır; sunucu açar.
  kalici?: boolean;
}

interface DurumSatiri {
  ad: string; son_baslama: Date; son_bitis: Date; son_sonuc: 'tamam' | 'hata' | 'bekliyor';
  son_hata: string | null; son_neden: string | null; son_saglikli_bitis: Date | null;
}

async function durumlariOku(vt: Veritabani, adlar: readonly string[]): Promise<DurumSatiri[]> {
  return vt.sorgu<DurumSatiri>(
    `SELECT ad, son_baslama, son_bitis, son_sonuc, son_hata, son_neden, son_saglikli_bitis
       FROM zamanlanmis_is_durumu WHERE ad = ANY($1::text[])`,
    [adlar],
  );
}

// Atlanan tur yazılmaz: işi o tur başka süreç koşmuştur, durumunu o yazar.
async function durumuYaz(vt: Veritabani, k: IsDurumu): Promise<void> {
  await vt.tx((db) => db.sorgu(
    `INSERT INTO zamanlanmis_is_durumu (ad, son_baslama, son_bitis, son_sonuc, son_hata, son_neden, son_saglikli_bitis)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (ad) DO UPDATE SET son_baslama = EXCLUDED.son_baslama, son_bitis = EXCLUDED.son_bitis,
       son_sonuc = EXCLUDED.son_sonuc, son_hata = EXCLUDED.son_hata, son_neden = EXCLUDED.son_neden,
       son_saglikli_bitis = COALESCE(EXCLUDED.son_saglikli_bitis, zamanlanmis_is_durumu.son_saglikli_bitis)`,
    [k.ad, k.sonBaslama, k.sonBitis, k.sonSonuc, k.sonHata, k.sonNeden, k.sonSonuc === 'hata' ? null : k.sonBitis],
  ));
}

export function zamanlayiciKur({ vt, gunluk, isler, kalici = false }: ZamanlayiciSecenegi): Zamanlayici {
  adlariDenetle(isler);
  const durum = new Map<string, IsDurumu>(
    isler.map((is) => [is.ad, {
      ad: is.ad, aralikMs: is.aralikMs, sonBaslama: null, sonBitis: null, sonSonuc: null, sonHata: null, sonNeden: null, sonSaglikliBitis: null,
    }]),
  );
  const uyar = (ileti: string, hata?: unknown): void => {
    try {
      gunluk.warn(hata === undefined ? {} : { err: vtHataIzi(hata) ?? hata }, ileti);
    } catch {
      // Günlüğe yazılamaması işi durdurmaz.
    }
  };

  // Açılıştan önceki son tur yalnız henüz tur koşmamış işin durumunu doldurur: bu süreçteki tur her zaman daha yenidir.
  const yukle = async (): Promise<void> => {
    try {
      for (const s of await durumlariOku(vt, [...durum.keys()])) {
        const kayit = durum.get(s.ad);
        if (!kayit || kayit.sonBitis !== null) continue;
        Object.assign(kayit, {
          sonBaslama: s.son_baslama, sonBitis: s.son_bitis, sonSonuc: s.son_sonuc, sonHata: s.son_hata, sonNeden: s.son_neden,
          sonSaglikliBitis: s.son_saglikli_bitis,
        });
      }
    } catch (hata) {
      uyar('İş durumu tablosu okunamadı; durumlar ilk turla dolacak', hata);
    }
  };
  const saatler = new Map<string, NodeJS.Timeout>();
  const surenler = new Set<Promise<void>>();
  let basladi = false;
  let durdu = false;

  const kur = (is: IsTanimi): void => {
    if (durdu) return;
    const saat = setTimeout(() => {
      saatler.delete(is.ad);
      const tur = turCalistir(is).finally(() => { surenler.delete(tur); kur(is); });
      surenler.add(tur);
    }, is.aralikMs);
    saat.unref();
    saatler.set(is.ad, saat);
  };

  // Tur hatası süreci düşürmez: günlüğe ve duruma yazılır, sonraki tur yine kurulur.
  const turCalistir = async (is: IsTanimi): Promise<void> => {
    const kayit = durum.get(is.ad);
    if (!kayit) return;
    kayit.sonBaslama = new Date();
    try {
      const tur = await turKos(vt, is, gunluk);
      // Atlanan tur işin durumunu bilmez: önceki beklemenin nedeni korunur, yeniden günlüğe yazılmaz.
      if (tur.sonuc === 'bekliyor') {
        // Bekleme her turda tekrar eder; günlüğe yalnız bekleme başlayınca ya da nedeni değişince yazılır.
        if (kayit.sonNeden !== tur.neden) {
          try {
            gunluk.warn({ is: is.ad }, `Zamanlanmış iş bekliyor: ${is.ad}: ${tur.neden}`);
          } catch {
            // Günlüğe yazılamaması işi durdurmaz.
          }
        }
        kayit.sonNeden = tur.neden;
      } else if (tur.sonuc === 'tamam') {
        kayit.sonNeden = null;
      }
      kayit.sonSonuc = tur.sonuc;
      kayit.sonHata = null;
    } catch (hata) {
      kayit.sonSonuc = 'hata';
      kayit.sonNeden = null;
      kayit.sonHata = hataOzeti(hata);
      try {
        gunluk.error({ err: vtHataIzi(hata) ?? hata }, `Zamanlanmış iş hatası: ${is.ad}`);
      } catch {
        // Günlüğe yazılamaması işi durdurmaz.
      }
    }
    kayit.sonBitis = new Date();
    if (kayit.sonSonuc === 'tamam' || kayit.sonSonuc === 'bekliyor') kayit.sonSaglikliBitis = kayit.sonBitis;
    if (kalici && kayit.sonSonuc !== 'atlandi') {
      try {
        await durumuYaz(vt, kayit);
      } catch (hata) {
        uyar(`İş durumu tabloya yazılamadı: ${is.ad}`, hata);
      }
    }
  };

  const zamanlayici: Zamanlayici = {
    baslat() {
      if (basladi) throw new Error('Zamanlayıcı bir kez başlatılır');
      if (etkin) throw new Error('Süreçte başka bir zamanlayıcı çalışıyor');
      basladi = true;
      etkin = zamanlayici;
      if (kalici) void yukle();
      for (const is of isler) kur(is);
    },
    async durdur(beklemeMs) {
      durdu = true;
      for (const saat of saatler.values()) clearTimeout(saat);
      saatler.clear();
      if (etkin === zamanlayici) etkin = null;
      let sure: NodeJS.Timeout | undefined;
      const doldu = new Promise<void>((coz) => { sure = setTimeout(coz, beklemeMs); });
      try {
        await Promise.race([Promise.allSettled([...surenler]), doldu]);
      } finally {
        clearTimeout(sure);
      }
    },
    durumlar() {
      return [...durum.values()].map((k) => ({ ...k }));
    },
  };
  return zamanlayici;
}
