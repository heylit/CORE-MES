import { useEffect, useState } from 'react';
import { Simge } from '../../ortak/arayuz/index.ts';
import type { UstEylem, UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { GeriBildirimPenceresi } from './GeriBildirimPenceresi.tsx';
import './profil.css';

function GeriBildirimDugmesi({ acmaIstegi = 0 }: UstEylemOzellikleri) {
  const [acik, acikYaz] = useState(false);
  useEffect(() => { if (acmaIstegi > 0) acikYaz(true); }, [acmaIstegi]);
  return (
    <>
      <button type="button" className="tc-kabuk-tema" onClick={() => acikYaz(true)} aria-haspopup="dialog" aria-label="Şikayet, istek ve öneri" title="Şikayet, istek ve öneri">
        <Simge ad="edit" />
      </button>
      {acik && <GeriBildirimPenceresi kapat={() => acikYaz(false)} />}
    </>
  );
}

// Her çalışanın Hesap menüsünde (516 a; seyrek kullanılır, çubukta yer tutmaz): gönderme yalnız oturum ister, kişi sunucuda
// oturumdan alınır.
export const ustEylemler: readonly UstEylem[] = [{
  anahtar: 'geri-bildirim', sira: 90, islem: 'oturum', yer: 'hesap', hesapMaddesi: { baslik: 'Şikayet, istek ve öneri', simge: 'edit' },
  dugme: GeriBildirimDugmesi,
}];
