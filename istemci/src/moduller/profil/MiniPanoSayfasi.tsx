import { useSyncExternalStore } from 'react';
import { Dugme, Kart, Simge } from '../../ortak/arayuz/index.ts';
import { miniPanoDestekli } from '../../ortak/arayuz/MiniPano.tsx';
import { panoDenetimi, panoDenetimineAbone, panoPenceresindeMi, panoPenceresiniAc } from './mini-pano-penceresi.ts';
import { useMiniPanoTercihi } from './mini-pano-tercihi.tsx';

// Pano penceresinin sayfası (3093 a): üstteki panoyu Hesap menüsünün eylemi tutar; sayfa durumu gösterir ve açtırır.
export function MiniPanoSayfasi() {
  const { acik } = useMiniPanoTercihi();
  const penceresi = useSyncExternalStore(panoDenetimineAbone, panoDenetimi);
  const destekli = miniPanoDestekli();
  if (destekli && acik.length > 0 && !panoPenceresindeMi()) {
    return (
      <div className="tc-profil-mps">
        <Kart baslik="Mini pano" simge="grid">
          <p className="tc-profil-soluk">Mini pano kendi küçük penceresinde açılır; böylece bu sayfayı yenileseniz de kapanmaz.</p>
          <Dugme tur="birincil" simge="grid" onClick={() => { panoPenceresiniAc(); }}>Mini pano penceresini aç</Dugme>
        </Kart>
      </div>
    );
  }
  return (
    <div className="tc-profil-mps">
      <Kart baslik="Mini pano" simge="grid">
        {!destekli ? (
          <p className="tc-profil-soluk">Mini pano Chrome ya da Edge tarayıcısında açılır.</p>
        ) : acik.length === 0 ? (
          <p className="tc-profil-soluk">Size açık mini pano yok.</p>
        ) : penceresi.acik ? (
          <>
            <p className="tc-profil-mps-durum"><Simge ad="check" boyut="k" />Mini pano açık, öteki programların üstünde duruyor.</p>
            <p className="tc-profil-soluk">CORE MES'i yenileseniz de kapanmaz. Bu pencereyi simge durumuna küçültebilirsiniz; kapatırsanız ya da yenilerseniz mini pano da kapanır.</p>
            <Dugme simge="grid" onClick={penceresi.ac}>Mini panoyu öne getir</Dugme>
          </>
        ) : (
          <>
            <p className="tc-profil-soluk">Mini pano öteki programların üstünde durur ve 20 saniyede bir yenilenir. Bu pencere açık kaldıkça CORE MES'i yenileseniz de kapanmaz.</p>
            <Dugme tur="birincil" boyut="ana" simge="grid" onClick={penceresi.ac}>Mini panoyu aç</Dugme>
          </>
        )}
      </Kart>
    </div>
  );
}
