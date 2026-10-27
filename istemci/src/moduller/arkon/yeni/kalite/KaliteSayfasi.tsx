import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ILETI_GITMEDI } from '../../../../../../arkon/web/src/data/gonderim-hatasi.ts';
import type { KmOlcum } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import type { Meas, Pkg, PkgFile, PlanItem, SampleRequest } from '../../../../../../arkon/shared/model.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { KaliteFormu, useEmirOlcumleri } from '../../../kalite-merkezi/disari.ts';
import { sayi, sure } from '../cekirdek/bicim.ts';
import { bip } from '../cekirdek/ses.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import { baytiVar, useCozulmus } from '../veri/dosyalar.ts';
import type { TeknikResimKontrolu } from '../cizim/index.tsx';
import { Cip, SayfaCercevesi, Secmeli, onayBekliyor, useSoyle } from '../pano/index.tsx';
import { NUMUNE_DURUMLARI, acikNumuneMi, yontem } from './kurallar.ts';
import { OlcuAletleri } from './OlcuAletleri.tsx';
import { Onaylar } from './Onaylar.tsx';
import { SpcGorunumu } from './SpcGorunumu.tsx';

// Kalite · numuneler (789, 798): Hazırlık menüsünden açılan sayfa salt okunurdur. Ölçüm tek kalite formudur (Kalite Merkezi kaydı): terminal
// "Ölç" ile ya da Kalite Merkezi'nde girilir; ilk parça kararı yalnız Kalite Merkezi'nde, periyodik numunenin kararı terminal kalite
// istasyonunda verilir. Burada numune sırası, resim ve ölçümler görünür; SPC, paket onayı ve ölçü aletleri sekmeleri yerinde kalır.

// Çizim parçası (A5) ağırdır; yalnız numune seçilince yüklenir.
const TeknikResim = lazy(async () => ({ default: (await import('../cizim/index.tsx')).TeknikResim }));
// Baytı gelmemiş dosya kaydı (yalnız ad ve boy) resimde açılamaz; görüntüleyici onu atlar, dosya yoksa "Doküman yok" görünür.
const baytli = (l: readonly PkgFile[]): TeknikResimKontrolu['dosyalar'] => l.filter((f): f is TeknikResimKontrolu['dosyalar'][number] => baytiVar(f.bytes));
const BOS_OLCUM: readonly KmOlcum[] = [];

type Kip = 'samples' | 'spc' | 'onay' | 'alet';
type Gorunum = 'list' | 'draw' | 'form';

// Eski QTop kısayolları: Operatör ve Üretim Terminali Hazırlık.
const KALITE_KISAYOLLARI = [
  { sayfa: 'operator', simge: 'gauge', metin: 'Operatör' },
  { sayfa: 'hazirlik', simge: 'layers', metin: 'Üretim Terminali Hazırlık', yalnizSimge: true },
] as const;

