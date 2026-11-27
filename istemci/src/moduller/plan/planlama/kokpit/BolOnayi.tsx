import { createPortal } from 'react-dom';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { BOL_UYGULA_KISA, type BolOnizlemesi } from './bol-onizleme.ts';

// 3792: Planda böl önizlemesinin alt onay çubuğu (3531 b ile aynı dil) ve telefondaki "yalnız etkilenen tezgâhlar" süzgeci. Düzenle yalnız burada durur.

// Ortak simge setinde makas yok; Simge ile aynı çizim ölçüleri (24x24, 2 px çizgi, currentColor).
export function MakasSimgesi() {
  return (
    <svg className="tc-simge tc-simge-k" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" data-makas="">
      <path d="M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" />
    </svg>
  );
}

export function BolOnayi({ o, duzenle, vazgec, uygula, bekle }: { o: BolOnizlemesi; duzenle: () => void; vazgec: () => void; uygula: () => void; bekle: boolean }) {
  return (
    <>
      <div className="tc-pyq-alt-bosluk" aria-hidden="true" />
      {createPortal(
        <div className="tc-pyq-ipucu tc-pyq-tasima-onayi tc-pyq-alt-panel tc-pyq-bol-onayi" role="group" aria-label="Bölmeyi onayla" data-bol-onayi="">
          <b className="tc-pyq-onay-tur" data-onay-tur="bol"><MakasSimgesi /> Böl</b>
          <span role="status">
            <span className="tc-pyq-bol-uzun" data-bol-cumle="uzun">{o.cumle}</span>
            <span className="tc-pyq-bol-kisa" data-bol-cumle="kisa">{o.kisa}</span>
            <small className="tc-pyq-bol-not" data-bol-not="">{BOL_UYGULA_KISA}</small>
          </span>
          <Dugme simge="edit" disabled={bekle} onClick={duzenle}>Düzenle</Dugme>
          <Dugme disabled={bekle} onClick={vazgec}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={bekle} onClick={uygula} autoFocus>Uygula</Dugme>
        </div>,
        document.body,
      )}
    </>
  );
}

export function BolSuzgeci({ say, suz, sec }: { say: number; suz: boolean; sec: (s: boolean) => void }) {
  return (
    <div className="tc-pyq-bol-suzgec" role="group" aria-label="Önizleme tezgâhları">
      <button type="button" className="tc-pyq-ok" aria-pressed={suz} data-bol-suz="etkilenen" onClick={() => { sec(true); }}><Simge ad="eye" boyut="k" />{`Yalnız etkilenen ${String(say)} tezgâh`}</button>
      <button type="button" className="tc-pyq-ok" aria-pressed={!suz} data-bol-suz="hepsi" onClick={() => { sec(false); }}>Bütün tezgâhlar</button>
    </div>
  );
}
