import { parseArgs } from 'node:util';
import { sayiOku } from './senaryo.ts';

// Koşu ayarı önce komut satırından, yoksa `.env`'deki TMIV2_YUK_* değişkeninden, o da yoksa varsayılandan gelir.
// Komut satırı gerekir: `.env` varken TMIV2_ değişkenleri yalnız ondan okunur (araclar/ortam.ts) ve süreç ortamından
// verilen TMIV2_YUK_* koşuyu "Ortam çelişkisi" ile durdurur; o kural gevşetilmez.

export type Komut = 'kos' | 'hazirla' | 'profil-ozet';

export interface YukAyari {
  komut: Komut;
  kisi: number;
  sureSn: number;
  isinmaSn: number;
  tohum: number;
  senaryo: string | null;
  // null: senaryodaki paylar geçerli.
  karma: ReadonlyMap<string, number> | null;
  yazma: boolean;
  sunucuAc: boolean;
  profil: boolean;
  yonetici: string;
  // Yalnız profil-ozet: özetlenecek .cpuprofile dosyası.
  dosya: string | null;
}

type Ortamlar = Record<string, string | undefined>;

const VARSAYILAN_YONETICI = 'ornek.yonetici';
const KOMUTLAR: readonly Komut[] = ['kos', 'hazirla', 'profil-ozet'];

// "terminal=120,ofis=60,pano=20": profil adına pay. Adı geçmeyen profil koşuya girmez.
export function karmaOku(deger: string): Map<string, number> {
  const karma = new Map<string, number>();
  for (const parca of deger.split(',')) {
    const [ad, pay, ...fazla] = parca.trim().split('=');
    const sayi = Number(pay);
    if (ad === undefined || ad === '' || pay === undefined || fazla.length > 0 || !Number.isInteger(sayi) || sayi < 1) {
      throw new Error(`Karma "ad=pay,ad=pay" biçiminde, pay 1 ya da büyük tam sayı olmalı: ${deger}`);
    }
    if (karma.has(ad)) throw new Error(`Karmada ${ad} iki kez geçiyor.`);
    karma.set(ad, sayi);
  }
  return karma;
}

const evet = (deger: string | undefined): boolean => deger !== undefined && ['1', 'evet', 'true'].includes(deger.trim().toLowerCase());
const dolu = (deger: string | undefined): string | null => (deger === undefined || deger.trim() === '' ? null : deger.trim());

export function ayarOku(argv: readonly string[], ortam: Ortamlar): YukAyari {
  const { values: s, positionals: konum } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      kisi: { type: 'string' },
      sure: { type: 'string' },
      isinma: { type: 'string' },
      tohum: { type: 'string' },
      senaryo: { type: 'string' },
      karma: { type: 'string' },
      yazma: { type: 'boolean' },
      'sunucu-ac': { type: 'boolean' },
      profil: { type: 'boolean' },
      yonetici: { type: 'string' },
    },
  });
  const ilk = konum[0] ?? 'kos';
  if (!(KOMUTLAR as readonly string[]).includes(ilk)) throw new Error(`Bilinmeyen komut: ${ilk} (kos, hazirla, profil-ozet).`);
  const komut = ilk as Komut;
  if (komut === 'profil-ozet' ? konum.length !== 2 : konum.length > 1) {
    throw new Error(komut === 'profil-ozet' ? 'Kullanım: npm run yuk -- profil-ozet <dosya.cpuprofile>' : `Fazla değer: ${konum.slice(1).join(' ')}`);
  }
  const karmaMetni = dolu(s.karma) ?? dolu(ortam.TMIV2_YUK_KARMA);
  const profil = s.profil === true || evet(ortam.TMIV2_YUK_PROFIL);
  return {
    komut,
    kisi: sayiOku(s.kisi ?? ortam.TMIV2_YUK_KISI, 1000, 'kisi (TMIV2_YUK_KISI)', 1, 5000),
    sureSn: sayiOku(s.sure ?? ortam.TMIV2_YUK_SURE_SN, 300, 'sure (TMIV2_YUK_SURE_SN)', 10, 86_400),
    isinmaSn: sayiOku(s.isinma ?? ortam.TMIV2_YUK_ISINMA_SN, 60, 'isinma (TMIV2_YUK_ISINMA_SN)', 0, 3600),
    tohum: sayiOku(s.tohum ?? ortam.TMIV2_YUK_TOHUM, 1, 'tohum (TMIV2_YUK_TOHUM)', 0, 2 ** 31),
    senaryo: dolu(s.senaryo) ?? dolu(ortam.TMIV2_YUK_SENARYO),
    karma: karmaMetni === null ? null : karmaOku(karmaMetni),
    yazma: s.yazma === true || evet(ortam.TMIV2_YUK_YAZMA),
    // Profil sunucunun kendi sürecinden alınır: yalnız koşunun açtığı sunucuda olur.
    sunucuAc: s['sunucu-ac'] === true || profil,
    profil,
    yonetici: dolu(s.yonetici) ?? dolu(ortam.TMIV2_YUK_YONETICI) ?? VARSAYILAN_YONETICI,
    dosya: komut === 'profil-ozet' ? (konum[1] ?? null) : null,
  };
}

export const ornekYoneticiMi = (ayar: Pick<YukAyari, 'yonetici'>): boolean => ayar.yonetici === VARSAYILAN_YONETICI;
