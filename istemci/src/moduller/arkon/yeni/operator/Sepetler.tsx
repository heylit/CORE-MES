import { useState } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi as sayiYaz } from '../cekirdek/bicim.ts';
import { CikanSepet, IstasyonSepetleri, useIsMalzemeDurumu, useIstasyonSepetiSayilari } from '../../baglanti.ts';

// Terminalin iki sepeti (745, karar 758 a; 317 b'nin yerine): gelen önceki istasyonun ürettiğidir (teslim al, çekme), çıkan burada
// üretilendir (sonraki istasyona, itme). Çip iki sayıyı söyler, dokununca sepetler açılır.
export function Sepetler({ istasyon, emirId }: { istasyon: string; emirId: number | null }) {
  const { istasyonId } = useIsMalzemeDurumu(istasyon, emirId);
  const sayi = useIstasyonSepetiSayilari(istasyonId, emirId);
  const [acikEmir, setAcikEmir] = useState<number | null>(null);
  if (istasyonId === null) return null;
  return (
    <>
      {emirId !== null && sayi !== null && (
        <button type="button" className="tc-ay1-malzeme-cip" data-ton={sayi.gelen > 0 ? 'bilgi' : undefined} onClick={() => setAcikEmir(emirId)}>
          <Simge ad="layers" boyut="k" /><span>Sepet</span><b>Gelen {sayi.gelen} · Çıkan {sayi.cikan}</b>
        </button>
      )}
      {acikEmir !== null && (
        <Pencere acik kapat={() => setAcikEmir(null)} baslik="Sepetler" tur="yan">
          <IstasyonSepetleri istasyonId={istasyonId} uretimEmriId={acikEmir} />
        </Pencere>
      )}
    </>
  );
}

// 1337 a: adım bitince biten emrin çıkan sepeti "İş emri tamamlandı" özetinin içindedir ("Sonraki istasyona"); ayrı pencere açılmaz.
// Terminal bu arada sıradaki işe geçse de özet biten emrin parçasını gösterir.
export function BitenSepet({ istasyon, emirId }: { istasyon: string; emirId: number }) {
  const { istasyonId } = useIsMalzemeDurumu(istasyon, emirId);
  return istasyonId === null ? null : <CikanSepet istasyonId={istasyonId} uretimEmriId={emirId} />;
}

// 3742: sayacın iki yanında ikinci tüp ve küçük teslim düğmesi. Solda "Gelen" (önceki istasyondan alınabilecek adet) ve Teslim al,
// sağda "Teslim" (burada üretilmiş, sonraki istasyona verilebilecek adet) ve Teslim et. Düğme sepet penceresini açar; komutlar
// sepet satırlarınındır (Sepete at, Teslim al, rotaya göre gönder), yeni komut yoktur. Okunamazsa tüp boş kalır, sıfır yazılmaz.
export function SepetTupu({ istasyon, emirId, yon, hedef }: { istasyon: string; emirId: number | null; yon: 'gelen' | 'cikan'; hedef: number }) {
  const { istasyonId } = useIsMalzemeDurumu(istasyon, emirId);
  const s = useIstasyonSepetiSayilari(istasyonId, emirId);
  const [acik, setAcik] = useState(false);
  const adet = s === null ? null : yon === 'gelen' ? s.gelenAdet : s.cikanAdet;
  const ad = yon === 'gelen' ? 'Gelen' : 'Teslim';
  const p = adet === null || !(hedef > 0) ? 0 : Math.round(Math.min(1, adet / hedef) * 100);
  return (
    <>
      <div className="tc-ay1-gosterge" data-ton={adet !== null && adet > 0 ? (yon === 'gelen' ? 'bilgi' : 'tamam') : undefined} data-bos={adet === null ? '' : undefined}>
        <span className="tc-ay1-gosterge-ad">{ad}</span>
        <span className="tc-ay1-gosterge-cubuk" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`${ad} ${adet === null ? '' : sayiYaz(adet)} adet`}>
          <svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y={100 - p} width="10" height={p} /></svg>
        </span>
        <b className="tc-ay1-mono">{adet === null ? '' : sayiYaz(adet)}</b>
        <small>hazır</small>
      </div>
      {istasyonId !== null && emirId !== null ? (
        <span className="tc-ay1-tup-dugme" data-yon={yon}>
          <Dugme tur={adet !== null && adet > 0 ? 'birincil' : 'ikincil'} simge={yon === 'gelen' ? 'download' : 'upload'} aria-label={yon === 'gelen' ? `Teslim al: gelen ${adet === null ? '' : sayiYaz(adet)} adet` : `Teslim et: ${adet === null ? '' : sayiYaz(adet)} adet`} onClick={() => setAcik(true)}><span className="tc-ay1-tup-uzun">{yon === 'gelen' ? 'Teslim al' : 'Teslim et'}</span><span className="tc-ay1-tup-kisa">{yon === 'gelen' ? 'Al' : 'Et'}</span></Dugme>
        </span>
      ) : null}
      {acik && istasyonId !== null && emirId !== null ? (
        <Pencere acik kapat={() => setAcik(false)} baslik="Sepetler" tur="yan">
          <IstasyonSepetleri istasyonId={istasyonId} uretimEmriId={emirId} />
        </Pencere>
      ) : null}
    </>
  );
}
