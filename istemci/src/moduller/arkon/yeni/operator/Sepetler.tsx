import { useEffect, useState } from 'react';
import { Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { IstasyonSepetleri, useIsMalzemeDurumu, useIstasyonSepetiSayilari } from '../../baglanti.ts';

// Terminalin iki sepeti (745, karar 758 a; 317 b'nin yerine): gelen önceki istasyonun ürettiğidir (teslim al, çekme), çıkan burada
// üretilendir (sonraki istasyona, itme). Çip iki sayıyı söyler, dokununca sepetler açılır. Adım bitince çıkan sepet biten emirle
// kendiliğinden açılır; terminal bu arada sıradaki işe geçse de pencere biten emrin parçasını gösterir.
const CIKAN_SEPETI_AC = 'tmi:arkon-cikan-sepeti-ac';
export function cikanSepetiniAc(uretimEmriId: number | null): void {
  if (uretimEmriId !== null) window.dispatchEvent(new CustomEvent<number>(CIKAN_SEPETI_AC, { detail: uretimEmriId }));
}

export function Sepetler({ istasyon, emirId }: { istasyon: string; emirId: number | null }) {
  const { istasyonId } = useIsMalzemeDurumu(istasyon, emirId);
  const sayi = useIstasyonSepetiSayilari(istasyonId, emirId);
  const [acikEmir, setAcikEmir] = useState<number | null>(null);
  useEffect(() => {
    const ac = (o: Event) => setAcikEmir((o as CustomEvent<number>).detail);
    window.addEventListener(CIKAN_SEPETI_AC, ac);
    return () => window.removeEventListener(CIKAN_SEPETI_AC, ac);
  }, []);
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
