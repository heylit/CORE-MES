import { Simge } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';

const RENK_SAYISI = 8;

// Kişi rengi kişi no'sundan türetilir (eski köprüyle aynı karma); renkler tasarım değişkenidir (203 a, T1).
export function kisiRengi(id: string): number {
  let t = 0;
  for (const c of id) t = (t * 31 + c.charCodeAt(0)) % 1_000_003;
  return t % RENK_SAYISI;
}

export function basHarfler(ad: string): string {
  const p = String(ad || '?').trim().split(/\s+/);
  const ilk = (p[0] ?? '?')[0] ?? '?';
  const son = p.length > 1 ? ((p[p.length - 1] ?? '')[0] ?? '') : '';
  return (ilk + son).toLocaleUpperCase('tr');
}

interface Ozellikler {
  id: string | null | undefined;
  boyut?: 's' | 'm' | 'l';
  // Verilirse çevrimiçi noktası çizilir.
  cevrimici?: boolean;
}

export function KisiRozeti({ id, boyut = 'm', cevrimici }: Ozellikler) {
  const { ad } = useMesaj();
  const sinif = `tc-my-kisi tc-my-kisi-${boyut}`;
  if (!id) return <span className={`${sinif} tc-my-kisi-bos`} aria-hidden="true">?</span>;
  if (id === '__bot') {
    return <span className={`${sinif} tc-my-kisi-bot`} aria-hidden="true"><Simge ad="bolt" boyut="k" /></span>;
  }
  return (
    <span className={`${sinif} tc-my-renk-${kisiRengi(id)}`} title={ad(id)} aria-hidden="true">
      {basHarfler(ad(id))}
      {cevrimici !== undefined && <i className={cevrimici ? 'tc-my-nokta tc-my-nokta-acik' : 'tc-my-nokta'} />}
    </span>
  );
}
