import { useState } from 'react';
import { Dugme, Kart, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import type { Komut } from '../akislar.ts';
import { ymLabel, ymLong } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useFinansKomutu } from '../veri.ts';
import { ilkKapanisAyi, KAPANIS_MADDELERI, KAPANIS_UCU, kapanisAylari, kapanisIlerlemesi } from './hesap.ts';
import { Cubuk, Not, Serit } from './parcalar.tsx';
import { RaporAraclari } from './RaporAraclari.tsx';
import './raporlar.css';

// Ay sonu kapanışı (prototip VIEWS.aysonu): on maddelik kontrol listesi, ay seçimi; işaret sunucuya tek komutla gider.
export function AyKapanisi({ finans, yetki, kayitGir }: EkranOzellikleri) {
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const [ay, setAy] = useState(() => (finans ? ilkKapanisAyi(finans.motor.bugun) : ''));
  if (!finans) return null;
  const isaretli = finans.motor.durum.closing[ay] ?? {};
  const n = kapanisIlerlemesi(isaretli), toplam = KAPANIS_MADDELERI.length;
  const isaretle = (madde: string, deger: boolean) => {
    const k: Komut = { uc: `POST ${KAPANIS_UCU}`, govde: { donem: ay, madde, isaretli: deger }, tekrar: false, basari: '' };
    komut.mutate({ komutlar: [k] }, { onError: (h) => bildir('hata', hataIletisi(h, 'Kapanış işaretlenemedi.')) });
  };
  return (
    <div className="tc-fr">
      <RaporAraclari>
        <Serit<string> etiket="Kapanış ayı" secenekler={kapanisAylari(finans.motor.bugun).map((x) => ({ deger: x, baslik: ymLabel(x) }))} secili={ay} sec={setAy} />
      </RaporAraclari>
      <Not>Her ay sonunda yapılması gereken kontroller. İşaretledikçe ilerleme kaydedilir.</Not>
      <Kart baslik={`${ymLong(ay)} kapanışı`} sag={<small className="tc-fr-soluk">{n} / {toplam} tamamlandı</small>}>
        <Cubuk oran={n / toplam} durum={n === toplam ? 'calisiyor' : undefined} etiket={`${n} / ${toplam} tamamlandı`} />
        <ul className="tc-fr-kontrol">
          {KAPANIS_MADDELERI.map(([k, ad, aciklama]) => (
            <li key={k}>
              <label className="tc-fr-isaret">
                <input
                  type="checkbox"
                  checked={!!isaretli[k]}
                  disabled={!yetki.yaz || komut.isPending}
                  onChange={(e) => isaretle(k, e.currentTarget.checked)}
                />
                <span><b>{ad}</b><small>{aciklama}</small></span>
              </label>
            </li>
          ))}
        </ul>
        {yetki.yaz && (
          <div className="tc-fr-dugmeler">
            <Dugme tur="ikincil" simge="building" onClick={() => kayitGir('banka')}>Banka bakiyesini eşitle</Dugme>
            <Dugme tur="ikincil" simge="clipboard-check" onClick={() => kayitGir('cekdurum')}>Çek durumlarını güncelle</Dugme>
          </div>
        )}
      </Kart>
    </div>
  );
}
