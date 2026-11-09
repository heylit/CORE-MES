import { useNavigate } from 'react-router-dom';
import { Dugme, Simge } from '../../ortak/arayuz/index.ts';
import type { Alarm } from '#paylasilan/sozlesme/guvenlik.ts';
import type { Karar } from './karar.ts';

// Karar düğmesi kartın içinde (2231): alarmda bugünkü onay ve kapatma penceresi açılır, öbüründe ilgili sayfaya gidilir.
// Yeni işlem yoktur; düğmeler bugün var olan uçları çağırır.
// Sayfada tek birincil düğme kalsın diye yalnız listenin ilk (en önemli) kartı `oncelikli` alır; öbürlerinin düğmeleri ikincildir.
export function KararKarti({ karar, yonetir, incele, oncelikli = false }: {
  karar: Karar; yonetir: boolean; incele: (a: Alarm) => void; oncelikli?: boolean;
}) {
  const git = useNavigate();
  const baslikKimligi = `tc-guvenlik-karar-${karar.anahtar.replace(/[^a-z0-9]/gi, '-')}`;
  return (
    <article className="tc-guvenlik-karar" data-ton={karar.ton} aria-labelledby={baslikKimligi}>
      <span className="tc-guvenlik-karar-simge" aria-hidden="true"><Simge ad={karar.ton === 'hata' ? 'alert' : 'flag'} /></span>
      <div className="tc-guvenlik-karar-govde">
        <header>
          <h3 id={baslikKimligi}>{karar.baslik}</h3>
          <span className="tc-guvenlik-karar-onem">{karar.onem}</span>
          <span className="tc-guvenlik-karar-alan"><Simge ad={karar.alan === 'Sistem' ? 'cpu' : 'lock'} boyut="k" />{karar.alan}</span>
        </header>
        <dl className="tc-guvenlik-karar-uc">
          <div><dt>Ne oldu</dt><dd>{karar.ne}</dd></div>
          <div><dt>Ne demek</dt><dd>{karar.anlam}</dd></div>
          <div><dt>Ne yapmalı</dt><dd>{karar.oneri}</dd></div>
        </dl>
        {(karar.alarm !== null || karar.git !== null) && (
          <div className="tc-guvenlik-karar-dugmeler">
            {karar.alarm !== null && (
              <Dugme tur={oncelikli ? 'birincil' : 'ikincil'} simge={yonetir ? 'check' : 'eye'} onClick={() => { if (karar.alarm) incele(karar.alarm); }}>
                {yonetir ? 'İncele ve kapat' : 'İncele'}
              </Dugme>
            )}
            {karar.git !== null && (
              <Dugme tur={oncelikli && karar.alarm === null ? 'birincil' : 'ikincil'} simge={karar.git.simge} onClick={() => { if (karar.git) void git(karar.git.yol); }}>
                {karar.git.metin}
              </Dugme>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
