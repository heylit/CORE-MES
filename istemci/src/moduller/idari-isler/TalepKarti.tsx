import type { Talep } from '#paylasilan/sozlesme/idari-isler.ts';
import { Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { DURUM, KATEGORI, gecenSure } from './gorunum.ts';

// Pano, Bugün ve Taleplerim'deki talep satırı: konu simgesi, yer, açan ve süre; acil talep işaretlidir.
export function TalepKarti({ talep, sec, durumGoster = false }: { talep: Talep; sec?: () => void; durumGoster?: boolean }) {
  const icerik = (
    <>
      <span className="tc-ii-konu" aria-hidden="true"><Simge ad={KATEGORI[talep.kategori].simge} /></span>
      <span className="tc-ii-govde">
        <span className="tc-ii-satir">
          <strong>{KATEGORI[talep.kategori].etiket}</strong>
          {talep.aciliyet === 'acil' && <Rozet ton="hata">Acil</Rozet>}
          {durumGoster && <Rozet ton={DURUM[talep.durum].ton}>{DURUM[talep.durum].etiket}</Rozet>}
        </span>
        <span className="tc-ii-yer">{talep.yer}</span>
        <span className="tc-ii-soluk">
          <span className="mono">{talep.no}</span> · {talep.acanAd ?? 'Bilinmeyen kişi'} · {gecenSure(talep.acilma)}
          {talep.ustlenenAd !== null && talep.durum === 'yapiliyor' && <> · Üstlenen: {talep.ustlenenAd}</>}
        </span>
      </span>
    </>
  );
  return sec === undefined
    ? <div className="tc-ii-talep" data-acil={talep.aciliyet === 'acil' ? '' : undefined}>{icerik}</div>
    : (
      <button type="button" className="tc-ii-talep" data-acil={talep.aciliyet === 'acil' ? '' : undefined} onClick={sec}>
        {icerik}
        <span className="tc-ii-git" aria-hidden="true"><Simge ad="chev-right" boyut="k" /></span>
      </button>
    );
}
