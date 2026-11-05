import type { EmirAdimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { KontrolNoktasi, TalimatAdimi, TalimatAsamasi, TalimatMedyasi } from '#paylasilan/sozlesme/rota.ts';

// Hazırlık talimatının saf kuralları (kart 2098c, prototip v5): emrin adımı rotadaki talimat adımıyla sırasından eşlenir,
// zorunlu adımın kanıtı yoksa Tamam açılmaz (v3), Başlat yalnız uyarır (2098-3 b).

export type HazirlikAsamasi = Exclude<TalimatAsamasi, 'uretim'>;

export interface HazirlikAdimi {
  id: number;
  sira: number;
  baslik: string;
  yonerge: string[];
  asama: TalimatAsamasi;
  tamam: boolean;
  zorunlu: boolean;
  kontrol: KontrolNoktasi;
  medya: TalimatMedyasi[];
  kanit: EmirAdimi['kanit'];
  gecenNot: EmirAdimi['gecenNot'];
  buNot: EmirAdimi['buNot'];
}

export interface KanitGirisi { deger: string; secim: string | null; foto: string | null }
export const BOS_GIRIS: KanitGirisi = { deger: '', secim: null, foto: null };

export const ASAMA_BILGISI: Readonly<Record<HazirlikAsamasi, { ad: string; alt: string; bos: string }>> = {
  on_hazirlik: {
    ad: 'Üretim öncesi hazırlık', alt: 'Mevcut iş sürerken yapılır · işaretler iş emrine kişi ve saatle yazılır',
    bos: 'Bu iş emrinin rotasında ön hazırlık adımı yok',
  },
  hazirlik: { ad: 'Üretim hazırlığı', alt: 'Ayar başlayınca açıldı · bitince Başlat', bos: 'Bu iş emrinin rotasında üretim hazırlığı adımı yok' },
};

// Yönerge açıklamanın satırlarıdır; satırı olmayan adım tek yönerge olarak başlığını taşımaz, boş kalır.
export function yonergeler(metin: string | null): string[] {
  return (metin ?? '').split('\n').map((s) => s.trim()).filter((s) => s !== '');
}

export function hazirlikAdimlari(adimlar: readonly EmirAdimi[], talimat: readonly TalimatAdimi[] | null, asama: HazirlikAsamasi): HazirlikAdimi[] {
  return adimlar.filter((a) => a.asama === asama).map((a) => {
    const t = talimat?.find((x) => x.sira === a.sira);
    return {
      id: a.id, sira: a.sira, baslik: t?.baslik ?? a.ad, yonerge: yonergeler(t?.metin ?? a.aciklama), asama: a.asama, tamam: a.tamam,
      zorunlu: t?.zorunlu ?? false, kontrol: t?.kontrol ?? { tur: 'yok' }, medya: t?.medya ?? [], kanit: a.kanit, gecenNot: a.gecenNot, buNot: a.buNot,
    };
  });
}

export const sayiOku = (v: string): number | null => {
  const t = v.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export type OlcumHali = 'uygun' | 'disinda' | null;
export function olcumHali(k: KontrolNoktasi, deger: string): OlcumHali {
  if (k.tur !== 'olcum') return null;
  const n = sayiOku(deger);
  if (n === null) return null;
  return (k.alt === null || n >= k.alt) && (k.ust === null || n <= k.ust) ? 'uygun' : 'disinda';
}

export function tamamOlur(a: Pick<HazirlikAdimi, 'zorunlu' | 'kontrol'>, g: KanitGirisi): boolean {
  if (!a.zorunlu) return a.kontrol.tur !== 'olcum' || g.deger.trim() === '' || olcumHali(a.kontrol, g.deger) !== null;
  switch (a.kontrol.tur) {
    case 'olcum': return olcumHali(a.kontrol, g.deger) === 'uygun';
    case 'foto': return g.foto !== null;
    case 'secim': return g.secim !== null;
    case 'onay': case 'yok': return true;
  }
}

// Sunucuya giden kanıt; girilmemiş alan gitmez, hiçbir şey girilmediyse kanıt yoktur.
export function kanitGovdesi(a: Pick<HazirlikAdimi, 'kontrol'>, g: KanitGirisi): { olcum?: number; secim?: string; foto?: string } | undefined {
  const k: { olcum?: number; secim?: string; foto?: string } = {};
  const n = a.kontrol.tur === 'olcum' ? sayiOku(g.deger) : null;
  if (n !== null) k.olcum = n;
  if (a.kontrol.tur === 'secim' && g.secim !== null) k.secim = g.secim;
  if (a.kontrol.tur === 'foto' && g.foto !== null) k.foto = g.foto;
  return Object.keys(k).length ? k : undefined;
}

export const eksikZorunlular = (l: readonly HazirlikAdimi[]): HazirlikAdimi[] => l.filter((a) => a.zorunlu && !a.tamam);

export const sinirMetni = (k: Extract<KontrolNoktasi, { tur: 'olcum' }>): string => {
  const s = (n: number) => String(n).replace('.', ',');
  if (k.alt !== null && k.ust !== null) return `Sınır ${s(k.alt)} – ${s(k.ust)} ${k.birim}`.trim();
  if (k.alt !== null) return `En az ${s(k.alt)} ${k.birim}`.trim();
  if (k.ust !== null) return `En çok ${s(k.ust)} ${k.birim}`.trim();
  return 'Sınır yok';
};

export const medyaAdresi = (ozet: string): string => `/api/rota/talimat-medyasi/${ozet}`;
