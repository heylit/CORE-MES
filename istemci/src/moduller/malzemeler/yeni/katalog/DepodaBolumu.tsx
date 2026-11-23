import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { KonumMalzemeleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Kart, Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { useStokOkur } from '../stok-miktari.tsx';

// 3202 B (K7): kartın depodaki gözleri (en çok üç, gerisi "+N göz") ve haritada gösterme bağlantısı. Stok okuma yetkisi yoksa
// istek atılmaz ve bölüm çizilmez (Risk K1); stoğu raf gözünde olmayan kartta da bölüm yoktur.
const GOSTERILEN = 3;
const sayi = (m: string): string => Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 });

export function DepodaBolumu({ no, kod, birim }: { no: number; kod: string; birim: string }) {
  const okur = useStokOkur();
  const yerler = useQuery({
    queryKey: ['malzemeler', 'depoda', no],
    queryFn: () => api.get<KonumMalzemeleriCevabi>(`/stok/konum-malzemeleri?tur=raf_gozu&malzemeId=${no}&sayfa=1`),
    enabled: okur,
  });
  const satirlar = yerler.data?.satirlar ?? [];
  if (!okur || satirlar.length === 0) return null;
  const kalan = (yerler.data?.toplam ?? satirlar.length) - Math.min(GOSTERILEN, satirlar.length);
  return (
    <Kart baslik="Depoda" simge="pallet">
      <p className="tc-mk-depoda">
        {satirlar.slice(0, GOSTERILEN).map((y, i) => (
          <span key={y.id}>{i > 0 && ', '}<span className="mono">{y.konumKod}</span> · {sayi(y.miktar)}{birim ? ` ${birim}` : ''}</span>
        ))}
        {kalan > 0 && <span className="tc-mk-soluk"> +{kalan} göz</span>}
      </p>
      <Link className="tc-mk-depoda-git" to={`/atolye?${new URLSearchParams({ ara: kod }).toString()}`}><Simge ad="pin" /> Depoda göster</Link>
    </Kart>
  );
}
