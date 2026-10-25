import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ILETI_GITMEDI } from '../../../../../../arkon/web/src/data/gonderim-hatasi.ts';
import { numuneDugmeleri, numuneReddiEksigi, secinceOlcumeAlinir } from '../../../../../../arkon/web/src/data/numune.ts';
import { ALET_ZORUNLU_ILETISI, olcumAletDamgasi } from '../../../../../../arkon/web/src/data/olcum-aleti.ts';
import type { Meas, Pkg, PlanItem, Result, SampleRequest } from '../../../../../../arkon/shared/model.ts';
import { Dugme, IsaretKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { sayi, sure } from '../cekirdek/bicim.ts';
import { bip } from '../cekirdek/ses.ts';
import { istasyonBul } from '../cekirdek/tesis.ts';
import { useArkon, useSimdi } from '../veri/baglam.ts';
import { Hazirlaniyor } from '../ortak/Hazirlaniyor.tsx';
import { Cip, SayfaCercevesi, Secmeli, onayBekliyor, useSoyle, useYetkiDenetimi } from '../pano/index.tsx';
import {
  NUMUNE_DURUMLARI, acikNumuneMi, cmmOku, kaliteKurali, kenaraYakin, olcumDegerlendir, olcumKaydi, toleransta, yontem, type CmmSonucu,
} from './kurallar.ts';
import { AletSecimi, OlcuAletleri, olcumAletiBul, useOlcumAletleri } from './OlcuAletleri.tsx';
import { Onaylar } from './Onaylar.tsx';
import { SpcGorunumu } from './SpcGorunumu.tsx';

// Kalite · ölçüm istasyonu (kalite.ts QualityApp): numune sırası, teknik resim, ölçüm girişi (elle, mastar, CMM dosyası), onay ve red kararı;
// SPC, paket onayı ve ölçü aletleri sekmeleri. Ölçüm 'q.meas', karar 'q.decide' ister; yetkisiz rol düğmeyi görmez, sunucu da denetler.

type Kip = 'samples' | 'spc' | 'onay' | 'alet';
type Gorunum = 'list' | 'draw' | 'form';
interface Odak { id: number; n: number }

// Eski QTop kısayolları: Operatör ve Üretim Terminali Hazırlık.
const KALITE_KISAYOLLARI = [
  { sayfa: 'operator', simge: 'gauge', metin: 'Operatör' },
  { sayfa: 'hazirlik', simge: 'layers', metin: 'Üretim Terminali Hazırlık', yalnizSimge: true },
] as const;

export function KaliteSayfasi() {
  const { depo, kisi, ayarlar, yetkiVar, saltOkunur } = useArkon();
  const soyle = useSoyle();
  const izinli = useYetkiDenetimi();
  const [kip, kipYaz] = useState<Kip>('samples');
  const [gor, gorYaz] = useState<Gorunum>('list');
  const [reqs, reqsYaz] = useState<SampleRequest[]>([]);
  const [pkgs, pkgsYaz] = useState<Record<string, Pkg>>({});
  const [selId, selIdYaz] = useState<string | null>(null);
  const [secildi, secildiYaz] = useState(0);
  const [view, viewYaz] = useState<'open' | 'done'>('open');
  const [vals, valsYaz] = useState<Record<number, string>>({});
  const [sug, sugYaz] = useState<Record<number, { v: number; alt: number } | null>>({});
  const [focus, focusYaz] = useState<Odak | null>(null);
  const [note, noteYaz] = useState('');
  const [c2, c2Yaz] = useState(false);
  const [mf, mfYaz] = useState<'all' | 'man' | 'cmm'>('all');
  const [cmm, cmmYaz] = useState<CmmSonucu | null>(null);
  const girdiler = useRef<Record<number, HTMLInputElement | null>>({});
  const dosya = useRef<HTMLInputElement>(null);
  const aletler = useOlcumAletleri();
  const [, aletN] = useState(0);
  const simdi = useSimdi(1000);
  const ad = kisi?.name ?? '';

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
  // Açılışta ilk açık numune seçilir ama ölçüme alınmaz (açılışta yazma yok); ölçüme alma kişinin seçmesiyle olur.
  useEffect(() => {
    void reload().then((rs) => { const ilk = rs.find(acikNumuneMi); if (ilk) selIdYaz((s) => s ?? ilk.id); });
    return depo.Bus.on((m) => {
      if (m.type === 'pkg-approval' || m.type === 'pkg-approved' || m.type === 'pkg') {
        void reload();
        if (m.type === 'pkg-approval') { bip('call'); soyle(`Onay bekleyen paket: ${String(m.no ?? '')}`, 'bilgi'); }
      }
      if (m.type === 'sample') {
        void reload().then(() => {
          bip('due');
          soyle(`Yeni numune: ${String(m.no)} · ${String(m.machine)} · ${String(m.reason)}`, 'bilgi');
          selIdYaz((s) => s || (m.reqId as string));
        });
      }
    });
  }, [depo, reload, soyle]);

  const r = reqs.find((x) => x.id === selId);
  const p = r ? pkgs[r.pkgId] : undefined;
  const items: PlanItem[] = r && p ? r.items.map((id) => p.plan.find((b) => b.id === id)).filter((b): b is PlanItem => !!b) : [];
  const results: Record<string, Meas> = r?.results ?? {};
  const olcebilir = yetkiVar('q.meas') && !saltOkunur;
  const dugme = numuneDugmeleri({ olcebilir, karar: yetkiVar('q.decide') && !saltOkunur });

  const sec = (id: string) => { selIdYaz(id); secildiYaz((n) => n + 1); gorYaz('form'); };
  const odakla = (id: number, ms: number) => { focusYaz({ id, n: Date.now() }); setTimeout(() => girdiler.current[id]?.focus(), ms); };
  useEffect(() => {
    valsYaz({}); sugYaz({}); noteYaz(''); c2Yaz(false);
    if (secildi > 0 && r && secinceOlcumeAlinir(r.status, olcebilir)) {
      void depo.DB.put('requests', { ...r, status: 'measuring', startedAt: Date.now() }).then(reload);
    }
    if (items[0]) odakla(items[0].id, 300);
  }, [selId, secildi]);

  const kaydet = async (b: PlanItem, secim?: number | 'ok' | 'nok') => {
    if (!r || !p || !izinli('q.meas')) return;
    const alet = olcumAletiBul(aletler, b.tool);
    if (!alet) { bip('nok'); soyle(ALET_ZORUNLU_ILETISI + (b.tool ? ` · ${b.tool}` : ''), 'hata'); return; }
    const s = olcumDegerlendir(b, vals[b.id], secim);
    if (s.tur === 'yok') return;
    if (s.tur === 'oneri') { sugYaz({ ...sug, [b.id]: { v: s.v, alt: s.alt } }); bip('nok'); return; }
    bip(s.ok ? 'ok' : 'nok');
    sugYaz({ ...sug, [b.id]: null });
    const edge = s.ok ? kenaraYakin(b, s.v, kaliteKurali(p).band) : 0;
    const n: SampleRequest = { ...r, results: { ...results, [b.id]: { v: s.v, ok: s.ok, at: Date.now(), cnt: r.cnt, by: ad, ...olcumAletDamgasi(alet), ...(edge ? { edge } : {}) } } };
    await depo.DB.put('requests', n);
    await reload();
    void depo.Log.add('meas', olcumKaydi(p, b, { v: s.v, ok: s.ok, cnt: r.cnt }, istasyonBul(ayarlar.tesis, p.machine).wc, { src: 'quality', orderNo: r.no, machine: r.machine, reqId: r.id }));
    const idx = items.findIndex((x) => x.id === b.id);
    const sonraki = items.slice(idx + 1).find((x) => !n.results[x.id]) ?? items.find((x) => !n.results[x.id]);
    if (sonraki) odakla(sonraki.id, 50);
  };
  const cmmYukle = async (f: File | undefined) => {
    if (!f) return;
    const R = { ...cmmOku(await f.text(), items), file: f.name };
    cmmYaz(R);
    if (!R.rows.length) soyle('Dosyada ölçüm değeri bulunamadı', 'hata');
  };
  const cmmUygula = async () => {
    if (!r || !p || !cmm || !izinli('q.meas')) return;
    const band = kaliteKurali(p).band;
    const aletsiz = cmm.rows.find((x) => x.b && !olcumAletiBul(aletler, x.b.tool));
    if (aletsiz?.b) { bip('nok'); soyle(`${ALET_ZORUNLU_ILETISI} · ${aletsiz.b.tool ?? ''}`, 'hata'); return; }
    const ek: Record<string, Meas> = {};
    for (const x of cmm.rows) {
      if (!x.b) continue;
      const v = +x.act.toFixed(5);
      const ok = toleransta(x.b, v);
      const edge = ok ? kenaraYakin(x.b, v, band) : 0;
      const alet = olcumAletiBul(aletler, x.b.tool);
      ek[x.b.id] = { v, ok, at: Date.now(), cnt: r.cnt, by: 'CMM', src: 'cmm', file: cmm.file, ...(alet ? olcumAletDamgasi(alet) : {}), ...(edge ? { edge } : {}) };
    }
    await depo.DB.put('requests', { ...r, results: { ...results, ...ek } });
    for (const x of cmm.rows) if (x.b) void depo.Log.add('meas', olcumKaydi(p, x.b, ek[x.b.id]!, istasyonBul(ayarlar.tesis, p.machine).wc, { src: 'cmm', orderNo: r.no, machine: r.machine, reqId: r.id }));
    await reload();
    cmmYaz(null);
    const kotu = Object.values(ek).filter((x) => !x.ok).length;
    bip(kotu ? 'nok' : 'ok');
    soyle(`CMM sonucu yüklendi · ${Object.keys(ek).length} ölçü${kotu ? ` · ${kotu} RED` : ''}`, kotu ? 'hata' : 'tamam');
  };

  const acik = reqs.filter(acikNumuneMi);
  const biten = reqs.filter((x) => !acikNumuneMi(x)).reverse();
  const liste = view === 'open' ? acik : biten;
  const needC2 = !!(p && kaliteKurali(p).critTwice && items.some((b) => b.crit));
  const nMeas = items.filter((b) => results[b.id]).length;
  const nBad = items.filter((b) => results[b.id] && !results[b.id]!.ok).length;
  const redEksigi = numuneReddiEksigi(nMeas, note);

  const karar = async (status: SampleRequest['status']) => {
    if (!r || !izinli('q.decide')) return;
    if (status === 'rejected' && redEksigi) { soyle(redEksigi, 'bilgi'); return; }
    const n: SampleRequest = { ...r, status, decidedAt: Date.now(), decidedBy: ad, note, ...(status === 'approved' && needC2 && c2 ? { c2: true } : {}) };
    await depo.DB.put('requests', n);
    const res = ((await depo.DB.get('results', r.pkgId)) as Result | undefined) ?? { id: r.pkgId, no: r.no, meas: {}, pins: [] } as unknown as Result;
    await depo.DB.put('results', { ...res, meas: { ...res.meas, ...n.results }, at: Date.now() });
    depo.Bus.send({ type: 'sample-result', reqId: r.id, id: r.pkgId, no: r.no, status, machine: r.machine });
    depo.Bus.send({ type: 'result', id: r.pkgId, no: r.no });
    soyle(status === 'rejected' ? 'Red kararı makineye iletildi' : 'Onay makineye iletildi', status === 'rejected' ? 'hata' : 'tamam');
    const rs = await reload();
    const nx = rs.find((x) => x.status === 'waiting');
    selIdYaz(nx ? nx.id : null);
  };

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
  const olcumAcik = !!r && acikNumuneMi(r);
  const gorunenler = items.filter((b) => mf === 'all' || yontem(b) === mf).sort((x, y) => (mf === 'all' ? Number(yontem(x) === 'cmm') - Number(yontem(y) === 'cmm') : 0));

  return (
    <SayfaCercevesi simge="target" baslik="Kalite · ölçüm istasyonu" renk="done" ek={ek} kisayollar={KALITE_KISAYOLLARI} saatAlt="Kalite laboratuvarı">
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
              {r && p ? <Hazirlaniyor /> : (
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
                  <div className="tc-ay3-arac">
                    {ncmm > 0 && ncmm < items.length && (
                      <Secmeli etiket="Ölçüm yöntemi" deger={mf} degistir={mfYaz}
                        secenekler={[{ k: 'all', etiket: `Tümü · ${items.length}` }, { k: 'man', etiket: `Elle · ${items.length - ncmm}` }, { k: 'cmm', etiket: `CMM · ${ncmm}` }]} />
                    )}
                    <span className="tc-ay3-bosluk" />
                    {dugme.olcum && olcumAcik && <Dugme simge="cube" onClick={() => dosya.current?.click()}>CMM dosyası</Dugme>}
                    <input ref={dosya} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden aria-label="CMM dosyası"
                      onChange={(o) => { void cmmYukle(o.target.files?.[0]); o.target.value = ''; }} />
                  </div>
                  {cmm && (
                    <div className="tc-ay3-kutu" aria-label="CMM sonucu">
                      <div className="tc-ay3-arac">
                        <div><span className="tc-ay3-ust">CMM sonucu · {cmm.file}</span><b>{cmm.matched}/{cmm.rows.length} satır eşleşti</b></div>
                        <span className="tc-ay3-bosluk" />
                        <button type="button" className="tc-ay3-secim" onClick={() => cmmYaz(null)} aria-label="Kapat"><Simge ad="x" /></button>
                      </div>
                      <small className="tc-ay3-not">Ayraç: {cmm.dl} · {cmm.header ? 'başlık satırı bulundu' : 'başlık yok · ilk sütun balon no, son sayı ölçülen'} · eşleştirme sırası: balon no → anma değeri → ad</small>
                      <div className="tc-ay4-tablo-kutu">
                        <table className="tc-ay4-tablo">
                          <thead><tr><th>Satır</th><th>Ölçülen</th><th>Balon</th><th>Sonuç</th></tr></thead>
                          <tbody>{cmm.rows.map((x, i) => {
                            const ok = !!x.b && toleransta(x.b, x.act);
                            return (
                              <tr key={i}><td>{x.key}</td><td className="mono">{x.act}</td>
                                <td>{x.b ? <><b>{x.b.id}</b> <span className="mono">{x.b.nom}</span> <small className="tc-ay3-not">({x.how})</small></> : <span className="tc-ay3-not">eşleşmedi</span>}</td>
                                <td data-renk={x.b ? (ok ? 'run' : 'stop') : undefined}>{x.b ? (ok ? 'Uygun' : 'RED') : '—'}</td></tr>
                            );
                          })}</tbody>
                        </table>
                      </div>
                      <div className="tc-ay3-dugmeler">
                        <Dugme onClick={() => cmmYaz(null)}>Vazgeç</Dugme>
                        <Dugme tur="birincil" simge="check" disabled={!cmm.matched} onClick={() => { void cmmUygula(); }}>{cmm.matched} ölçüyü kaydet</Dugme>
                      </div>
                    </div>
                  )}
                  <div className="tc-ay3-kutu">
                    {gorunenler.map((b, i, arr) => {
                      const m = results[b.id];
                      const sg = sug[b.id];
                      const grp = mf === 'all' && arr.some((x) => yontem(x) === 'cmm') && arr.some((x) => yontem(x) !== 'cmm') && (i === 0 || yontem(arr[i - 1]!) !== yontem(b)) ? yontem(b) : null;
                      return (
                        <Fragment key={b.id}>
                          {grp && <div className="tc-ay3-ust"><Simge ad={grp === 'cmm' ? 'cube' : 'ruler'} boyut="k" /> {grp === 'cmm' ? 'CMM ile ölçülecek' : 'Elle ölçülecek'} · {arr.filter((x) => yontem(x) === grp).length}</div>}
                          <div className="tc-ay4-olcum" data-secili={focus?.id === b.id || undefined} data-renk={m ? (m.ok ? 'run' : 'stop') : undefined} onClick={() => focusYaz({ id: b.id, n: Date.now() })}>
                            <div className="tc-ay3-arac">
                              <span className="tc-ay4-balon" data-renk={yontem(b) === 'cmm' ? 'cmm' : undefined}>{b.id}</span>
                              <div>
                                <b className="mono">{b.nom}{yontem(b) === 'cmm' && <Cip renk="cmm">CMM</Cip>}</b>
                                <div className="tc-ay3-not">{b.tol} · {b.tool}{b.crit ? ' · KRİTİK' : ''}{m?.src === 'cmm' ? ' · CMM dosyasından' : ''}{m?.gno ? ` · ${String(m.gno)}` : ''}</div>
                              </div>
                              <span className="tc-ay3-bosluk" />
                              {m && <b className="mono" data-renk={m.ok ? (m.edge ? 'hold' : 'run') : 'stop'}>{String(m.v)}{m.edge ? <small> sınırda %{String(m.edge)}</small> : null}</b>}
                            </div>
                            {!b.gauge && <ToleransCubugu b={b} v={m && typeof m.v === 'number' ? m.v : null} />}
                            {dugme.olcum && !sg && olcumAcik && (
                              <div className="tc-ay3-arac"><span className="tc-ay3-not">Ölçü aleti</span><AletSecimi aletler={aletler} tool={b.tool} onSec={() => aletN((n) => n + 1)} /></div>
                            )}
                            {sg ? (
                              <>
                                <div className="tc-ay3-uyari" role="alert"><Simge ad="alert" /> {sg.v} tolerans dışında · <b className="mono">{sg.alt}</b> mi demek istedin?</div>
                                <div className="tc-ay3-dugmeler">
                                  <Dugme tur="birincil" onClick={() => { void kaydet(b, sg.alt); }}>{sg.alt} kaydet</Dugme>
                                  <Dugme onClick={() => { void kaydet(b, sg.v); }}>{sg.v} doğru</Dugme>
                                </div>
                              </>
                            ) : !dugme.olcum ? null : b.gauge ? (
                              <div className="tc-ay3-dugmeler">
                                <Dugme onClick={() => { void kaydet(b, 'ok'); }}>Geçer</Dugme>
                                <Dugme tur="tehlike" onClick={() => { void kaydet(b, 'nok'); }}>Geçmez</Dugme>
                              </div>
                            ) : (
                              <div className="tc-ay3-dugmeler">
                                <input ref={(el) => { girdiler.current[b.id] = el; }} className="tc-ay3-girdi" inputMode="decimal" placeholder={`${b.min} – ${b.max}`}
                                  value={vals[b.id] || ''} onChange={(o) => valsYaz({ ...vals, [b.id]: o.target.value })}
                                  onKeyDown={(o) => { if (o.key === 'Enter') void kaydet(b); }} aria-label={`Ölçülen ${b.nom}`} />
                                <Dugme tur="birincil" simge="check" onClick={() => { void kaydet(b); }} aria-label={`${b.nom} kaydet`} />
                              </div>
                            )}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                  {olcumAcik ? (dugme.karar && (
                    <div className="tc-ay3-kutu" aria-label="Karar">
                      <input className="tc-ay3-girdi" placeholder="Not · Red için gerekçe zorunlu · örn. takım değişimi önerilir" value={note} onChange={(o) => noteYaz(o.target.value)} aria-label="Not" />
                      {redEksigi && <small className="tc-ay3-not">{redEksigi}</small>}
                      {needC2 && (
                        <IsaretKutusu etiket={`Kritik ölçüleri ikinci kez kontrol ettim (Hazırlık kuralı · ${items.filter((b) => b.crit).map((b) => b.nom).join(', ')})`} checked={c2} onChange={(o) => c2Yaz(o.target.checked)} />
                      )}
                      <div className="tc-ay3-dugmeler">
                        <Dugme boyut="ana" tur="tehlike" simge="x" disabled={redEksigi !== null} title={redEksigi || ''} onClick={() => { void karar('rejected'); }}>Red</Dugme>
                        {nBad > 0 && <Dugme boyut="ana" disabled={nMeas < items.length} onClick={() => { void karar('deviation'); }}>Sapma ile onay</Dugme>}
                        <Dugme boyut="ana" tur="birincil" simge="check" disabled={nMeas < items.length || nBad > 0 || (needC2 && !c2)} onClick={() => { void karar('approved'); }}>Onayla</Dugme>
                      </div>
                    </div>
                  )) : (
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
