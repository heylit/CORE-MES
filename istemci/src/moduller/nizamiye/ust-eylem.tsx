import { useEffect, useState } from 'react';
import { Simge } from '../../ortak/arayuz/index.ts';
import type { UstEylem, UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { ZiyaretcilerimPenceresi } from './Ziyaretcilerim.tsx';

function ZiyaretcilerimDugmesi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const [acik, acikYaz] = useState(false);
  useEffect(() => { if (acmaIstegi > 0) acikYaz(true); }, [acmaIstegi]);
  return (
    <>
      <button type="button" className="tc-kabuk-tema tc-nz-ust-eylem" onClick={() => acikYaz(true)} aria-haspopup="dialog" aria-label="Ziyaretçilerim" title="Ziyaretçilerim">
        <Simge ad="users" />
      </button>
      {acik && <ZiyaretcilerimPenceresi kapat={() => acikYaz(false)} />}
    </>
  );
}

// Her çalışanın Hesap menüsünde (217 a, 516 a): yalnız oturum ister, ev sahibi sunucuda oturumdan alınır; Nizamiye sayfası açılmaz.
export const ustEylemler: readonly UstEylem[] = [{
  anahtar: 'ziyaretcilerim', sira: 80, islem: 'oturum', yer: 'hesap', hesapMaddesi: { baslik: 'Ziyaretçilerim', simge: 'users' },
  dugme: ZiyaretcilerimDugmesi,
}];
