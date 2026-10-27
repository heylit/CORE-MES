import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { modelDosyasi, saatMetni } from '../../../../../../arkon/web/src/data/buyuk-ekran.ts';
import type { Gorunum3B } from '../../../../ortak/cizim/model.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { sayi } from '../cekirdek/bicim.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import { baytiVar, useCozulmus } from '../veri/dosyalar.ts';
import { Cubuk } from '../hazirlik/index.tsx';
import { tonDurumu } from './kurallar.ts';
import { durumAdi, durumRengi } from './Parcalar.tsx';
import { GecenSure } from './DurumSuresi.tsx';
import './uzak.css';
import type { Gorev, Is, KontrolTakvimi } from './tipler.ts';

// Uzak mod (operator-parcalar.ts AwayView): uzaktan okunur dev sayaç. Dokunuş ya da tuş normal ekrana döndürür.
// 804: üst şerit üç çerçeveli çip; iş bilgisi tek çerçevede ikonlu alanlar, etiket üstte değer altta; sayaç kendi çerçevesinde.
export function UzakMod({ is, gorev, D, since, istasyon, uyan }: { is: Is; gorev: Gorev | null; D: KontrolTakvimi; since: number | null; istasyon: string; uyan: () => void }) {
  const simdi = useSimdi(1000);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const oran = is.target > 0 ? Math.min(1, is.good / is.target) : 0;
  const basliklar = uzakBasliklari(is);
  const emir = basliklar.find(([etiket]) => etiket === 'Üretim emri');
  const alanlar = basliklar.filter(([etiket]) => etiket !== 'Üretim emri');
  const siradaki = D.due.length ? `ŞİMDİ · ${D.due[0]!.nom}` : D.next ? (D.next.v === 0 ? 'Üretime dönünce' : `${D.next.v} ${D.next.u}`) : '—';
  return createPortal(
    <div ref={ref} className="tc-ay1-uzak" data-durum={durumRengi(is.state)} role="dialog" aria-label="Uzak mod" tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); uyan(); }} onKeyDown={uyan}>
      <div className="tc-ay1-uzak-ust">
        <span className="tc-ay1-uzak-durum" role="status"><i aria-hidden="true" /><b>{durumAdi(is.state)}</b><Simge ad="clock" /><GecenSure since={since} /></span>
        <span className="tc-ay1-uzak-cip tc-ay1-uzak-saat tc-ay1-mono">{saatMetni(simdi)}</span>
        <span className="tc-ay1-uzak-cip tc-ay1-uzak-istasyon"><Simge ad="cpu" /><span><small className="tc-ay1-ust-yazi">İstasyon</small><b className="tc-ay1-mono">{istasyon}</b></span></span>
      </div>
      <div className="tc-ay1-uzak-govde">
        {basliklar.length ? (
          <section className="tc-ay1-uzak-kart tc-ay1-uzak-bilgi" aria-label="İş bilgisi">
            {emir ? <dl className="tc-ay1-uzak-emir"><UzakAlan etiket={emir[0]} deger={emir[1]} /></dl> : null}
            {alanlar.length ? <dl className="tc-ay1-uzak-alanlar">{alanlar.map(([etiket, deger]) => <UzakAlan key={etiket} etiket={etiket} deger={deger} />)}</dl> : null}
          </section>
        ) : null}
        <section className="tc-ay1-uzak-kart tc-ay1-uzak-sayac" aria-label="Sayaç">
          <span className="tc-ay1-uzak-etiket"><Simge ad="check" boyut="k" /><span className="tc-ay1-ust-yazi">Üretilen / hedef</span></span>
          <div className="tc-ay1-uzak-orta">
            <UzakModel pkg={is.pkg} />
            <span className="tc-ay1-uzak-oran"><span className="tc-ay1-uzak-sayi">{sayi(is.good)}</span><small className="tc-ay1-uzak-hedef">/ {sayi(is.target)}</small></span>
          </div>
          <Cubuk yuzde={oran * 100} ton="run" etiket="İlerleme" />
          {is.target > 0 ? <span className="tc-ay1-uzak-ilerleme"><span>%{Math.round(oran * 100)}</span><span>{sayi(Math.max(0, is.target - is.good))} kaldı</span></span> : null}
        </section>
      </div>
      {gorev && !gorev.quiet ? <div className="tc-ay1-uzak-gorev" data-durum={tonDurumu(gorev.tone)}><Simge ad={gorev.icon} boyut="b" />{gorev.t}</div> : null}
      <div className="tc-ay1-uzak-alt">
        <div className="tc-ay1-uzak-kart" data-durum="durdu"><span className="tc-ay1-uzak-simge"><Simge ad="trash" /></span><span><span className="tc-ay1-ust-yazi">Hurda</span><b>{is.scrap}</b></span></div>
        <div className="tc-ay1-uzak-kart" data-durum="bitti"><span className="tc-ay1-uzak-simge"><Simge ad="ruler" /></span><span><span className="tc-ay1-ust-yazi">Sıradaki kontrol</span><b>{siradaki}</b></span></div>
      </div>
      <span className="tc-ay1-soluk"><Simge ad="eye" boyut="k" />Dokun · normal ekrana dön</span>
    </div>,
    document.body,
  );
}

