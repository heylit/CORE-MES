import { useState } from 'react';
import { Girdi, SayfaBasligi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { useKmKomutu } from '../veri.ts';
import { terimAra } from './sozluk.ts';
import './terimler.css';

export const TerimlerSayaci: KmSayaci = null;

// Ekranlardaki terim açıklamalarını açıp kapatmak firma ayarıdır (settings/genel); ayar yazmak yöneticinin işidir.
export function Terimler({ veri, yetki }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [sorgu, sorguYaz] = useState('');
  const [yaziyor, yaziyorYaz] = useState(false);
  const kapali = veri.ayarlar.terimKapali === true;
  const liste = terimAra(sorgu);

  const degistir = async () => {
    yaziyorYaz(true);
    try {
      await komut.ayarKaydet({ ...veri.ayarlar, terimKapali: !kapali });
      bildir('tamam', kapali ? 'Terim açıklamaları açıldı' : 'Ekranlardaki terim açıklamaları kapatıldı');
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Ayar kaydedilemedi.'));
    } finally {
      yaziyorYaz(false);
    }
  };

  return (
    <div className="tc-km1-terimler">
      <SayfaBasligi
        baslik="Terimler" simge="book"
        alt="Sistemde geçen kalite terimlerinin kısa açıklamaları. Ekranlarda altı noktalı çizgili terimlerin üzerine gelince veya dokununca da görünür."
        eylemler={yetki.ayar ? [{ anahtar: 'gizle', baslik: kapali ? 'Açıklamaları aç' : 'Ekranlarda gizle', simge: 'eye', pasif: yaziyor, sec: () => { void degistir(); } }] : []}
      />
      <div className="tc-km1-terim-ara">
        <Girdi etiket="Terim ara" type="search" placeholder="Terim ara" value={sorgu} onChange={(o) => { sorguYaz(o.target.value); }} />
      </div>
      <dl className="tc-km1-sozluk">
        {liste.map(([k, v]) => (
          <div key={k} className="tc-km1-terim">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
