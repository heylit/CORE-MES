import { useState } from 'react';
import { Girdi } from '../../ortak/arayuz/index.ts';
import { konumuAyristir } from './koordinat.ts';

interface Ozellikler {
  enlem: string;
  boylam: string;
  degistir: (yama: { enlem: string; boylam: string }) => void;
  enlemHata?: string | undefined;
  boylamHata?: string | undefined;
}

const ORNEK = '41.0123, 29.0456';

// Enlem ve boylam kutuları ile "Konumu yapıştır" kutusu: yapıştırılan koordinat ya da harita bağlantısı iki kutuyu doldurur.
// Bağlantı açılmaz, ağa gidilmez; yalnız metindeki sayılar okunur.
export function KonumGirisi({ enlem, boylam, degistir, enlemHata, boylamHata }: Ozellikler) {
  const [yapistirilan, yapistirilanYaz] = useState('');
  const okunan = konumuAyristir(yapistirilan);
  const okunamadi = yapistirilan.trim() !== '' && okunan === null;

  const yapistir = (metin: string) => {
    yapistirilanYaz(metin);
    const konum = konumuAyristir(metin);
    if (konum !== null) degistir({ enlem: String(konum.enlem), boylam: String(konum.boylam) });
  };

  return (
    <div className="tc-mt-konum-giris">
      <Girdi
        etiket="Konumu yapıştır"
        value={yapistirilan}
        onChange={(o) => yapistir(o.target.value)}
        placeholder={ORNEK}
        autoComplete="off"
        {...(okunamadi
          ? { hata: `Konum okunamadı. ${ORNEK} ya da harita bağlantısı yapıştırın.` }
          : { ipucu: okunan ? `Okundu: ${okunan.enlem}, ${okunan.boylam}` : `Örnek: ${ORNEK} ya da harita bağlantısı` })}
      />
      <div className="tc-mt-ikili">
        <Girdi
          etiket="Enlem"
          inputMode="decimal"
          value={enlem}
          onChange={(o) => degistir({ enlem: o.target.value, boylam })}
          autoComplete="off"
          {...(enlemHata ? { hata: enlemHata } : {})}
        />
        <Girdi
          etiket="Boylam"
          inputMode="decimal"
          value={boylam}
          onChange={(o) => degistir({ enlem, boylam: o.target.value })}
          autoComplete="off"
          {...(boylamHata ? { hata: boylamHata } : {})}
        />
      </div>
    </div>
  );
}
