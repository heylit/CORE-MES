import { Fragment } from 'react';
import {
  gecerlilikCizgileri, revizyonEtiketi, seriIpucu, seritKur, type Gecerlilik, type KonfigurasyonSerisi,
} from './analiz.ts';
import './analiz.css';

interface Ozellikler {
  seriler: readonly KonfigurasyonSerisi[];
  gecerlilikler: readonly Gecerlilik[];
  // Kısa görünüm (Görevlerim): açıklama kutusu çizilmez.
  kisa?: boolean;
  secili?: string | null;
  sec?: (seri: KonfigurasyonSerisi) => void;
}

// Her kutu bir seri numarası: renk mod seviyesini, dolgu durumu (sahada, stokta, üretimde, planlı) söyler; kırmızı çerçeve karantina ya da uyumsuz.
export function SeriSeridi({ seriler, gecerlilikler, kisa = false, secili = null, sec }: Ozellikler) {
  if (seriler.length === 0) return <p className="tc-dy-bos">Bu ürün için seri kaydı yok.</p>;
  const serit = seritKur(seriler);
  const cizgiler = new Map(gecerlilikCizgileri(serit.hucreler, gecerlilikler).map((c) => [c.konum, c.gecerlilik]));
  return (
    <div className="tc-dy-serit-kap">
      <div className="tc-dy-serit-kaydir">
        <ul className="tc-dy-serit" aria-label="Seri konfigürasyon şeridi">
          {serit.hucreler.map((h, i) => {
            const cizgi = cizgiler.get(i);
            const sinir = cizgi && (
              <li className="tc-dy-sinir" aria-label={`${cizgi.emirNo} geçerlilik: seri ${cizgi.ilkSeri} ve sonrası`}>
                <span className="tc-dy-sinir-yazi">{cizgi.emirNo} geçerlilik: {cizgi.ilkSeri}</span>
              </li>
            );
            if (h.tur === 'bos') {
              return <Fragment key={`b${h.sira}`}>{sinir}<li className="tc-dy-hucre" data-tur="yok" title={`${h.sira}: kayıt yok`} /></Fragment>;
            }
            const ipucu = seriIpucu(h.seri);
            const etiketli = h.sira !== null && (h.sira === 1 || h.sira % 5 === 0);
            return (
              <Fragment key={h.seri.seriNo}>
                {sinir}
                <li className="tc-dy-hucre-yer">
                  <button
                    type="button" className="tc-dy-hucre" data-tur={h.seri.durum ?? 'bilinmiyor'} data-renk={h.renk ?? 'yok'}
                    data-uyum={h.seri.uyum} data-karantina={h.seri.karantinada || undefined} aria-pressed={secili === h.seri.seriNo} title={ipucu} aria-label={ipucu}
                    disabled={!sec} onClick={() => sec?.(h.seri)}
                  >
                    {etiketli && <span className="tc-dy-hucre-no mono">{String(h.sira).padStart(4, '0')}</span>}
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </div>
      <dl className="tc-dy-serit-ozet">
        <div><dt>Sahada</dt><dd>{serit.durumlar.sahada}</dd></div>
        <div><dt>Stokta, sevke hazır</dt><dd>{serit.durumlar.stokta}</dd></div>
        <div><dt>Üretimde</dt><dd>{serit.durumlar.uretimde}</dd></div>
        <div><dt>Planlı</dt><dd>{serit.durumlar.planli}</dd></div>
        {serit.durumlar.bilinmiyor > 0 && <div><dt>Durum bilinmiyor</dt><dd>{serit.durumlar.bilinmiyor}</dd></div>}
        {serit.modlar.map((m) => (
          <div key={m.mod ?? '-'}>
            <dt>
              <span className="tc-dy-ornek" data-renk={m.renk ?? 'yok'} aria-hidden="true" />
              {m.mod === null ? 'Mod bilinmiyor' : `Mod ${m.mod}`}{m.revizyon !== null && ` ${revizyonEtiketi(m.revizyon).toLocaleLowerCase('tr')}`}
            </dt>
            <dd>{m.adet}</dd>
          </div>
        ))}
      </dl>
      {!kisa && (
        <ul className="tc-dy-aciklama">
          <li><span className="tc-dy-ornek" data-tur="sahada" aria-hidden="true" />Dolu: sahada</li>
          <li><span className="tc-dy-ornek" data-tur="stokta" aria-hidden="true" />Halka: stokta</li>
          <li><span className="tc-dy-ornek" data-tur="uretimde" aria-hidden="true" />Taralı: üretimde</li>
          <li><span className="tc-dy-ornek" data-tur="planli" aria-hidden="true" />Kesikli: planlı</li>
          <li><span className="tc-dy-ornek" data-uyum="uyumsuz" aria-hidden="true" />Kırmızı çerçeve: karantina veya uyumsuz</li>
          <li>Renk: mod seviyesi. Kutuya tıklayınca seri açılır.</li>
        </ul>
      )}
    </div>
  );
}
