import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { KoduDegisenKonum } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Pencere, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataMetni, useIslem } from './ortak.tsx';
import './stok.css';

// 1288 (teyitli): stoktaki etiketler yalnız Etiket Merkezi'nden basılır; her baskı oranın defterine yazılır. Stok ekranı seçili
// kayıtları adresle gönderir; Etiket Merkezi'ni açamayan kullanıcı düğmeyi görmez.
export type EtiketKaynagi = 'konum' | 'lot' | 'mal-kabul' | 'malzeme';

// Etiket Merkezi adresi en çok bu kadar kimlik kabul eder (sözleşmedeki EN_COK_KAYIT).
export const MERKEZ_SINIRI = 200;

export const etiketMerkeziAdresi = (tur: EtiketKaynagi, idler: readonly number[]): string =>
  `/etiket-merkezi?tur=${tur}&id=${[...new Set(idler)].slice(0, MERKEZ_SINIRI).join(',')}`;

export const useEtiketMerkezi = (): boolean => useIslem('sayfa.etiket-merkezi');

// Kimlikler önceden biliniyorsa bağlantı; bilinmiyorsa (örnek: bütün raf gözleri) `idler` tıklanınca okunur.
export function EtiketMerkeziDugmesi({ tur, idler, children, simge = 'tag', tursu = 'ikincil', disabled, ad }: {
  tur: EtiketKaynagi; idler: readonly number[] | (() => Promise<readonly number[]>); children: ReactNode;
  simge?: 'tag' | 'scan'; tursu?: 'birincil' | 'ikincil'; disabled?: boolean; ad?: string;
}) {
  const merkez = useEtiketMerkezi();
  const git = useNavigate();
  const { bildir } = useBildirim();
  const [okunuyor, setOkunuyor] = useState(false);
  if (!merkez) return null;
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

// 94 a: eski etiketin QR'ı eski kodu taşır ve artık okunmaz; kayıttan sonra kodu değişen konumların etiketi yeniden basılır.
export function KodDegisimPenceresi({ degisenler, kapat }: { degisenler: KoduDegisenKonum[]; kapat: () => void }) {
  const merkez = useEtiketMerkezi();
  return (
    <Pencere acik kapat={kapat} baslik="Konum kodu değişti" tur="yan"
      alt={<EtiketMerkeziDugmesi tur="konum" tursu="birincil" idler={degisenler.map((d) => d.konumId)}>Etiketleri bas</EtiketMerkeziDugmesi>}>
      <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="status">{degisenler.length} konumun kodu değişti; eski etiketler artık okunmaz. Yeniden basın.</p>
      {!merkez && <p className="tc-stok-not">Etiketler Etiket Merkezi'nden basılır; o sayfayı açabilen birine bastırın.</p>}
      {merkez && degisenler.length > MERKEZ_SINIRI && <p className="tc-stok-not">Etiket Merkezi ilk {MERKEZ_SINIRI} konumu açar; kalanları sonra basın.</p>}
      <ul className="tc-stok-liste">{degisenler.slice(0, 60).map((d) => <li key={d.konumId}>{d.eskiKod} → <strong>{d.yeniKod}</strong></li>)}</ul>
      {degisenler.length > 60 && <p className="tc-stok-not">ve {degisenler.length - 60} konum daha.</p>}
    </Pencere>
  );
}
