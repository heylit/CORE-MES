import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type * as StokIslemleri from '#paylasilan/islemler/stok.ts';
import type { KonumMalzemeleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Kart, Simge } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { useOturum } from '../../../../ortak/veri/oturum.ts';

// 3202 B (K7): kartın depodaki gözleri (en çok üç, gerisi "+N göz") ve haritada gösterme bağlantısı. Stok okuma yetkisi yoksa
// istek atılmaz ve bölüm çizilmez (Risk K1); stoğu raf gözünde olmayan kartta da bölüm yoktur.
const GOSTERILEN = 3;
const sayi = (m: string): string => Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
// Sunucunun stok OKUMA kümesi (stok/uclar.ts: sayfa.stok ve STOK_ISLEMLERI); stok.istek okuma açmaz. Liste eksik ya da fazlaysa tip denetimi kırılır.
type StokOkumaIslemi = 'sayfa.stok' | (typeof StokIslemleri.STOK_ISLEMLERI)[number];
const STOK_OKUMA_ISLEMLERI = ['sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.konum-yaz', 'stok.raf-yaz', 'stok.harita-yaz', 'stok.malzeme-ayari', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir', 'stok.eksi-onayla', 'stok.skt-onayla'] as const satisfies readonly StokOkumaIslemi[];
const STOK_OKUMA_TAM: [Exclude<StokOkumaIslemi, (typeof STOK_OKUMA_ISLEMLERI)[number]>] extends [never] ? true : never = true;
const STOK_OKUMA = new Set<string>(STOK_OKUMA_TAM ? STOK_OKUMA_ISLEMLERI : []);
const stokOkurMu = (i: string): boolean => STOK_OKUMA.has(i);

export function DepodaBolumu({ no, kod, birim }: { no: number; kod: string; birim: string }) {
  const oturum = useOturum();
  const okur = oturum.data?.islemler.some(stokOkurMu) === true;
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
