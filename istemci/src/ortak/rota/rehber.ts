import { SAYFA_GRUPLARI } from '#paylasilan/sayfa-tanimi.ts';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { sadelestir } from './arama-dizini.ts';
import type { HizliIsGrubu } from './hizli-isler.ts';
import { ikinciMenuyuSuz, menuMaddeleri, type IkinciMenu } from './ikinci-menu.ts';

// Kullanım rehberi: her sayfanın kısa tarifi. Modül yalnız kendi sayfalarının tarifini bildirir
// (istemci/src/moduller/<ad>/rehber.ts); kabuk toplar ve kişinin gördüğü sayfalarla süzer. Tarifi yazılmamış sayfa da
// rehberde durur: başlığı ve kişinin gördüğü ikinci menü maddeleriyle. Böylece yeni sayfa rehbere kendiliğinden girer.
export interface SayfaRehberi {
  // Sayfanın kökü (ana menüdeki yol).
  yol: string;
  // Tek cümle: bu sayfa ne işe yarar.
  ozet: string;
  // Kısa adımlar: ekrandaki düğme ve menü adlarıyla.
  nasil: readonly string[];
  // Kim yapabilir, ne geri alınamaz, hangi kural sunucuda denetlenir.
  sinirlar: readonly string[];
  // Aramada başlıkta geçmeyen ama çalışanın kullandığı sözcükler ("izin", "fatura").
  sozcukler?: readonly string[];
}

export interface RehberMaddesi {
  yol: string;
  baslik: string;
  simge: SimgeAdi;
  grup: string;
  ozet: string;
  nasil: readonly string[];
  sinirlar: readonly string[];
  // Kişinin gördüğü ikinci menü maddeleri; tarif yazılmamış sayfada da sayfanın içini anlatır.
  bolumler: readonly { baslik: string; yol: string }[];
  sozcukler: readonly string[];
  // Tarif modülden mi geldi, yoksa yalnız başlık ve menüden mi kuruldu.
  yazili: boolean;
}

type SayfaKaynagi = readonly { yol: string }[];

// dosyalar: glob çıktısı (dosya yolu -> modül). Hata açılışta, dosyayı söyleyerek: yanlış yola yazılan tarif sessizce düşmesin.
export function rehberleriTopla(dosyalar: Record<string, unknown>, sayfalar: SayfaKaynagi = SAYFALAR): SayfaRehberi[] {
  const sahip = new Map<string, string>();
  const toplam: SayfaRehberi[] = [];
  for (const dosya of Object.keys(dosyalar).sort()) {
    const { rehber } = dosyalar[dosya] as { rehber?: unknown };
    if (!Array.isArray(rehber)) throw new Error(`Modül rehber dizisi vermiyor (export const rehber): ${dosya}`);
    for (const r of rehber as SayfaRehberi[]) {
      if (!sayfalar.some((s) => s.yol === r.yol)) throw new Error(`Rehberin yolu bir sayfa değil: ${r.yol} (${dosya})`);
      if (!r.ozet?.trim()) throw new Error(`Rehberin özeti boş: ${r.yol} (${dosya})`);
      if (r.nasil.length === 0 || r.nasil.some((n) => !n.trim())) throw new Error(`Rehberin adımları boş: ${r.yol} (${dosya})`);
      if (r.sinirlar.some((n) => !n.trim())) throw new Error(`Rehberde boş sınır maddesi: ${r.yol} (${dosya})`);
      const onceki = sahip.get(r.yol);
      if (onceki !== undefined) throw new Error(`Aynı sayfaya iki rehber verildi: ${r.yol} (${onceki}, ${dosya})`);
      sahip.set(r.yol, dosya);
      toplam.push(r);
    }
  }
  return toplam;
}

interface Kaynak {
  // Kişinin gördüğü sayfalar (kapalılar düşmüş).
  sayfalar: readonly { yol: string; baslik: string; simge: SimgeAdi | string; grup: string; menudeGizli?: true }[];
  menuler: readonly IkinciMenu[];
  islemler: readonly string[];
  rehberler: readonly SayfaRehberi[];
}

const grupSirasi = (g: string): number => {
  const i = (SAYFA_GRUPLARI as readonly string[]).indexOf(g);
  return i < 0 ? SAYFA_GRUPLARI.length : i;
};