// Alanın simgesi başlığa göre; parça no ve emir eş aralıklı yazılır (okunurken karakter karışmasın).
const ALAN_SIMGESI: Record<string, SimgeAdi> = { 'Üretim emri': 'file', Proje: 'gantt', Op: 'route', 'Parça no': 'tag', 'Parça adı': 'cube', Rev: 'layers' };
const ESARALIKLI = new Set(['Üretim emri', 'Parça no']);

// dl içinde: simge ve etiket dt'de (ızgarada dt kutusuz), değer dd'de; simge iki satır boyu solda durur.
function UzakAlan({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="tc-ay1-uzak-alan" data-alan={etiket}>
      <dt><span className="tc-ay1-uzak-simge"><Simge ad={ALAN_SIMGESI[etiket] ?? 'tag'} /></span><span className="tc-ay1-ust-yazi">{etiket}</span></dt>
      <dd className={ESARALIKLI.has(etiket) ? 'tc-ay1-mono' : undefined} title={deger}>{deger}</dd>
    </div>
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
  const dosya0 = pkg ? modelDosyasi(pkg.files, pkg.primary) : null;
  // Paket dosyasız gelir (kart #731): model dosyası ve hazır veri burada baytlanır.
  const cozuk = useCozulmus(depo, pkg && dosya0 ? { dosya: dosya0, derived: pkg.derived } : null, pkg && dosya0 ? pkg.id + ':' + pkg.version + ':' + dosya0.name : '');
  const bayt = cozuk && baytiVar(cozuk.dosya.bytes) ? cozuk.dosya.bytes : null;
  useEffect(() => {
    let canli = true;
    gorunumYaz(null);
    if (!pkg || !cozuk || !bayt) return undefined;
    void Promise.all([import('../../../../ortak/cizim/model.ts'), import('../../../../ortak/cizim/kurallar.ts')])
      .then(([m, k]) => m.modelIsle(depo, bayt, cozuk.dosya.name, () => undefined,
        { need: '3d', derived: (cozuk.derived as Record<string, unknown> | undefined) ?? null, cfg: k.ayarDuzelt(pkg.readCfg), yalnizHazir: true }))
      .then((r) => { if (canli && r?.V) gorunumYaz({ data: r.V, fa: r.fa }); }, () => undefined);
    return () => { canli = false; };
    // Paket sürümü ve dosya değişince yeniden okunur (eskisi gibi); dosya çözülünce de.
  }, [pkg?.id, pkg?.version, dosya0?.name, cozuk]);
  if (gorunum === null) return null;
  return <div className="tc-ay1-uzak-3b"><Suspense fallback={null}><Model3B data={gorunum.data} fa={gorunum.fa} sade /></Suspense></div>;
}
