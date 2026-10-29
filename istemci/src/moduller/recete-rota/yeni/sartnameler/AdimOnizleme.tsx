import type { TalimatAdimi } from '#paylasilan/sozlesme/rota.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { kontrolOzeti, medyaAdresi } from './kurallar.ts';

// Şablon önizlemesinin adım kartı (prototip Main): numara, ilk resim ya da video, başlık, metin ve kontrol noktası çipi.
export function AdimOnizleme({ adimlar }: { adimlar: readonly TalimatAdimi[] }) {
  return (
    <ol className="tc-st-onizleme">
      {adimlar.map((a) => {
        const ilk = a.medya[0];
        const kontrol = kontrolOzeti(a.kontrol);
        return (
          <li key={a.sira} className="tc-st-kart">
            <span className="tc-st-no">{a.sira}</span>
            <div className="tc-st-kucuk">
              {ilk === undefined && (
                <span className="tc-st-kucuk-bos">
                  <Simge ad={a.kontrol.tur === 'foto' ? 'camera' : 'file'} />
                  {a.kontrol.tur === 'foto' ? 'Operatör çeker' : 'Medya yok'}
                </span>
              )}
              {ilk?.tur === 'resim' && <img src={medyaAdresi(ilk.ozet)} alt={ilk.ad} loading="lazy" />}
              {ilk?.tur === 'video' && (
                <span className="tc-st-kucuk-bos" role="img" aria-label={`Video: ${ilk.ad}`}><Simge ad="play" />Video</span>
              )}
              {a.medya.length > 1 && <span className="tc-st-sayi">{`+${String(a.medya.length - 1)}`}</span>}
            </div>
            <div className="tc-st-adim-metin">
              <strong>{a.baslik}</strong>
              {a.metin && <span className="tc-st-soluk">{a.metin}</span>}
              {kontrol && (
                <span className="tc-st-cip"><Simge ad="check" boyut="k" />{a.zorunlu ? `${kontrol} · zorunlu` : kontrol}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
