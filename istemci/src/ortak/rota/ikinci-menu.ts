import type { Islem } from '#paylasilan/islemler.ts';
import type { IkinciMenuMaddesi, IkinciMenuTanimi } from '#paylasilan/sayfa-tanimi.ts';
import { IKINCI_MENULER, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';

// Kabuğun çizdiği menü: simgesi setten. İşlem burada yalın metindir; kayıtlı olduğu aşağıdaki atamada denetlenir.
export type IkinciMenu = IkinciMenuTanimi<SimgeAdi>;
export type MenuMaddesi = IkinciMenuMaddesi<SimgeAdi>;

// Modülün bildirdiği simge sette, işlem kayıtlı değilse bu atama derlenmez.
const DENETLENMIS: readonly IkinciMenuTanimi<SimgeAdi, Islem>[] = IKINCI_MENULER;
export const IKINCI_MENU_TANIMLARI: readonly IkinciMenu[] = DENETLENMIS;

// Menü yalnız maddenin kendi işlemlerinden (işlemi ya da veya listesinden biri) süzülür (ana menüdeki sayfa süzgeciyle aynı kaynak: kullanıcının işlem
// listesi; bayraklı yöneticinin listesi bütün işlemleri taşır). Maddesi kalmayan grup düşer; grubu kalmayan menü yoktur.
export function ikinciMenuyuSuz(tanim: IkinciMenu, islemler: readonly string[]): IkinciMenu | null {
  const gruplar = tanim.gruplar
    .map((g) => ({ ...g, maddeler: g.maddeler.filter((m) => maddeGorunurMu(m, islemler)) }))
    .filter((g) => g.maddeler.length > 0);
  return gruplar.length === 0 ? null : { ...tanim, gruplar };
}

// Sayfanın menüsü: kullanıcı sayfayı görmüyorsa ya da hiçbir maddesini göremiyorsa menü açılmaz.
export function acikIkinciMenu(
  tanimlar: readonly IkinciMenu[],
  sayfaYolu: string | null,
  islemler: readonly string[],
): IkinciMenu | null {
  const tanim = sayfaYolu === null ? undefined : tanimlar.find((t) => t.kok === sayfaYolu);
  return tanim === undefined ? null : ikinciMenuyuSuz(tanim, islemler);
}

export const menuMaddeleri = (tanim: IkinciMenu): readonly MenuMaddesi[] => tanim.gruplar.flatMap((g) => g.maddeler);

// Etkin madde adresten bulunur: adresi kapsayan en uzun yol. Kök yoldaki madde, başka maddeye düşmeyen alt
// adreslerde de etkindir; '/a/b' maddesi '/a/bc' adresini kapsamaz.
export function etkinMadde<M extends { yol: string }>(maddeler: readonly M[], adres: string): M | null {
  let secilen: M | null = null;
  for (const m of maddeler) {
    const kapsar = adres === m.yol || adres.startsWith(`${m.yol}/`);
    if (kapsar && (secilen === null || m.yol.length > secilen.yol.length)) secilen = m;
  }
  return secilen;
}
