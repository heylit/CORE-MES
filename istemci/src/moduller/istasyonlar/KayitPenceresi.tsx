import type { FormEvent, ReactNode } from 'react';
import { Dugme, Pencere } from '../../ortak/arayuz/index.ts';
import './istasyonlar.css';

interface Ozellikler {
  baslik: string;
  kapat: () => void;
  kaydet: () => void;
  // Yeni kayıtta verilmez.
  sil?: () => void;
  mesgul: boolean;
  hata: string | null;
  children: ReactNode;
  // Formun dışında kalan bölüm (kişi paneli): kendi düğmeleri formu göndermez. Verilirse pencere yandan açılır.
  ek?: ReactNode;
}

export function KayitPenceresi({ baslik, kapat, kaydet, sil, mesgul, hata, children, ek }: Ozellikler) {
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    kaydet();
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={baslik}
      tur={ek ? 'yan' : 'orta'}
      alt={(
        <>
          {sil && <Dugme tur="tehlike" simge="trash" onClick={sil} disabled={mesgul}>Sil</Dugme>}
          <Dugme onClick={kapat} disabled={mesgul}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="tc-ist-form" yukleniyor={mesgul}>Kaydet</Dugme>
        </>
      )}
    >
      <form id="tc-ist-form" className="tc-form" onSubmit={gonder}>
        {children}
        {hata && <p className="tc-ist-hata tc-form-tam" role="alert">{hata}</p>}
      </form>
      {ek}
    </Pencere>
  );
}