// Rehber yetki vermez: kişinin menüde gördüğü sayfaların tarifini gösterir. Sıra ana menünün sırasıdır.
export function rehberMaddeleri({ sayfalar, menuler, islemler, rehberler }: Kaynak): RehberMaddesi[] {
  return sayfalar
    .filter((s) => s.menudeGizli !== true)
    .map((s, sira) => ({ s, sira }))
    .sort((a, b) => grupSirasi(a.s.grup) - grupSirasi(b.s.grup) || a.sira - b.sira)
    .map(({ s }) => {
      const tanim = menuler.find((m) => m.kok === s.yol);
      const suzulmus = tanim === undefined ? null : ikinciMenuyuSuz(tanim, islemler);
      const bolumler = suzulmus === null ? [] : menuMaddeleri(suzulmus).map((m) => ({ baslik: m.baslik, yol: m.yol }));
      const r = rehberler.find((x) => x.yol === s.yol);
      return {
        yol: s.yol,
        baslik: s.baslik,
        simge: s.simge as SimgeAdi,
        grup: s.grup,
        ozet: r?.ozet ?? `${s.baslik} sayfası.`,
        nasil: r?.nasil ?? (bolumler.length > 0
          ? [`Sol menüden ${s.baslik} sayfasını açın.`, `Başlığın altındaki sekmelerden bölümü seçin: ${bolumler.map((b) => b.baslik).join(', ')}.`]
          : [`Sol menüden ${s.baslik} sayfasını açın.`]),
        sinirlar: r?.sinirlar ?? [],
        bolumler,
        sozcukler: r?.sozcukler ?? [],
        yazili: r !== undefined,
      };
    });
}

export interface GenelKonu {
  anahtar: string;
  baslik: string;
  simge: SimgeAdi;
  metin: readonly string[];
  sozcukler?: readonly string[];
}

export type RehberSonucu =
  | { tur: 'sayfa'; madde: RehberMaddesi }
  | { tur: 'genel'; konu: GenelKonu }
  | { tur: 'kisayol'; baslik: string; aciklama: string; yol: string; simge: SimgeAdi; grup: string };

const EN_COK_SONUC = 12;

// Soru gibi yazılan aramada ("nasıl izin isterim") her sözcük aranmaz: bunlar her metinde geçer, sonucu boşaltırdı.
const DOLGU = new Set(['nasil', 'nerede', 'nereden', 'ne', 'neden', 'nedir', 'mi', 'mu', 'bir', 've', 'ile', 'icin', 'ben', 'benim', 'yaparim', 'yapilir', 'isterim', 'bulurum', 'hangi', 'kim']);

// Sözcük öneki eşleşir ("izinler" "izin" arar): Türkçe ekler sorgunun sonunda kalır, kısaltılmış kök yakalanır.
const kok = (s: string): string => (s.length > 5 ? s.slice(0, Math.max(4, s.length - 3)) : s);

// Her anlamlı sözcük bir yerde geçmeli. Puan: başlıkta geçen önce, sonra sözcük listesi, özet, adımlar.
export function rehberAra(
  sorgu: string,
  { maddeler, konular, kisayollar }: { maddeler: readonly RehberMaddesi[]; konular: readonly GenelKonu[]; kisayollar: readonly HizliIsGrubu[] },
): RehberSonucu[] {
  const tum = sadelestir(sorgu).split(' ').filter((s) => s.length > 1);
  const anlamli = tum.filter((s) => !DOLGU.has(s));
  const sozcukler = (anlamli.length > 0 ? anlamli : tum).map(kok);
  if (sozcukler.length === 0) return [];
  const puanla = (katmanlar: readonly (readonly string[])[]): number | null => {
    const metinler = katmanlar.map((k) => sadelestir(k.join(' ')));
    let puan = 0;
    for (const s of sozcukler) {
      const i = metinler.findIndex((m) => m.includes(s));
      if (i < 0) return null;
      puan += katmanlar.length - i;
    }
    return puan;
  };
  const adaylar: { sonuc: RehberSonucu; puan: number; sira: number }[] = [];
  maddeler.forEach((m, sira) => {
    const puan = puanla([[m.baslik], m.sozcukler, [m.ozet, ...m.bolumler.map((b) => b.baslik)], [...m.nasil, ...m.sinirlar]]);
    if (puan !== null) adaylar.push({ sonuc: { tur: 'sayfa', madde: m }, puan, sira });
  });
  kisayollar.forEach((g) => g.isler.forEach((is, i) => {
    const puan = puanla([[is.baslik], [], [is.aciklama], []]);
    if (puan !== null) {
      adaylar.push({ sonuc: { tur: 'kisayol', baslik: is.baslik, aciklama: is.aciklama, yol: is.yol, simge: is.simge, grup: g.grup }, puan, sira: 1000 + i });
    }
  }));
  konular.forEach((k, sira) => {
    const puan = puanla([[k.baslik], k.sozcukler ?? [], k.metin, []]);
    if (puan !== null) adaylar.push({ sonuc: { tur: 'genel', konu: k }, puan, sira: 2000 + sira });
  });
  return adaylar.sort((a, b) => b.puan - a.puan || a.sira - b.sira).slice(0, EN_COK_SONUC).map((a) => a.sonuc);
}

export const sayfaRehberleri: readonly SayfaRehberi[] = rehberleriTopla(
  import.meta.glob('../../moduller/*/rehber.ts', { eager: true }),
);
