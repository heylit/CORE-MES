import { useState } from 'react';
import { Dugme, Pencere, Secim } from '../../../../ortak/arayuz/index.ts';
import { adSoyad } from '../bicim.ts';
import type { IkOnizleme } from '../onizleme.ts';
import { ekipKimlikleri } from '../rol.ts';
import type { IkDeposu } from '../veri.ts';
import { calisiyorMu } from './kurallar.ts';
import { bugun } from './parcalar.tsx';

// "Başka bir gözle görüntüle" (app.js rolePreviewModal): İK çalışanın ve yöneticinin ekranını görür. Önizleme salt okunurdur (210.6);
// yazma düğmeleri yetkiden gizlenir, uç yine denetler.
export function OnizlemeSecimi({ acik, kapat, depo, ac }: {
  acik: boolean; kapat: () => void; depo: IkDeposu; ac: (o: IkOnizleme) => void;
}) {
  const t = bugun();
  const aktif = depo.tur('emp').filter((p) => calisiyorMu(p, t));
  const departmanlar = depo.tur('dept');
  const ekipSayisi = (id: string) => ekipKimlikleri(aktif, departmanlar, id).size;
  const yoneticiler = aktif.filter((p) => ekipSayisi(p.id) > 0);
  const [rol, rolYaz] = useState<IkOnizleme['rol']>('calisan');
  const liste = rol === 'yonetici' ? yoneticiler : aktif;
  const [kisi, kisiYaz] = useState('');
  const secili = liste.some((p) => p.id === kisi) ? kisi : liste[0]?.id ?? '';
  return (
    <Pencere
      acik={acik} kapat={kapat} baslik="Başka bir gözle görüntüle"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="eye" disabled={!secili} onClick={() => { ac({ rol, personel: secili }); kapat(); }}>Önizle</Dugme>
        </>
      )}
    >
      <p>
        Çalışanların ve yöneticilerin göreceği ekranı önizleyin. Çalışan yalnızca kendi bilgilerini, yönetici kendi bilgilerini ve ekibini
        görür; ücret, T.C. kimlik ve IBAN bilgileri ekip ekranında yer almaz. Önizlemede kayıt değiştirilemez.
      </p>
      <Secim
        etiket="Görünüm" value={rol} onChange={(e) => { rolYaz(e.target.value === 'yonetici' ? 'yonetici' : 'calisan'); }}
        secenekler={[
          { deger: 'calisan', baslik: 'Çalışan' },
          ...(yoneticiler.length ? [{ deger: 'yonetici', baslik: 'Yönetici' }] : []),
        ]}
      />
      <Secim
        etiket="Kişi" value={secili} onChange={(e) => { kisiYaz(e.target.value); }}
        secenekler={liste.map((p) => ({
          deger: p.id,
          baslik: rol === 'yonetici' ? `${adSoyad(p)} (${ekipSayisi(p.id)} kişi)` : `${adSoyad(p)} – ${p.pozisyon ?? ''}`,
        }))}
      />
    </Pencere>
  );
}
