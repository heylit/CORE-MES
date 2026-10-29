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
// 895 a (961 a prototipi): sayı ekranın büyük kısmı, iş bilgisi tek satır, 3B büyük. Üst şeritte durum, proje, saat, istasyon
// kutuları satırı doldurur; proje iş satırında değil üst şeritte durur ki uzun emir numarasıyla iş satırı kesilmesin.
// 1188: TMI işinde hurda kartı "Hatalı"dır (sunucunun adım toplamı; bilinmiyorsa null, "—"); TMI dışı işte hurda.
export function UzakMod({ is, gorev, D, since, istasyon, uyan, hatali }: {
  is: Is; gorev: Gorev | null; D: KontrolTakvimi; since: number | null; istasyon: string; uyan: () => void; hatali?: number | null;
}) {
  const simdi = useSimdi(1000);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const oran = is.target > 0 ? Math.min(1, is.good / is.target) : 0;
  const basliklar = uzakBasliklari(is);
  const proje = basliklar.find(([etiket]) => etiket === 'Proje');
  const alanlar = basliklar.filter(([etiket]) => etiket !== 'Proje');
  const sayiMetni = sayi(is.good);
  const siradaki = D.due.length ? `ŞİMDİ · ${D.due[0]!.nom}` : D.next ? (D.next.v === 0 ? 'Üretime dönünce' : `${D.next.v} ${D.next.u}`) : '—';
  const gorevVar = gorev !== null && !gorev.quiet;
  return createPortal(
    <div ref={ref} className="tc-ay1-uzak" data-durum={durumRengi(is.state)} role="dialog" aria-label="Uzak mod" tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); uyan(); }} onKeyDown={uyan}>
      <div className="tc-ay1-uzak-ust">
        <span className="tc-ay1-uzak-durum" role="status"><i aria-hidden="true" /><b>{durumAdi(is.state)}</b><Simge ad="clock" /><GecenSure since={since} /></span>
        {proje ? <span className="tc-ay1-uzak-cip tc-ay1-uzak-proje" title={proje[1]}><Simge ad={ALAN_SIMGESI.Proje!} /><span className="tc-gizli-etiket">Proje</span><b>{proje[1]}</b></span> : null}
        <span className="tc-ay1-uzak-cip tc-ay1-uzak-saat tc-ay1-mono">{saatMetni(simdi)}</span>
        <span className="tc-ay1-uzak-cip tc-ay1-uzak-istasyon"><Simge ad="cpu" /><span className="tc-gizli-etiket">İstasyon</span><b className="tc-ay1-mono">{istasyon}</b></span>
        {alanlar.length ? (
          <section className="tc-ay1-uzak-cip tc-ay1-uzak-is" aria-label="İş bilgisi">
            <dl>{alanlar.map(([etiket, deger]) => <UzakAlan key={etiket} etiket={etiket} deger={deger} />)}</dl>
          </section>
        ) : null}
      </div>
      <div className="tc-ay1-uzak-govde">
        <UzakModel pkg={is.pkg} />
        <section className="tc-ay1-uzak-kart tc-ay1-uzak-sayac" aria-label="Sayaç">
          <div className="tc-ay1-uzak-sayac-ust">
            <span className="tc-ay1-uzak-etiket"><Simge ad="check" boyut="k" /><span className="tc-ay1-ust-yazi">Üretilen</span></span>
            {is.target > 0 ? <span className="tc-ay1-uzak-hedef">Hedef <b className="tc-ay1-mono">{sayi(is.target)}</b></span> : null}
          </div>
          <div className="tc-ay1-uzak-orta"><span className="tc-ay1-uzak-sayi" data-hane={Math.min(9, sayiMetni.length)}>{sayiMetni}</span></div>
          <div className="tc-ay1-uzak-ilerleme">
            <Cubuk yuzde={oran * 100} ton="run" etiket="İlerleme" />
            {is.target > 0 ? <span className="tc-ay1-uzak-ilerleme-yazi"><b>%{Math.round(oran * 100)}</b><span><b>{sayi(Math.max(0, is.target - is.good))}</b> kaldı</span></span> : null}
          </div>
        </section>
      </div>
      <div className="tc-ay1-uzak-alt" data-gorev={gorevVar ? 'var' : 'yok'}>
        {gorev && gorevVar ? <div className="tc-ay1-uzak-gorev" data-durum={tonDurumu(gorev.tone)}><Simge ad={gorev.icon} boyut="b" /><span>{gorev.t}</span></div> : null}
        <div className="tc-ay1-uzak-kart" data-durum="durdu"><span className="tc-ay1-uzak-simge"><Simge ad="trash" /></span><span><span className="tc-ay1-ust-yazi">{hatali === undefined ? 'Hurda' : 'Hatalı'}</span><b>{hatali === undefined ? is.scrap : hatali ?? '—'}</b></span></div>
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

// Tek satırda simge ve değer; etiket ekran okuyucuya kalır (dt). Revizyon değerin önünde "Rev" diye okunur.
function UzakAlan({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="tc-ay1-uzak-alan" data-alan={etiket}>
      <dt><Simge ad={ALAN_SIMGESI[etiket] ?? 'tag'} /><span className="tc-gizli-etiket">{etiket}</span></dt>
      <dd className={ESARALIKLI.has(etiket) ? 'tc-ay1-mono' : undefined} title={deger}>{etiket === 'Rev' ? `Rev ${deger}` : deger}</dd>
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
  return (
    <section className="tc-ay1-uzak-kart tc-ay1-uzak-3b" aria-label="3B model">
      <Suspense fallback={null}><Model3B data={gorunum.data} fa={gorunum.fa} sade /></Suspense>
      <span className="tc-ay1-uzak-3b-not tc-ay1-ust-yazi"><Simge ad="cube" boyut="k" />3B model</span>
    </section>
  );
}
