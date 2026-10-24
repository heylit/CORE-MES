import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { isSatiri, malzemeSatiri, saatMetni } from '../../../../../../arkon/web/src/data/buyuk-ekran.ts';
import { sayi, sure } from '../cekirdek/bicim.ts';
import { useSimdi } from '../veri/baglam.ts';
import { Cubuk } from '../hazirlik/index.tsx';
import { tonDurumu } from './kurallar.ts';
import { durumAdi, durumRengi } from './Parcalar.tsx';
import type { Gorev, Is, KontrolTakvimi } from './tipler.ts';

// Uzak mod (operator-parcalar.ts AwayView): uzaktan okunur dev sayaç. Dokunuş ya da tuş normal ekrana döndürür.
// Paketin 3B modeli Model3B (A5) gelene kadar çizilmez.
export function UzakMod({ is, gorev, D, since, istasyon, uyan }: { is: Is; gorev: Gorev | null; D: KontrolTakvimi; since: number; istasyon: string; uyan: () => void }) {
  const simdi = useSimdi(1000);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const oran = is.target > 0 ? Math.min(1, is.good / is.target) : 0;
  const satir = isSatiri(is.part, is.op);
  const malzeme = malzemeSatiri(is.pkg, is.part);
  const siradaki = D.due.length ? `ŞİMDİ · ${D.due[0]!.nom}` : D.next ? (D.next.v === 0 ? 'Üretime dönünce' : `${D.next.v} ${D.next.u}`) : '—';
  return createPortal(
    <div ref={ref} className="tc-ay1-uzak" data-durum={durumRengi(is.state)} role="dialog" aria-label="Uzak mod" tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); uyan(); }} onKeyDown={uyan}>
      <div className="tc-ay1-uzak-ust">
        <span className="tc-ay1-durum-adi"><i aria-hidden="true" />{durumAdi(is.state)}<span className="tc-ay1-mono" title="Bu durumda geçen süre">{sure((simdi - since) / 1000)}</span></span>
        <span className="tc-ay1-uzak-saat tc-ay1-mono">{saatMetni(simdi)}</span>
        <span className="tc-ay1-mono">{is.no}{istasyon ? ` · ${istasyon}` : ''}</span>
      </div>
      <div className="tc-ay1-uzak-govde">
        {satir ? <div className="tc-ay1-uzak-parca">{satir}</div> : null}
        {malzeme ? <div className="tc-ay1-uzak-malzeme tc-ay1-mono">{malzeme}</div> : null}
        <div className="tc-ay1-uzak-sayi"><span>{sayi(is.good)}</span><small>/ {sayi(is.target)}</small></div>
      </div>
      <Cubuk yuzde={oran * 100} ton="run" etiket="İlerleme" />
      <div className="tc-ay1-uzak-alt">
        <div><span className="tc-ay1-ust-yazi">Hurda</span><b data-durum="durdu">{is.scrap}</b></div>
        <div><span className="tc-ay1-ust-yazi">Kalan</span><b>{sure(Math.max(0, is.target - is.good) * (is.cycle || 30))}</b></div>
        <div><span className="tc-ay1-ust-yazi">Sıradaki kontrol</span><b>{siradaki}</b></div>
      </div>
      {gorev && !gorev.quiet ? <div className="tc-ay1-uzak-gorev" data-durum={tonDurumu(gorev.tone)}><Simge ad={gorev.icon} boyut="b" />{gorev.t}</div> : null}
      <span className="tc-ay1-soluk">Dokun · normal ekrana dön</span>
    </div>,
    document.body,
  );
}
