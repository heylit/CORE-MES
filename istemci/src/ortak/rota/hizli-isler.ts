import { islemMi, type Islem } from '#paylasilan/islemler.ts';
import { SAYFA_GRUPLARI } from '#paylasilan/sayfa-tanimi.ts';
import { IKINCI_MENULER, SAYFALAR, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { SIMGELER, type SimgeAdi } from '../tasarim/simgeler.ts';

// "Ne oldu?" paneli (üst çubuk): kişinin günlük işini başlattığı ekrana götüren olaylar. Modül yalnız olayını bildirir
// (istemci/src/moduller/<ad>/hizli-isler.ts); kabuk toplar, süzer ve çizer. Panel yetki vermez: olay, gideceği sayfa ve
// menü maddesi kişiye zaten açıksa görünür; yazma yetkisi gideceği ucundadır.
export interface HizliIs {
  // Panelde tekil; küçük harf, rakam, tire.
  anahtar: string;
  // Grup içinde küçük önce gelir; eşitte anahtar sırası.
  sira: number;
  // Kişinin ağzından olay: "Malzeme geldi", "İzin istiyorum".
  baslik: string;
  aciklama: string;
  simge: SimgeAdi;
  // Bir sayfanın kökü ya da ikinci menü maddesinin yolu: kırık bağlantı açılışta yakalanır.
  yol: string;
  islem: Islem;
  veya?: readonly Islem[];
}

export interface HizliIsGrubu {
  grup: string;
  isler: HizliIs[];
}

const ANAHTAR_BICIMI = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export type MenuKaynagi = readonly { gruplar: readonly { maddeler: readonly { yol: string; islem: string; veya?: readonly string[] }[] }[] }[];
export type SayfaKaynagi = readonly { yol: string; grup: string }[];

export const maddeyiBul = (menuler: MenuKaynagi, yol: string) =>
  menuler.flatMap((m) => m.gruplar.flatMap((g) => g.maddeler)).find((md) => md.yol === yol);
// Yolu kapsayan en uzun sayfa kökü: '/stok/mal-kabul' Stok Merkezi'nindir.
export const sayfasiniBul = <S extends { yol: string }>(sayfalar: readonly S[], yol: string): S | undefined =>
  sayfalar
    .filter((s) => yol === s.yol || yol.startsWith(`${s.yol}/`))
    .sort((a, b) => b.yol.length - a.yol.length)[0];

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış bildirilen olay sessizce düşmesin.
export function hizliIsleriTopla(
  dosyalar: Record<string, unknown>,
  sayfalar: SayfaKaynagi = SAYFALAR,
  menuler: MenuKaynagi = IKINCI_MENULER,
): HizliIs[] {
  const sahip = new Map<string, string>();
  const toplam: HizliIs[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { hizliIsler } = dosyalar[dosya] as { hizliIsler?: unknown };
    if (!Array.isArray(hizliIsler)) throw new Error(`Modül olay dizisi vermiyor (export const hizliIsler): ${dosya}`);
    for (const is of hizliIsler as HizliIs[]) {
      if (!ANAHTAR_BICIMI.test(is.anahtar)) throw new Error(`Olay anahtarı biçime uymuyor: "${is.anahtar}" (${dosya})`);
      if (!Number.isFinite(is.sira)) throw new Error(`Olay sırası sayı değil: ${is.anahtar} (${dosya})`);
      if (!is.baslik?.trim() || !is.aciklama?.trim()) throw new Error(`Olayın başlığı ya da açıklaması boş: ${is.anahtar} (${dosya})`);
      if (!(is.simge in SIMGELER)) throw new Error(`Olayın simgesi sette yok: ${String(is.simge)} (${is.anahtar}, ${dosya})`);
      const kayitsiz = [is.islem, ...(is.veya ?? [])].find((i) => !islemMi(i));
      if (kayitsiz !== undefined) throw new Error(`Olayın işlemi kayıtlı değil: ${String(kayitsiz)} (${is.anahtar}, ${dosya})`);
      if (!sayfalar.some((s) => s.yol === is.yol) && maddeyiBul(menuler, is.yol) === undefined) {
        throw new Error(`Olayın yolu bir sayfa ya da menü maddesi değil: ${is.yol} (${is.anahtar}, ${dosya})`);
      }
      const onceki = sahip.get(is.anahtar);
      if (onceki !== undefined) throw new Error(`Aynı anahtarla iki olay verildi: ${is.anahtar} (${onceki}, ${dosya})`);
      sahip.set(is.anahtar, dosya);
      toplam.push(is);
    }
  }
  return toplam;
}

interface Gorunurluk {
  // Kişinin gördüğü sayfalar (kapalılar düşmüş): olayın sayfası burada değilse olay da yoktur.
  sayfalar: SayfaKaynagi;
  // Kapalı maddeleri düşmüş ikinci menüler.
  menuler: MenuKaynagi;
  islemler: readonly string[];
}

// Olay, kendi işlemi, gideceği sayfa ve (yol bir menü maddesiyse) o madde kişiye açıksa görünür; kapalı madde düşer.
// Gruplar ana menünün grup sırasıyla, grup adı olayın gittiği sayfanın grubudur.
export function gorunenHizliIsler(isler: readonly HizliIs[], { sayfalar, menuler, islemler }: Gorunurluk): HizliIsGrubu[] {
  const gorunen = isler.filter((is) => {
    if (!maddeGorunurMu(is, islemler)) return false;
    const sayfa = sayfasiniBul(sayfalar, is.yol);
    if (sayfa === undefined) return false;
    if (is.yol === sayfa.yol) return true;
    const madde = maddeyiBul(menuler, is.yol);
    return madde !== undefined && maddeGorunurMu(madde, islemler);
  });
  const grupSirasi = (g: string): number => {
    const i = (SAYFA_GRUPLARI as readonly string[]).indexOf(g);
    return i < 0 ? SAYFA_GRUPLARI.length : i;
  };
  const gruplar = new Map<string, HizliIs[]>();
  for (const is of gorunen) {
    const grup = sayfasiniBul(sayfalar, is.yol)!.grup;
    gruplar.set(grup, [...(gruplar.get(grup) ?? []), is]);
  }
  return [...gruplar.entries()]
    .sort(([a], [b]) => grupSirasi(a) - grupSirasi(b) || a.localeCompare(b, 'tr'))
    .map(([grup, liste]) => ({ grup, isler: liste.sort((a, b) => a.sira - b.sira || a.anahtar.localeCompare(b.anahtar)) }));
}

export const hizliIsler: readonly HizliIs[] = hizliIsleriTopla(
  import.meta.glob('../../moduller/*/hizli-isler.ts', { eager: true }),
);