function SaltOkunurNotu() {
  const kaliteMerkezi = useYetki().var('sayfa.kalite-merkezi');
  return (
    <p className="tc-ay3-not" role="note">
      <Simge ad="check" /> Bu sayfa salt okunur. Ölçüm terminalde &quot;Ölç&quot; ile ya da Kalite Merkezi'nde girilir; ilk parça kararı Kalite Merkezi'nde
      {kaliteMerkezi && <> · <Link to="/kalite-merkezi">Kalite Merkezi'ni aç</Link></>}
    </p>
  );
}

// Numunenin Kalite Merkezi numunesi (798); sunucu numuneyi açarken yazar. Eski numunede yoktur.
const kmNumunesi = (r: SampleRequest): number | null => { const v = (r as { kmNumune?: unknown }).kmNumune; return typeof v === 'number' ? v : null; };

// Kalite Merkezi ölçümü Arkon'un ölçü biçiminde: numunenin balonundaki son ölçüm. Numunesi bağlı değilse eski numune kaydı okunur.
export function numuneOlcumleri(r: SampleRequest, items: readonly PlanItem[], km: readonly KmOlcum[]): Record<number, Meas> {
  const numune = kmNumunesi(r);
  if (numune === null) return Object.fromEntries(items.flatMap((b) => { const m = r.results?.[b.id]; return m ? [[b.id, m]] : []; }));
  const sonuc: Record<number, Meas> = {};
  for (const b of items) {
    const balon = typeof b['kmBalon'] === 'number' ? b['kmBalon'] : null;
    const son = km.filter((o) => o.numuneId === numune && o.balonId === balon).sort((a, c) => c.id - a.id)[0];
    if (son) sonuc[b.id] = { v: son.deger !== null ? Number(son.deger) : son.nitel === 'gecer' ? 'Geçer' : 'Geçmez', ok: son.uygun, by: son.kisi ?? '', src: son.kaynak };
  }
  return sonuc;
}

export function KaliteSayfasi() {
  const { depo, yetkiVar } = useArkon();
  const soyle = useSoyle();
  const [kip, kipYaz] = useState<Kip>('samples');
  const [gor, gorYaz] = useState<Gorunum>('list');
  const [reqs, reqsYaz] = useState<SampleRequest[]>([]);
  const [pkgs, pkgsYaz] = useState<Record<string, Pkg>>({});
  const [selId, selIdYaz] = useState<string | null>(null);
  const [view, viewYaz] = useState<'open' | 'done'>('open');
  const [mf, mfYaz] = useState<'all' | 'man' | 'cmm'>('all');
  const simdi = useSimdi(1000);

  useEffect(() => {
    const f = (e: Event) => soyle(`${ILETI_GITMEDI} · ${(e as CustomEvent<{ msg?: string }>).detail?.msg || ''}`, 'bilgi');
    window.addEventListener('arkon-ileti-gitmedi', f);
    return () => window.removeEventListener('arkon-ileti-gitmedi', f);
  }, [soyle]);

  const reload = useCallback(async () => {
    const rs = ((await depo.DB.all('requests')) as SampleRequest[]).sort((a, b) => a.at - b.at);
    reqsYaz(rs);
    const ps = (await depo.DB.all('pkgs')) as Pkg[];
    pkgsYaz(Object.fromEntries(ps.map((p) => [p.id, p])));
    return rs;
  }, [depo]);
  // Açılışta ilk açık numune seçilir; sayfa hiçbir şey yazmaz.
  useEffect(() => {
    void reload().then((rs) => { const ilk = rs.find(acikNumuneMi); if (ilk) selIdYaz((s) => s ?? ilk.id); });
    return depo.Bus.on((m) => {
      if (m.type === 'pkg-approval' || m.type === 'pkg-approved' || m.type === 'pkg') {
        void reload();
        if (m.type === 'pkg-approval') { bip('call'); soyle(`Onay bekleyen paket: ${String(m.no ?? '')}`, 'bilgi'); }
      }
      if (m.type === 'sample' || m.type === 'sample-result') void reload();
    });
  }, [depo, reload, soyle]);

  const r = reqs.find((x) => x.id === selId);
  const p = r ? pkgs[r.pkgId] : undefined;
  const items = useMemo((): PlanItem[] => (r && p ? r.items.map((id) => p.plan.find((b) => b.id === id)).filter((b): b is PlanItem => !!b) : []), [r, p]);
  const emirId = p?.tmi?.emirId ?? null;
  const kmOlcumleri = useEmirOlcumleri(r && kmNumunesi(r) !== null ? emirId : null);
  const results = useMemo(() => (r ? numuneOlcumleri(r, items, kmOlcumleri.data?.olcumler ?? BOS_OLCUM) : {}), [r, items, kmOlcumleri.data]);
  const sec = (id: string) => { selIdYaz(id); gorYaz('form'); };

  // Paket listesi dosyasız gelir (kart #731): numunenin paketinin dosyaları burada baytlanır. Kalite Merkezi'ne bağlı pakette resim ve
  // ölçümler kalite formundan (salt okunur) gelir.
  const kmParcasi = p && typeof p.malzemeNo === 'number' && emirId !== null ? { malzemeNo: p.malzemeNo, emirId } : null;
  const pkgAnahtari = r && p && !kmParcasi ? r.id + ':' + p.id + ':' + p.version : '';
  const acikDosyalar = useCozulmus(depo, r && p && !kmParcasi ? { files: p.files, derived: p.derived } : null, pkgAnahtari);
  const kontrol = useMemo((): TeknikResimKontrolu | null => (r && p ? {
    anahtar: 'q:' + r.id + (acikDosyalar ? '' : ':bekliyor'), dosyalar: acikDosyalar ? baytli(acikDosyalar.files) : [], anaResim: p.primary,
    hazirVeri: acikDosyalar?.derived ?? null, ayar: p.readCfg,
    balonlar: p.plan as TeknikResimKontrolu['balonlar'], balonlarYaz: () => undefined, saltOkunur: true, ozellikGizli: true, olcumYok: true,
    olcumler: results as unknown as TeknikResimKontrolu['olcumler'], olcumlerYaz: () => undefined,
  } : null), [r?.id, results, p?.id, acikDosyalar]);
  const salt = useCallback(async () => {}, []);

  const acik = reqs.filter(acikNumuneMi);
  const biten = reqs.filter((x) => !acikNumuneMi(x)).reverse();
  const liste = view === 'open' ? acik : biten;
  const nMeas = items.filter((b) => results[b.id]).length;
  const nBad = items.filter((b) => results[b.id] && !results[b.id]!.ok).length;

  const kipler = useMemo(() => ([
    { k: 'samples' as const, etiket: 'Numuneler', acik: true }, { k: 'spc' as const, etiket: 'SPC · rapor', acik: yetkiVar('q.report') },
    { k: 'onay' as const, etiket: 'Onaylar', acik: yetkiVar('pkg.approve') }, { k: 'alet' as const, etiket: 'Ölçü aletleri', acik: yetkiVar('gauge.edit') || yetkiVar('q.meas') },
  ]), [yetkiVar]);
  const nAp = Object.values(pkgs).filter(onayBekliyor).length;
  const ek = (
    <>
      {acik.length > 0 && <Cip renk="hold">{acik.length} numune bekliyor</Cip>}
      <Secmeli etiket="Kalite görünümü" deger={kip} degistir={kipYaz}
        secenekler={kipler.filter((x) => x.acik).map((x) => ({ k: x.k, etiket: x.etiket, sayi: x.k === 'onay' ? nAp || null : null }))} />
    </>
  );
  const bekleme = (x: SampleRequest) => sure(((x.decidedAt || simdi) - x.at) / 1000);
  const ncmm = items.filter((b) => yontem(b) === 'cmm').length;
  const gorunenler = items.filter((b) => mf === 'all' || yontem(b) === mf).sort((x, y) => (mf === 'all' ? Number(yontem(x) === 'cmm') - Number(yontem(y) === 'cmm') : 0));

  return (
    <SayfaCercevesi simge="target" baslik="Kalite · numuneler" renk="done" ek={ek} kisayollar={KALITE_KISAYOLLARI} saatAlt="Kalite laboratuvarı">
      {kip === 'spc' ? <SpcGorunumu paketler={pkgs} numuneler={reqs} soyle={soyle} />
        : kip === 'onay' ? <Onaylar paketler={pkgs} soyle={soyle} />
        : kip === 'alet' ? <OlcuAletleri soyle={soyle} />
        : (
          <div className="tc-ay4-kalite" data-gorunum={gor}>
            <div className="tc-ay4-mobil">
              <Secmeli etiket="Kalite bölümü" deger={gor} degistir={gorYaz} secenekler={[{ k: 'list', etiket: `Sıra · ${acik.length}` }, { k: 'draw', etiket: 'Resim' }, { k: 'form', etiket: 'Ölçüm' }]} />
            </div>
            <section className="tc-ay4-sira tc-ay3-sayfa" aria-label="Numune sırası">
              <Secmeli etiket="Numune listesi" deger={view} degistir={viewYaz} secenekler={[{ k: 'open', etiket: `Bekleyen · ${acik.length}` }, { k: 'done', etiket: `Tamamlanan · ${biten.length}` }]} />
              {liste.length ? liste.map((x) => (
                <button key={x.id} type="button" className="tc-ay3-kutu tc-ay4-numune" aria-pressed={x.id === selId} onClick={() => sec(x.id)}>
                  <span><b>{x.no}</b> <small className="tc-ay3-not">Rev {x.rev}</small></span>
                  <span>{x.part}</span>
                  <small className="tc-ay3-not"><b>{x.machine}</b> · {x.by} · {x.reason} · {x.items.length} ölçü</small>
                  <span className="tc-ay3-dugmeler">
                    <Cip renk={NUMUNE_DURUMLARI[x.status].renk}>{NUMUNE_DURUMLARI[x.status].etiket}</Cip>
                    {x.crit && <Cip renk="stop">Kritik</Cip>}
                    <small className="mono">{bekleme(x)}</small>
                  </span>
                </button>
              )) : (
                <div className="tc-ay3-kutu">
                  <b><Simge ad="check" /> {view === 'open' ? 'Bekleyen numune yok' : 'Henüz kayıt yok'}</b>
                  <small className="tc-ay3-not">Makinelerden gelen numune istekleri burada sıraya girer.</small>
                </div>
              )}
            </section>
            <section className="tc-ay4-resim" aria-label="Teknik resim">
              {kmParcasi ? <KaliteFormu malzemeNo={kmParcasi.malzemeNo} uretimEmriId={kmParcasi.emirId} yaz={salt} yazabilir={false} />
                : kontrol ? <Suspense fallback={null}><TeknikResim kontrol={kontrol} /></Suspense> : (
                  <div className="tc-ay3-kutu"><b><Simge ad="target" /> Numune seç</b><small className="tc-ay3-not">Operatör &quot;Numuneyi kaliteye gönder&quot; dediğinde istek soldaki listeye düşer.</small></div>
                )}
            </section>
            <section className="tc-ay4-form tc-ay3-sayfa" aria-label="Ölçüm">
              {r && p && (
                <>
                  <div className="tc-ay3-kutu">
                    <span className="tc-ay3-ust">{r.machine} · {r.by} · {new Date(r.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <h3>{r.no} <small className="tc-ay3-not">Rev {r.rev}</small></h3>
                    <p className="tc-ay3-not">{r.part} · {r.reason} · {sayi(r.cnt)}. parça</p>
                    <div className="tc-ay3-arac">
                      <progress className="tc-ay3-cubuk" data-renk={nBad ? 'stop' : 'run'} max={Math.max(1, items.length)} value={nMeas} aria-label="Ölçülen" />
                      <b className="mono">{nMeas}/{items.length}</b>
                    </div>
                  </div>
                  {ncmm > 0 && ncmm < items.length && (
                    <div className="tc-ay3-arac">
                      <Secmeli etiket="Ölçüm yöntemi" deger={mf} degistir={mfYaz}
                        secenekler={[{ k: 'all', etiket: `Tümü · ${items.length}` }, { k: 'man', etiket: `Elle · ${items.length - ncmm}` }, { k: 'cmm', etiket: `CMM · ${ncmm}` }]} />
                    </div>
                  )}
                  <div className="tc-ay3-kutu">
                    {gorunenler.map((b, i, arr) => {
                      const m = results[b.id];
                      const grp = mf === 'all' && arr.some((x) => yontem(x) === 'cmm') && arr.some((x) => yontem(x) !== 'cmm') && (i === 0 || yontem(arr[i - 1]!) !== yontem(b)) ? yontem(b) : null;
                      return (
                        <Fragment key={b.id}>
                          {grp && <div className="tc-ay3-ust"><Simge ad={grp === 'cmm' ? 'cube' : 'ruler'} boyut="k" /> {grp === 'cmm' ? 'CMM ile ölçülecek' : 'Elle ölçülecek'} · {arr.filter((x) => yontem(x) === grp).length}</div>}
                          <div className="tc-ay4-olcum" data-renk={m ? (m.ok ? 'run' : 'stop') : undefined}>
                            <div className="tc-ay3-arac">
                              <span className="tc-ay4-balon" data-renk={yontem(b) === 'cmm' ? 'cmm' : undefined}>{b.id}</span>
                              <div>
                                <b className="mono">{b.nom}{yontem(b) === 'cmm' && <Cip renk="cmm">CMM</Cip>}</b>
                                <div className="tc-ay3-not">{b.tol} · {b.tool}{b.crit ? ' · KRİTİK' : ''}{m?.src === 'cmm' ? ' · CMM dosyasından' : ''}{m?.by ? ` · ${m.by}` : ''}</div>
                              </div>
                              <span className="tc-ay3-bosluk" />
                              {m ? <b className="mono" data-renk={m.ok ? (m.edge ? 'hold' : 'run') : 'stop'}>{String(m.v)}{m.edge ? <small> sınırda %{String(m.edge)}</small> : null}</b>
                                : <small className="tc-ay3-not">ölçülmedi</small>}
                            </div>
                            {!b.gauge && <ToleransCubugu b={b} v={m && typeof m.v === 'number' ? m.v : null} />}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                  <SaltOkunurNotu />
                  {!acikNumuneMi(r) && (
                    <div className="tc-ay3-kutu" data-renk={r.status === 'rejected' ? 'stop' : 'run'}>
                      <b><Simge ad={r.status === 'rejected' ? 'x' : 'check'} /> {NUMUNE_DURUMLARI[r.status].etiket} · {r.decidedBy} · {r.decidedAt ? new Date(r.decidedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''}{r.note ? ` · ${r.note}` : ''}</b>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
    </SayfaCercevesi>
  );
}

// Tolerans bandı ve ölçülen değerin yeri (tolbar): band aralığın %70'idir, iki yanda %15 pay kalır.
function ToleransCubugu({ b, v }: { b: PlanItem; v: number | null }) {
  const span = b.max - b.min || 1e-6;
  const lo = b.min - (span * 0.2) / 0.7;
  const hi = b.max + (span * 0.2) / 0.7;
  const yer = (x: number) => Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  return (
    <svg className="tc-ay4-tolerans" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="tc-ay4-bant" x={yer(b.min)} y={3} width={yer(b.max) - yer(b.min)} height={4} />
      {v != null && <line className="tc-ay4-isaret" x1={yer(v)} x2={yer(v)} y1={0} y2={10} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
