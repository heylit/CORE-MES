import { useEffect, useState } from 'react';
import { CokSatir, Dugme, Pencere } from '../../../../ortak/arayuz/index.ts';

// Prototipin openReject'i: neden isteğe bağlı, en çok 500 karakter; isteyen kişi görür.
export function ReddetPenceresi({ acik, baslik, kapat, reddet }: {
  acik: boolean; baslik: string; kapat: () => void; reddet: (neden: string) => void;
}) {
  const [neden, nedenYaz] = useState('');
  useEffect(() => { if (acik) nedenYaz(''); }, [acik]);
  return (
    <Pencere
      acik={acik} kapat={kapat} baslik="Reddet"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="tehlike" onClick={() => reddet(neden.trim())}>Reddet</Dugme>
        </>
      )}
    >
      <p className="tc-mi-pencere-alt">{baslik}</p>
      <CokSatir
        etiket="Neden?" ipucu="İsteyen kişi görecek." maxLength={500} rows={3}
        value={neden} onChange={(o) => nedenYaz(o.target.value)}
      />
    </Pencere>
  );
}
