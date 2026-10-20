// Hazırlık listesi: rotalı emrin adım paketleri aynı emir numarasını taşır; gruplanmazsa hangi paketin hangi emrin hangi adımı olduğu okunmaz.
export type PaketGrubu = 'emir' | 'istasyon' | 'makine' | 'parca';
export const PAKET_GRUPLARI: readonly (readonly [PaketGrubu, string])[] = [['emir', 'İş emri'], ['istasyon', 'İstasyon'], ['makine', 'Makine'], ['parca', 'Parça']];

export interface GrupPaketi {
  id: string;
  no?: string;
  part?: string;
  partNo?: string;
  machine?: string;
  mc?: string;
  tmi?: { emirId?: number; opNo?: number } | null;
}

export interface PaketGrubuSatiri<T> { anahtar: string; baslik: string; alt: string; paketler: T[] }

export const paketGrubuOku = (deger: unknown): PaketGrubu =>
  (PAKET_GRUPLARI.some(([k]) => k === deger) ? deger as PaketGrubu : 'emir');

// Makine ve istasyon adları tanımdan gelir (ekran verir); verilmezse başlık kodla kalır.
export type GrupAdi = (tur: 'istasyon' | 'makine', kod: string) => string | undefined;

const opSirasi = (p: GrupPaketi) => p.tmi?.opNo ?? Number.MAX_SAFE_INTEGER;

const parcaAnahtari = (p: GrupPaketi) => (p.partNo || p.part || '').trim();

function grupAc(tur: PaketGrubu, p: GrupPaketi, anahtar: string, ad?: GrupAdi): { baslik: string; alt: string } {
  if (tur === 'emir') return { baslik: p.no || 'Numarasız emir', alt: [p.part || 'Adsız parça', p.partNo].filter(Boolean).join(' · ') };
  if (tur === 'istasyon') return { baslik: p.machine || 'İstasyonsuz', alt: (p.machine && ad?.('istasyon', p.machine)) || '' };
  if (tur === 'makine') return { baslik: p.mc || 'Makine seçilmemiş', alt: (p.mc && ad?.('makine', p.mc)) || '' };
  return { baslik: anahtar.slice(3) || 'Parça girilmemiş', alt: p.partNo && p.part ? p.part : '' };
}

// Emir grupları listenin sırasını (son değişen önde) korur, emrin paketleri operasyon sırasıyla dizilir.
// Öteki gruplar başlığa göre dizilir: şeritler her açılışta aynı yerde durur; boş değerli grup en sonda.
export function paketleriGrupla<T extends GrupPaketi>(paketler: readonly T[], tur: PaketGrubu, ad?: GrupAdi): PaketGrubuSatiri<T>[] {
  const gruplar = new Map<string, PaketGrubuSatiri<T>>();
  for (const p of paketler) {
    const anahtar = tur === 'emir'
      ? (p.tmi?.emirId != null ? `ue-${p.tmi.emirId}` : `no-${p.no ?? p.id}`)
      : tur === 'istasyon' ? `st-${p.machine ?? ''}`
        : tur === 'makine' ? `mc-${p.mc ?? ''}`
          : `pr-${parcaAnahtari(p)}`;
    let g = gruplar.get(anahtar);
    if (!g) {
      g = { anahtar, ...grupAc(tur, p, anahtar, ad), paketler: [] };
      gruplar.set(anahtar, g);
    }
    g.paketler.push(p);
  }
  const sonuc = [...gruplar.values()];
  for (const g of sonuc) {
    if (tur === 'emir') g.paketler.sort((a, b) => opSirasi(a) - opSirasi(b));
    else g.alt = [g.alt, `${g.paketler.length} paket`].filter(Boolean).join(' · ');
  }
  if (tur !== 'emir') {
    const bos = (g: PaketGrubuSatiri<T>) => (g.anahtar.length === 3 ? 1 : 0);
    sonuc.sort((a, b) => bos(a) - bos(b) || a.baslik.localeCompare(b.baslik, 'tr', { numeric: true }));
  }
  return sonuc;
}
