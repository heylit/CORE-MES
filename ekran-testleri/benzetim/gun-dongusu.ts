import { altTohum, rastgeleUret } from './tohum.ts';
import type { KosuKaydi } from './kayit.ts';
import type { AdimCiktisi, AdimSecenegi, RolIstemcisi, Senaryo, SenaryoBaglami } from './senaryo.ts';
import type { Hesap } from '../hesaplar.ts';

export interface DonguAcilisi {
  kayit: KosuKaydi;
  senaryolar: readonly Senaryo[];
  istemci: (hesap: Hesap) => RolIstemcisi;
  tohum: number;
  gunSayisi: number;
  esZamanli: number;
  gunSonu?: (gun: number) => Promise<void>;
  saat?: () => number;
}

const kisalt = (d: unknown): string => {
  const metin = typeof d === 'string' ? d : JSON.stringify(d) ?? String(d);
  return metin.length > 400 ? `${metin.slice(0, 400)}...` : metin;
};

// Aynı anda en çok `sinir` iş: eşzamanlı kullanıcı sayısı sunucuyu değil senaryoyu sınar.
export async function sinirli<T>(isler: readonly (() => Promise<T>)[], sinir: number): Promise<T[]> {
  const sonuc: T[] = new Array<T>(isler.length);
  let sira = 0;
  const isci = async (): Promise<void> => {
    while (sira < isler.length) {
      const i = sira++;
      sonuc[i] = await (isler[i] as () => Promise<T>)();
    }
  };
  await Promise.all(Array.from({ length: Math.min(sinir, isler.length) }, isci));
  return sonuc;
}

function baglamKur(a: DonguAcilisi, s: Senaryo, gun: number, kopya: number): SenaryoBaglami {
  const saat = a.saat ?? Date.now;
  const kaydet = (rol: Hesap, ad: string, tur: NonNullable<AdimSecenegi['tur']>, sonuc: 'gecti' | 'dustu' | 'ara-sira' | 'baglanmamis', sureMs: number, c: AdimCiktisi): void => {
    a.kayit.adim({
      gun, rol, senaryo: s.ad, adim: ad, tur, sonuc, sureMs: Math.max(0, Math.round(sureMs)),
      yontem: c.yontem ?? null, yol: c.yol ?? null, beklenen: c.beklenen ?? null, gelen: c.gelen ?? null, ileti: c.ileti ?? null, ek: c.ek ?? [],
    });
  };
  const dene = async (is: () => Promise<AdimCiktisi | undefined>): Promise<AdimCiktisi> => {
    try {
      return (await is()) ?? {};
    } catch (hata) {
      return { sonuc: 'dustu', ileti: kisalt(hata instanceof Error ? hata.message : hata) };
    }
  };
  const b: SenaryoBaglami = {
    gun,
    kopya,
    rastgele: rastgeleUret(altTohum(a.tohum, gun, `${s.ad}#${String(kopya)}`)),
    rol: a.istemci,
    async adim(rol, ad, is, secenek = {}) {
      const tur = secenek.tur ?? 'api';
      const bas = saat();
      const ilk = await dene(is);
      if ((ilk.sonuc ?? 'gecti') !== 'dustu') {
        kaydet(rol, ad, tur, ilk.sonuc ?? 'gecti', saat() - bas, ilk);
        return ilk.sonuc !== 'baglanmamis';
      }
      if (secenek.tekrarlanabilir === true) {
        const ikinci = await dene(is);
        if ((ikinci.sonuc ?? 'gecti') === 'gecti') {
          kaydet(rol, ad, tur, 'ara-sira', saat() - bas, { ...ilk, ileti: `ilk deneme düştü, ikincisi geçti: ${ilk.ileti ?? ''}` });
          return true;
        }
      }
      kaydet(rol, ad, tur, 'dustu', saat() - bas, ilk);
      return false;
    },
    async bekle(rol, ad, yontem, yol, beklenen, govde) {
      let gelenGovde: unknown = null;
      const gecti = await b.adim(rol, ad, async () => {
        const c = await a.istemci(rol).istek(yontem, yol, govde);
        gelenGovde = c.govde;
        const ortak = { yontem, yol, beklenen: String(beklenen), gelen: String(c.durum) };
        return c.durum === beklenen ? ortak : { ...ortak, sonuc: 'dustu', ileti: kisalt(c.govde) };
      }, { tekrarlanabilir: yontem === 'GET' });
      return gecti ? gelenGovde : null;
    },
    baglanmamis(rol, ad, neden) {
      kaydet(rol, ad, 'api', 'baglanmamis', 0, { ileti: neden });
    },
  };
  return b;
}

// Gün döngüsü: her gün her senaryo kopya sayısı kadar aynı anda koşar. Saat ileri alınmaz; "gün" döngü adımıdır.
export async function gunleriKos(a: DonguAcilisi): Promise<void> {
  for (let gun = 1; gun <= a.gunSayisi; gun += 1) {
    a.kayit.gunBasladi(gun);
    const isler = a.senaryolar.flatMap((s) =>
      Array.from({ length: s.kopya ?? 1 }, (_, k) => async () => {
        const b = baglamKur(a, s, gun, k + 1);
        try {
          await s.kos(b);
        } catch (hata) {
          // Senaryo adım dışında patladıysa da kayda düşer; koşu durmaz.
          await b.adim(s.roller[0] ?? 'ornek.yonetici', 'senaryo', () => Promise.reject(hata instanceof Error ? hata : new Error(String(hata))));
        }
      }));
    await sinirli(isler, a.esZamanli);
    await a.gunSonu?.(gun);
  }
}
