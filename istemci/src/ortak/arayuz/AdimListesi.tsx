import { useId } from 'react';
import { DurumKutusu } from './DurumKutusu.tsx';
import { MiniHalka } from './Kuyruk.tsx';
import { Simge } from './Simge.tsx';
import './adim-listesi.css';

export interface ListeAdimi {
  id: number;
  ad: string;
  aciklama: string | null;
  tamam: boolean;
  // İşaretin kime ve ne zamana ait olduğu; metni ekran biçimler.
  not?: string | null;
}

interface Ozellikler {
  baslik?: string;
  // Gösterim sırasıyla; numara dizideki yerdir.
  adimlar: readonly ListeAdimi[];
  // Adımın yeni halini söyler: işaretle (true) ya da geri al (false).
  degistir?: (id: number, tamam: boolean) => void;
  // İşaretler görünür ama değiştirilemez (ör. yetkisiz kişi, bitmiş emir, süren istek).
  saltOkunur?: boolean;
  bosMesaj?: string;
}

export function AdimListesi({
  baslik = 'Talimat adımları', adimlar, degistir, saltOkunur = false, bosMesaj = 'Bu emirde adım yok',
}: Ozellikler) {
  const baslikKimlik = useId();
  if (adimlar.length === 0) return <DurumKutusu durum="bos" mesaj={bosMesaj} />;

  const kilitli = saltOkunur || degistir === undefined;
  const biten = adimlar.filter((a) => a.tamam).length;
  return (
    <div className="tc-adimlar" role="group" aria-labelledby={baslikKimlik}>
      <div className="tc-adimlar-ust">
        <MiniHalka oran={biten / adimlar.length} />
        <div>
          <h3 id={baslikKimlik} className="tc-adimlar-baslik">{baslik}</h3>
          <span className="tc-adimlar-sayac">{biten} / {adimlar.length} tamamlandı</span>
        </div>
      </div>
      {adimlar.map((a, sira) => (
        <button
          key={a.id}
          type="button"
          role="checkbox"
          aria-checked={a.tamam}
          aria-disabled={kilitli || undefined}
          className={a.tamam ? 'tc-adim tc-adim-tamam' : 'tc-adim'}
          onClick={kilitli ? undefined : () => { degistir(a.id, !a.tamam); }}
        >
          <span className="tc-adim-kutu" aria-hidden="true"><Simge ad="check" /></span>
          <span className="tc-adim-metin">
            <b>{sira + 1}. {a.ad}</b>
            {a.aciklama && <small>{a.aciklama}</small>}
            {a.not && <small className="tc-adim-not">{a.not}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}
