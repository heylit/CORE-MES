import { useState } from 'react';
import { Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
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
