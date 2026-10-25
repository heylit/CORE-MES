import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { isSatiri, malzemeSatiri, modelDosyasi, saatMetni } from '../../../../../../arkon/web/src/data/buyuk-ekran.ts';
import type { Gorunum3B } from '../cizim/model.ts';
import { sayi, sure } from '../cekirdek/bicim.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import { Cubuk } from '../hazirlik/index.tsx';
import { tonDurumu } from './kurallar.ts';
import { durumAdi, durumRengi } from './Parcalar.tsx';
import type { Gorev, Is, KontrolTakvimi } from './tipler.ts';

// Uzak mod (operator-parcalar.ts AwayView): uzaktan okunur dev sayaç. Dokunuş ya da tuş normal ekrana döndürür.
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
        <UzakModel pkg={is.pkg} />
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

// Görüntüleyici ve model işleme ağırdır (three, geometri çekirdeği): yalnız uzak modda ve model varsa yüklenir.
const Model3B = lazy(async () => ({ default: (await import('../cizim/index.tsx')).Model3B }));

// Büyük ekranda paketin 3B modeli (operator-parcalar.ts AwayModel): yalnız hazır veri (paketle gelen ya da önbellekteki) varsa, yavaşça
// dönerek. Model burada hesaplatılmaz.
function UzakModel({ pkg }: { pkg: Is['pkg'] }) {
  const { depo } = useArkon();
  const [gorunum, gorunumYaz] = useState<{ data: Gorunum3B; fa: number } | null>(null);
  const dosya = pkg ? modelDosyasi(pkg.files, pkg.primary) : null;
  const bayt = dosya?.bytes;
  useEffect(() => {
    let canli = true;
    gorunumYaz(null);
    if (!pkg || !dosya || !bayt) return undefined;
    void Promise.all([import('../cizim/model.ts'), import('../cizim/kurallar.ts')])
      .then(([m, k]) => m.modelIsle(depo, bayt, dosya.name, () => undefined,
        { need: '3d', derived: (pkg.derived as Record<string, unknown> | undefined) ?? null, cfg: k.ayarDuzelt(pkg.readCfg), yalnizHazir: true }))
      .then((r) => { if (canli && r?.V) gorunumYaz({ data: r.V, fa: r.fa }); }, () => undefined);
    return () => { canli = false; };
    // Paket sürümü ve dosya değişince yeniden okunur (eskisi gibi).
  }, [pkg?.id, pkg?.version, dosya?.name]);
  if (gorunum === null) return null;
  return <div className="tc-ay1-uzak-3b"><Suspense fallback={null}><Model3B data={gorunum.data} fa={gorunum.fa} sade /></Suspense></div>;
}
