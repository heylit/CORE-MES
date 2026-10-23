import type { KmKoleksiyonu } from '../tipler.ts';
import type { KmVerisi, KmYedek } from '../veri.ts';

export const YEDEK_BICIMI = 'kalite-merkezi-yedek';
export const SON_YEDEK_ANAHTARI = 'kym-son-yedek';
// Ölçü aletleri Kalibrasyonun kaydıdır (329 a): yedeğe girmez, geri yüklemede de yazılmaz.
const YEDEK_KOLLARI: readonly KmKoleksiyonu[] = ['ncr', 'capa', 'insp', 'sup', 'frm', 'lot', 'tpl', 'spc', 'cizim', 'parca', 'iz', 'belge', 'emir', 'bayrak'];

export interface YedekDosyasi extends KmYedek { format: string; surum: number; tarih: string; files?: Record<string, { type?: string; b64?: string }> }

// Uygulamanın yedek biçimi: koleksiyon -> kimlik -> gövde; ayarlar settings/genel'de.
export function yedekBelgeleri(v: KmVerisi): NonNullable<KmYedek['docs']> {
  const docs: NonNullable<KmYedek['docs']> = {};
  for (const k of YEDEK_KOLLARI) {
    const m: Record<string, Record<string, unknown>> = {};
    for (const r of v[k] as readonly { _id: string }[]) {
      const { _id, ...govde } = r;
      m[_id] = govde;
    }
    docs[k] = m;
  }
  docs.settings = { genel: { ...v.ayarlar } };
  return docs;
}

export const resimDosyalari = (v: Pick<KmVerisi, 'cizim'>): string[] =>
  v.cizim.map((d) => d.assetId).filter((x): x is string => typeof x === 'string' && x !== '');

// Okunan dosya yedek mi; değilse ileti. Dev kaydı ayıklanır.
export function yedekOku(metin: string): { yedek: YedekDosyasi; kayit: number; dosya: number } | { hata: string } {
  let o: unknown;
  try {
    o = JSON.parse(metin);
  } catch {
    return { hata: 'Dosya okunamadı.' };
  }
  const y = o as Partial<YedekDosyasi> | null;
  if (!y || y.format !== YEDEK_BICIMI) return { hata: 'Bu bir Kalite Merkezi yedek dosyası değil.' };
  const docs = { ...(y.docs ?? {}) };
  delete docs.dev;
  const yedek = { ...y, docs } as YedekDosyasi;
  return { yedek, kayit: Object.values(docs).reduce((a, m) => a + Object.keys(m ?? {}).length, 0), dosya: Object.keys(y.files ?? {}).length };
}
