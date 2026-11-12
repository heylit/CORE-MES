import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { KoduDegisenKonum } from '#paylasilan/sozlesme/stok.ts';
import { ETIKET_MERKEZI_SINIRI, etiketMerkeziAdresi, type EtiketKaynagi } from '#paylasilan/etiket-sabitleri.ts';
import { Dugme, KodDegisimPenceresi as OrtakKodDegisimPenceresi, useBildirim } from '../../ortak/arayuz/index.ts';
import { useDogrudanBasim } from '../etiket-merkezi/disari.ts';
import { hataMetni, useIslem } from './ortak.tsx';
import './stok.css';

// 1288 (teyitli): stoktaki etiketler yalnız Etiket Merkezi'nden basılır; her baskı oranın defterine yazılır. Stok ekranı seçili
// kayıtları adresle gönderir; Etiket Merkezi'ni açamayan kullanıcı düğmeyi görmez.
export { etiketMerkeziAdresi, type EtiketKaynagi };
export const MERKEZ_SINIRI = ETIKET_MERKEZI_SINIRI;

export const useEtiketMerkezi = (): boolean => useIslem('sayfa.etiket-merkezi');

// Kimlikler önceden biliniyorsa bağlantı; bilinmiyorsa (örnek: bütün raf gözleri) `idler` tıklanınca okunur.
// 2916 a: bu cihazda bu etiket türünün varsayılan yazıcısı varsa düğme Etiket Merkezi'ni açmadan oraya basar.
export function EtiketMerkeziDugmesi({ tur, idler, children, simge = 'tag', tursu = 'ikincil', disabled, ad }: {
  tur: EtiketKaynagi; idler: readonly number[] | (() => Promise<readonly number[]>); children: ReactNode;
  simge?: 'tag' | 'scan'; tursu?: 'birincil' | 'ikincil'; disabled?: boolean; ad?: string;
}) {
  const merkez = useEtiketMerkezi();
  const git = useNavigate();
  const { bildir } = useBildirim();
  const [okunuyor, setOkunuyor] = useState(false);
  const dogrudan = useDogrudanBasim(tur);
  if (!merkez) return null;
  const y = dogrudan.yazici;
  if (y !== null) {
    const etiket = `${ad ?? (typeof children === 'string' ? children : 'Etiket bas')} · ${y.yaziciAd}`;
    return (
      <Dugme tur={tursu} simge="printer" aria-label={etiket} title={`Varsayılan yazıcı: ${y.yaziciAd} (${y.sablonAd})`}
        disabled={disabled || (typeof idler !== 'function' && idler.length === 0)} yukleniyor={okunuyor || dogrudan.basiyor} onClick={(e) => {
          e.stopPropagation();
          if (typeof idler !== 'function') { dogrudan.bas(idler); return; }
          setOkunuyor(true);
          void idler().then((l) => { if (l.length > 0) dogrudan.bas(l); else bildir('bilgi', 'Basılacak etiket yok.'); },
            (h: unknown) => bildir('hata', hataMetni(h))).finally(() => setOkunuyor(false));
        }}>{children}</Dugme>
    );
  }
  if (typeof idler !== 'function') {
    if (disabled || idler.length === 0) return <Dugme tur={tursu} simge={simge} aria-label={ad} disabled>{children}</Dugme>;
    // Satır içindeki düğme satırın kendi tıklamasını (ayrıntıya gitme) tetiklemez.
    return <Link to={etiketMerkeziAdresi(tur, idler)} aria-label={ad} onClick={(e) => e.stopPropagation()}><Dugme tur={tursu} simge={simge} aria-label={ad}>{children}</Dugme></Link>;
  }
  const oku = idler;
  return (
    <Dugme tur={tursu} simge={simge} aria-label={ad} disabled={disabled} yukleniyor={okunuyor} onClick={(e) => {
      e.stopPropagation();
      setOkunuyor(true);
      void oku().then((l) => {
        if (l.length > 0) void git(etiketMerkeziAdresi(tur, l)); else bildir('bilgi', 'Basılacak etiket yok.');
      }, (h: unknown) => bildir('hata', hataMetni(h))).finally(() => setOkunuyor(false));
    }}>{children}</Dugme>
  );
}

// 94 a, 3135 a: pencere ortaktır (atölye de açar); stokta tek parçalı basma varsayılan yazıcıya doğrudan basar.
export function KodDegisimPenceresi({ degisenler, kapat }: { degisenler: KoduDegisenKonum[]; kapat: () => void }) {
  const merkez = useEtiketMerkezi();
  return (
    <OrtakKodDegisimPenceresi degisenler={degisenler} kapat={kapat} etiketMerkezi={merkez}
      basDugmesi={(idler) => <EtiketMerkeziDugmesi tur="konum" tursu="birincil" idler={idler}>Etiketleri bas</EtiketMerkeziDugmesi>} />
  );
}
