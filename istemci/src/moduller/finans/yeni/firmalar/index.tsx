import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { FirmaFormu } from './FirmaFormu.tsx';
import { FirmaKarti } from './FirmaKarti.tsx';
import { FirmaListesi, ILK_SUZGEC, type ListeSuzgeci } from './FirmaListesi.tsx';
import '../kayitlar/kayitlar.css';
import './firmalar.css';

// Firmalar (prototipte firmalar ve firmad görünümleri). Açık kart adreste durur (?firma=<id>): Kayıtlar'daki cari adı
// buraya bağlanır; "Firmalar" düğmesi listeye döner. Rakam yetkisi olmayan (yalnız musteri-tedarikci.oku) rakamsız liste ve kart görür.
export function Firmalar(oz: EkranOzellikleri) {
  const [arama, aramaYaz] = useSearchParams();
  const [yeni, yeniYaz] = useState(false);
  const [suzgec, suzgecYaz] = useState<ListeSuzgeci>(ILK_SUZGEC);
  const id = Number(arama.get('firma'));
  const ac = (firmaId: number) => aramaYaz({ firma: String(firmaId) });

  return (
    <>
      {Number.isInteger(id) && id > 0
        ? <FirmaKarti key={id} id={id} {...oz} geri={() => aramaYaz({})} />
        : <FirmaListesi finans={oz.finans} yetki={oz.yetki} ac={ac} yeni={() => yeniYaz(true)} s={suzgec} sYaz={suzgecYaz} />}
      {yeni && oz.yetki.firmaYaz && <FirmaFormu firma={null} kapat={() => yeniYaz(false)} kaydedildi={(f) => { yeniYaz(false); ac(f.id); }} />}
    </>
  );
}
