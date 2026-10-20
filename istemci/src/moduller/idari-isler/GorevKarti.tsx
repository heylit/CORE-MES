import type { AracGorevi } from '#paylasilan/sozlesme/idari-isler.ts';
import { Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { GOREV_DURUMU, gorevTarihleri, kmMetni } from './gorunum.ts';

// Araç görevleri ve Araç talebim satırı: varış, amaç, tarihler, talep eden, verilen araç ve km.
export function GorevKarti({ gorev, talepEdenGoster = false }: { gorev: AracGorevi; talepEdenGoster?: boolean }) {
  const yol = gorev.cikisKm !== null && gorev.donusKm !== null ? gorev.donusKm - gorev.cikisKm : null;
  return (
    <div className="tc-ii-talep">
      <span className="tc-ii-konu" aria-hidden="true"><Simge ad="route" /></span>
      <span className="tc-ii-govde">
        <span className="tc-ii-satir">
          <strong>{gorev.varis}</strong>
          <Rozet ton={GOREV_DURUMU[gorev.durum].ton}>{GOREV_DURUMU[gorev.durum].etiket}</Rozet>
          {gorev.plaka !== null && <span className="mono">{gorev.plaka}</span>}
        </span>
        <span className="tc-ii-yer">{gorev.amac}</span>
        <span className="tc-ii-soluk">
          <span className="mono">{gorevTarihleri(gorev)}</span>
          {talepEdenGoster && <> · {gorev.talepEdenAd ?? 'Bilinmeyen kişi'}</>}
          {gorev.cikisKm !== null && <> · Çıkış <span className="mono">{kmMetni(gorev.cikisKm)}</span> km</>}
          {yol !== null && <> · <span className="mono">{kmMetni(yol)}</span> km yol</>}
          {gorev.redNedeni !== null && <> · Red: {gorev.redNedeni}</>}
        </span>
      </span>
    </div>
  );
}
