import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adrestekiOnayEylemi, ONAY_EYLEMI_PARAMETRESI } from '#paylasilan/sozlesme/eposta-sabitleri.ts';

// E-postadaki Onayla düğmesi kaydı `?eylem=onayla` ile açar (3431 a): kayıt çizilince işaretli düğmeye odaklanılır ve eylem adresten
// silinir. Onay yine kişinin tıklamasıyla ve onay penceresinden verilir; adres hiçbir şeyi kendiliğinden yapmaz.
export function useOnayOdagi(hazir: boolean): void {
  const [adres, adresYaz] = useSearchParams();
  const eylem = adrestekiOnayEylemi(adres);
  useEffect(() => {
    if (eylem === null || !hazir) return;
    document.querySelector<HTMLElement>(`[data-onay-eylemi="${eylem}"]`)?.focus();
    adresYaz((a) => { const y = new URLSearchParams(a); y.delete(ONAY_EYLEMI_PARAMETRESI); return y; }, { replace: true });
  }, [eylem, hazir, adresYaz]);
}
