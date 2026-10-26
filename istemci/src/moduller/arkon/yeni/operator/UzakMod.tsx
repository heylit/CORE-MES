import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { modelDosyasi, saatMetni } from '../../../../../../arkon/web/src/data/buyuk-ekran.ts';
import type { Gorunum3B } from '../../../../ortak/cizim/model.ts';
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
  const basliklar = uzakBasliklari(is);
  const siradaki = D.due.length ? `ŞİMDİ · ${D.due[0]!.nom}` : D.next ? (D.next.v === 0 ? 'Üretime dönünce' : `${D.next.v} ${D.next.u}`) : '—';
  return createPortal(
    <div ref={ref} className="tc-ay1-uzak" data-durum={durumRengi(is.state)} role="dialog" aria-label="Uzak mod" tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); uyan(); }} onKeyDown={uyan}>
      <div className="tc-ay1-uzak-ust">
        <span className="tc-ay1-durum-adi"><i aria-hidden="true" />{durumAdi(is.state)}<span className="tc-ay1-mono" title="Bu durumda geçen süre">{sure((simdi - since) / 1000)}</span></span>
        <span className="tc-ay1-uzak-saat tc-ay1-mono">{saatMetni(simdi)}</span>
        <span className="tc-ay1-uzak-istasyon tc-ay1-mono">{istasyon}</span>
      </div>
      <div className="tc-ay1-uzak-govde">
        {basliklar.length ? (
          <dl className="tc-ay1-uzak-basliklar">
            {basliklar.map(([etiket, deger]) => <div key={etiket}><dt className="tc-ay1-ust-yazi">{etiket}</dt><dd title={deger}>{deger}</dd></div>)}
          </dl>
        ) : null}
        <div className="tc-ay1-uzak-orta">
          <UzakModel pkg={is.pkg} />
          <span className="tc-ay1-uzak-sayi">{sayi(is.good)}</span>
          <small className="tc-ay1-uzak-hedef">/ {sayi(is.target)}</small>
        </div>
      </div>
      <Cubuk yuzde={oran * 100} ton="run" etiket="İlerleme" />
      <div className="tc-ay1-uzak-alt">
        <div><span className="tc-ay1-ust-yazi">Hurda</span><b data-durum="durdu">{is.scrap}</b></div>
        <div><span className="tc-ay1-ust-yazi">Sıradaki kontrol</span><b>{siradaki}</b></div>
      </div>
      {gorev && !gorev.quiet ? <div className="tc-ay1-uzak-gorev" data-durum={tonDurumu(gorev.tone)}><Simge ad={gorev.icon} boyut="b" />{gorev.t}</div> : null}
      <span className="tc-ay1-soluk">Dokun · normal ekrana dön</span>
    </div>,
    document.body,
  );
}

// Uzak mod başlıkları kullanıcının verdiği sırayla: proje, üretim emri, op, parça no, parça adı, revizyon. Boş alan yazılmaz;
// `pkg.proje` (proje adı) projesiz emirde boş metindir, alanı henüz taşımayan pakette yoktur.
// `no` sunucuda üretim emrinin numarasıdır (iş emrinin ayrı numarası yok).
export function uzakBasliklari(is: Pick<Is, 'no' | 'op' | 'part' | 'pkg'>): [string, string][] {
  const proje = (is.pkg as { proje?: unknown } | undefined)?.proje;
  const satirlar: [string, unknown][] = [['Proje', proje], ['Üretim emri', is.no], ['Op', is.op], ['Parça no', is.pkg?.partNo], ['Parça adı', is.part], ['Rev', is.pkg?.rev]];
  return satirlar.flatMap(([etiket, deger]) => (typeof deger === 'string' && !['', '—'].includes(deger.trim()) ? [[etiket, deger.trim()] as [string, string]] : []));
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
    void Promise.all([import('../../../../ortak/cizim/model.ts'), import('../../../../ortak/cizim/kurallar.ts')])
      .then(([m, k]) => m.modelIsle(depo, bayt, dosya.name, () => undefined,
        { need: '3d', derived: (pkg.derived as Record<string, unknown> | undefined) ?? null, cfg: k.ayarDuzelt(pkg.readCfg), yalnizHazir: true }))
      .then((r) => { if (canli && r?.V) gorunumYaz({ data: r.V, fa: r.fa }); }, () => undefined);
    return () => { canli = false; };
    // Paket sürümü ve dosya değişince yeniden okunur (eskisi gibi).
  }, [pkg?.id, pkg?.version, dosya?.name]);
  if (gorunum === null) return null;
  return <div className="tc-ay1-uzak-3b"><Suspense fallback={null}><Model3B data={gorunum.data} fa={gorunum.fa} sade /></Suspense></div>;
}
