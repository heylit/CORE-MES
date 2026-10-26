import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cizimSilinir } from '../../../../../../arkon/web/src/data/cizim-silme.ts';
import { MERKEZDEN_EKLENIR, merkezDosyasiniKoy } from '../../../../ortak/cizim/cekirdek/cizim-merkezi.ts';
import { KAYIT_GITMEDI, KAYIT_REDDI_OLAYI } from '../../../../../../arkon/web/src/data/gonderim-hatasi.ts';
import { AcKapa, Dugme, Girdi, Rozet, Secim, Simge, useBildirim, type BildirimTonu } from '../../../../ortak/arayuz/index.ts';
import { sayi } from '../cekirdek/bicim.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { ArkonBandi } from '../ortak/SaatSeridi.tsx';
import { useArkon, useBelgeler, useCakismaUyarisi } from '../veri/baglam.ts';
import { cihazAyari, cihazAyariYaz } from '../../../../ortak/cizim/bellek.ts';
import {
  anaResimSec, ayarDuzelt, BOLGE_SINIFLARI, bolgeSinifi, calismadanCikar, cizimKaydi, dosyaEtiketi, paketCalismasi, paketDegisikligi, yeniCalisma,
  type BolgeSinifi, type Calisma, type CalismaDosyasi, type KayitliCizim, type Olcum, type OkumaAyari, type PaketAktarimi, type PaketOzeti,
} from '../../../../ortak/cizim/kurallar.ts';
import { MerkezRozeti, MerkezSecici, useMerkezUyarilari, useMerkezVar } from './Merkez.tsx';
import { katla, type TaniParcasi } from '../../../../ortak/cizim/okuma.ts';
import { TeknikResim, type ResimBelgesi, type TaniBilgisi, type TeknikResimKontrolu } from '../../../../ortak/cizim/TeknikResim.tsx';
import '../../../../ortak/cizim/cizim.css';

// Çizim stüdyosu (cizim-studyosu.ts DrawLabApp): PDF ve 3B okuma ayarlarını dene, tanı katmanıyla önizle, cihaza ya da iş paketine uygula.
// Kaydedilen çizim (draws) Üretim Terminali Hazırlık › Dokümanlar'da kullanılır. Arkon'un kendi üst çubuğu, teması ve tanıtım verisi yoktur.

type Kip = 'files' | 'view' | 'set';
type Sekme = 'pdf' | '3d' | 'diag';
type Katman = Record<BolgeSinifi | 'zones' | 'ocr', boolean>;
type Tani = TaniBilgisi & { at: number };

const yeni = () => yeniCalisma(Date.now(), Math.random().toString(36).slice(2, 6));
const KATMAN_VARSAYILANI: Katman = { dim: true, table: true, border: true, notes: true, prose: true, stack: false, none: true, zones: true, ocr: true };
const KIPLER: readonly [Kip, string][] = [['files', 'Dosya'], ['view', 'Önizleme'], ['set', 'Ayarlar']];
const SEKMELER: readonly [Sekme, string][] = [['pdf', 'PDF'], ['3d', '3B model'], ['diag', 'Tanı']];
const BALON_BOYU: readonly [number, string][] = [[0.8, 'S'], [1, 'M'], [1.25, 'L'], [1.5, 'XL']];
// Eski LabTop'un sağ ucu: Hazırlık ve operatör ekranına kısayol, saatin altında okuma türü.
const CIZIM_KISAYOLLARI = [
  { sayfa: 'hazirlik', simge: 'layers', metin: 'Üretim Terminali Hazırlık' },
  { sayfa: 'operator', simge: 'gauge', metin: 'Operatör ekranı', yalnizSimge: true },
] as const;

const AYIKLAMA = [
  ['table', 'Antet ve tablolar', 'Malzeme, revizyon, parça listesi'], ['border', 'Pafta kenarı', 'Kenardaki A–F / 1–8 kare harfleri'],
  ['notes', 'Notlar', '"NOTLAR" başlığı altındaki satırlar'], ['prose', 'Açıklama cümleleri', 'Uzun yazılar'],
] as const;

function Dilimler<D extends string | number>({ etiket, v, sec, secenekler }: { etiket: string; v: D; sec: (d: D) => void; secenekler: readonly (readonly [D, string])[] }) {
  return (
    <div className="tc-ay5-dilimler" role="group" aria-label={etiket}>
      {secenekler.map(([k, l]) => (
        <button key={String(k)} type="button" className={`tc-ay5-dilim${String(v) === String(k) ? ' tc-ay5-acik' : ''}`} aria-pressed={String(v) === String(k)} onClick={() => sec(k)}>{l}</button>
      ))}
    </div>
  );
}
function Ayar({ l, d, children }: { l: string; d?: string; children: ReactNode }) {
  return <div className="tc-ay5-ayar"><div><b>{l}</b>{d && <small>{d}</small>}</div>{children}</div>;
}
function Anahtar({ l, d, acik, degistir }: { l: string; d?: string; acik: boolean; degistir: (v: boolean) => void }) {
  return (
    <div className="tc-ay5-anahtar">
      <div className="tc-ay5-metin"><b>{l}</b>{d && <small>{d}</small>}</div>
      <AcKapa etiket={l} acik={acik} degistir={degistir} />
    </div>
  );
}
function Deger({ l, v, z }: { l: string; v: ReactNode; z?: string }) {
  return <div><span>{l}</span><b className={z ? `tc-ay5-tonlu tc-ay5-z-${z}` : undefined}>{v}</b></div>;
}

export function CizimStudyosu() {
  const { depo, kisi, saltOkunur } = useArkon();
  const { bildir } = useBildirim();
  const say = useCallback((m: string, ton: BildirimTonu = 'tamam') => bildir(ton, m), [bildir]);
  useCakismaUyarisi(useCallback((m: string) => say(m, 'bilgi'), [say]));
  useEffect(() => {
    const f = (e: Event) => say(KAYIT_GITMEDI + ' · ' + ((e as CustomEvent<{ msg?: string }>).detail?.msg || ''), 'hata');
    window.addEventListener(KAYIT_REDDI_OLAYI, f);
    return () => window.removeEventListener(KAYIT_REDDI_OLAYI, f);
  }, [say]);

  const [cfg, setCfg] = useState<OkumaAyari>(() => cihazAyari(yerel)), [applied, setApplied] = useState<OkumaAyari>(() => cihazAyari(yerel));
  const [w, setW] = useState<Calisma>(yeni), [open, setOpen] = useState<TeknikResimKontrolu['ac']>(null), [info, setInfo] = useState<Tani | null>(null);
  const [lv, setLv] = useState<Kip>('files'), [tab, setTab] = useState<Sekme>('pdf'), [q, setQ] = useState(''), [meas, setMeas] = useState<Record<number, Olcum>>({});
  const [ov, setOv] = useState<Katman>(KATMAN_VARSAYILANI);
  const [pkgId, setPkgId] = useState(''), [send, setSend] = useState<PaketAktarimi | null>(null);
  const cizimler = useBelgeler<KayitliCizim>('draws'), paketler = useBelgeler<PaketOzeti>('pkgs', ['pkg-draft']);
  const draws = useMemo(() => [...cizimler.liste].sort((a, b) => b.updatedAt - a.updatedAt), [cizimler.liste]);
  const pkgs = useMemo(() => [...paketler.liste].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)), [paketler.liste]);

  const up = <K extends keyof OkumaAyari>(k: K, v: OkumaAyari[K]) => setCfg((c) => ayarDuzelt({ ...c, [k]: v }));
  const upEx = (k: keyof OkumaAyari['ex'], v: boolean) => setCfg((c) => ayarDuzelt({ ...c, ex: { ...c.ex, [k]: v } }));
  const dirty = JSON.stringify(cfg) !== JSON.stringify(applied);
  const pdfF = w.files.find((f) => f.kind === 'pdf'), mdlF = w.files.find((f) => f.kind === 'model');
  const fresh = () => { setInfo(null); setMeas({}); setOpen(null); setLv('view'); };

  // Paket listesi dosyasız gelir (kart #731): açılan paketin dosyaları önce baytlanır.
  const loadPkg = useCallback((p0: PaketOzeti) => {
    void depo.coz(p0).then((p) => {
      setW(paketCalismasi(p, yeni()));
      if (p.readCfg) { setCfg(ayarDuzelt(p.readCfg)); setApplied(ayarDuzelt(p.readCfg)); }
      setPkgId(p.id); setInfo(null); setMeas({}); setOpen(null); setLv('view');
    }, (e: unknown) => say('Paket dosyaları alınamadı: ' + (e instanceof Error ? e.message : String(e)), 'hata'));
  }, [depo, say]);
  // Hazırlıktan "Çizim stüdyosunda düzenle" ile gelindiyse paket açılır (bir kez; işaret silinir).
  const ilk = useRef(true);
  useEffect(() => {
    if (!paketler.hazir || !ilk.current) return;
    ilk.current = false;
    const j = yerel.oku<{ pkg?: string }>('labOpen'); yerel.yaz('labOpen', null);
    const p = j && pkgs.find((x) => x.id === j.pkg);
    if (p) loadPkg(p); else if (pkgs[0]) setPkgId(pkgs[0].id);
  }, [paketler.hazir, pkgs, loadPkg]);

  // Çizim Merkezi (kart #800): dosya çalışmaya eklenir; aynı belgenin yeni revizyonu aynı dosyanın yerine geçer.
  const merkezVar = useMerkezVar();
  const [mSec, setMSec] = useState(false), [mBusy, setMBusy] = useState(false);
  const mUyari = useMerkezUyarilari(w.files);
  const merkezdenAl = async (belgeId: number, guncelleme: boolean) => {
    setMBusy(true);
    try {
      const f = await depo.Server.merkezdenAl(belgeId) as CalismaDosyasi;
      setW((o) => {
        const r = merkezDosyasiniKoy(o, f);
        return { ...o, files: r.files, primary: r.primary, bal: r.planSifirla ? [] : o.bal, rev: Date.now(), saved: false, name: o.name || f.name.replace(/\.[^.]+$/, '') };
      });
      fresh(); setTab(f.kind === 'pdf' ? 'pdf' : '3d'); setMSec(false);
      say(f.name + (guncelleme ? ' güncellendi' : ' Çizim Merkezi’nden eklendi'));
    } catch (e) { say('Çizim Merkezi’nden alınamadı: ' + (e instanceof Error ? e.message : String(e)), 'hata'); }
    setMBusy(false);
  };

  const rmFile = (kind: string) => { setW((o) => calismadanCikar(o, kind, Date.now())); fresh(); };
  const setPrimary = (name: string) => { setW((o) => anaResimSec(o, name, Date.now())); fresh(); };
  const loadDraw = (d: KayitliCizim) => {
    setW({ ...d, rev: Date.now(), saved: true });
    if (d.cfg) { setCfg(ayarDuzelt(d.cfg)); setApplied(ayarDuzelt(d.cfg)); }
    fresh();
  };
  const newWork = () => { setW(yeni()); setInfo(null); setMeas({}); setOpen(null); setLv('files'); };
  const saveDraw = async () => {
    if (!w.files.length) return;
    const d = cizimKaydi(w, ayarDuzelt(applied), Date.now());
    await depo.DB.put('draws', d); setW((o) => ({ ...o, saved: true, name: d.name })); cizimler.yenile();
    say('“' + d.name + '” kaydedildi · Üretim Terminali Hazırlık › Dokümanlar\'da hazır');
  };
  const delDraw = async (d: KayitliCizim) => { await depo.DB.del('draws', d.id); cizimler.yenile(); say('“' + d.name + '” silindi', 'bilgi'); };
  const apply = (fr: boolean) => {
    setApplied(cfg); setInfo(null); setMeas({}); setW((o) => ({ ...o, bal: [], saved: false }));
    const f = w.files.find((x) => x.name === w.primary);
    if (f) setOpen({ bytes: f.bytes, ad: f.name, n: Date.now(), taze: fr });
  };
  const onLab = useCallback((d: TaniBilgisi) => setInfo((o) => ({ ...o, ...d, at: Date.now() })), []);
  const setBal = useCallback((nb: Calisma['bal']) => setW((o) => ({ ...o, bal: nb, saved: false })), []);

  const segs: readonly TaniParcasi[] = info?.diag?.segs ?? [], osegs: readonly TaniParcasi[] = info?.ocrDiag?.segs ?? [];
  const katman = useCallback((doc: ResimBelgesi) => {
    // Renkli kutular yalnız Tanı sekmesinde.
    if (tab !== 'diag' || !info || doc.kind !== 'pdf' || !info.C || info.C.w !== doc.w) return null;
    const one = (s: TaniParcasi, i: number, ocr: boolean) => {
      const z = bolgeSinifi(String(s.z));
      if (!ov[z] || (ocr && !ov.ocr)) return null;
      return (
        <g key={(ocr ? 'o' : 't') + i} transform={'translate(' + s.x.toFixed(1) + ' ' + s.y.toFixed(1) + ') rotate(' + (s.a * 180 / Math.PI).toFixed(1) + ')'}>
          <rect className={`tc-ay5-tani-yazi tc-ay5-z-${z}${ocr ? ' tc-ay5-tani-ocr' : ''}`} x={-s.w / 2 - s.h * 0.35} y={-s.h * 0.95} width={s.w + s.h * 0.7} height={s.h * 1.6} rx={s.h * 0.2}>
            <title>{(ocr ? 'OCR · ' : '') + BOLGE_SINIFLARI[z] + ' · ' + s.t}</title>
          </rect>
        </g>
      );
    };
    const zones = ov.zones ? [...(info.diag?.zones ?? []), ...(info.ocrDiag?.zones ?? [])].map((z, i) => (
      <rect key={'z' + i} className={`tc-ay5-tani-bolge tc-ay5-z-${bolgeSinifi(z.why)}`} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} />
    )) : null;
    return <g>{zones}{segs.map((s, i) => one(s, i, false))}{osegs.map((s, i) => one(s, i, true))}</g>;
  }, [info, ov, tab, segs, osegs]);
  const ctl = useMemo((): TeknikResimKontrolu => ({
    anahtar: 'lab:' + w.rev, tani: onLab, ayar: applied, ac: open, dosyalar: w.files, anaResim: w.primary, balonlar: w.bal, balonlarYaz: setBal,
    olcumler: meas, olcumlerYaz: setMeas, katman, saltOkunur,
  }), [applied, open, w.rev, w.files, w.primary, w.bal, meas, katman, onLab, setBal, saltOkunur]);

  const curPkg = pkgs.find((x) => x.id === pkgId);
  const doSend = async () => {
    const p = curPkg; if (!p || !send) return;
    await depo.DB.put('pkgs', { ...p, ...paketDegisikligi(p, w, send, ayarDuzelt(applied), Date.now()) });
    depo.Bus.send({ type: 'pkg-draft', id: p.id }); paketler.yenile(); setSend(null);
    say(p.no + ' paketine aktarıldı · Hazırlıkta yayınlayınca operatöre gider');
  };
  const useAll = () => { cihazAyariYaz(yerel, cfg); say('Ayarlar bu cihazda tüm ekranlarda kullanılacak'); };
  const reset = () => setCfg(ayarDuzelt({}));

  const C = info?.C, S = info?.dims?.stats ?? {}, M = info?.model;
  const nz = (z: BolgeSinifi) => segs.filter((s) => bolgeSinifi(String(s.z)) === z).length + osegs.filter((s) => bolgeSinifi(String(s.z)) === z).length;
  const list = [...segs.map((s) => ({ ...s, src: 'PDF' })), ...osegs.map((s) => ({ ...s, src: 'OCR' }))].filter((s) => !q || katla(s.t).includes(katla(q)));
  const silebilir = !saltOkunur && cizimSilinir(kisi?.role);

  const pdfSet = (
    <>
      <span className="tc-ay5-bolum">Görüntü</span>
      <Ayar l="Çizim çözünürlüğü" d="Uzun kenar piksel · keskinlik ↔ hız/bellek"><Dilimler etiket="Çizim çözünürlüğü" v={cfg.res} sec={(v) => up('res', v)} secenekler={[[3000, 'Hızlı'], [4200, 'Normal'], [6000, 'Keskin']]} /></Ayar>
      <Ayar l="Çizgi kalınlaştırma" d="İnce CAD çizgileri ekranda kaybolmasın"><Dilimler etiket="Çizgi kalınlaştırma" v={cfg.bold} sec={(v) => up('bold', v)} secenekler={[[0, 'Yok'], [1, 'Hafif'], [2, 'Kalın']]} /></Ayar>
      <Ayar l="Renk" d="Net: yüksek kontrast · Mavi: teknik resim görünümü · Orijinal: PDF'in kendi renkleri"><Dilimler etiket="Renk" v={cfg.look} sec={(v) => up('look', v)} secenekler={[['net', 'Net'], ['blue', 'Mavi'], ['orig', 'Orijinal']]} /></Ayar>
      <span className="tc-ay5-bolum">Görüntüden okuma (OCR)</span>
      <Ayar l="OCR" d="Otomatik: metin katmanı yoksa ya da ölçüler çizgiye dönmüşse"><Dilimler etiket="OCR" v={cfg.ocr} sec={(v) => up('ocr', v)} secenekler={[['auto', 'Otomatik'], ['always', 'Her zaman'], ['off', 'Kapalı']]} /></Ayar>
      <Ayar l="OCR keskinliği" d="Büyük paftada (A2–A0) karo karo yüksek çözünürlük"><Dilimler etiket="OCR keskinliği" v={cfg.dpi} sec={(v) => up('dpi', v)} secenekler={[[2.4, 'Hızlı'], [3.2, 'Normal'], [4.2, 'İnce yazı']]} /></Ayar>
      <Ayar l="Otomatik OCR eşiği" d="Metinden bundan az ölçü çıkarsa görüntüden tamamla"><Dilimler etiket="Otomatik OCR eşiği" v={cfg.minDims} sec={(v) => up('minDims', v)} secenekler={[[1, '1'], [3, '3'], [6, '6'], [12, '12']]} /></Ayar>
      <span className="tc-ay5-bolum">Ayıklama · ölçü sayılmayacak yazılar</span>
      {AYIKLAMA.map(([k, l, d]) => <Anahtar key={k} l={l} d={d} acik={!!cfg.ex[k]} degistir={(v) => upEx(k, v)} />)}
      <span className="tc-ay5-bolum">Öneri listesi ve balonlar</span>
      <Ayar l="Otomatik işaretle" d="Hangi güven seviyesi seçili gelsin"><Dilimler etiket="Otomatik işaretle" v={cfg.auto} sec={(v) => up('auto', v)} secenekler={[['high', 'Yüksek'], ['mid', '+ Kontrol et'], ['low', 'Hepsi']]} /></Ayar>
      <Ayar l="Balon boyutu"><Dilimler etiket="Balon boyutu" v={cfg.balS} sec={(v) => up('balS', v)} secenekler={BALON_BOYU} /></Ayar>
    </>
  );
  const m3Set = (
    <>
      <span className="tc-ay5-bolum">Model işleme</span>
      <Ayar l="Ağ kalitesi" d="Üçgenleme sıklığı · eğrisel yüzeylerin pürüzsüzlüğü"><Dilimler etiket="Ağ kalitesi" v={cfg.mesh} sec={(v) => up('mesh', v)} secenekler={[['coarse', 'Kaba'], ['normal', 'Normal'], ['fine', 'İnce']]} /></Ayar>
      <Ayar l="Ön görünüş ekseni" d="Otomatik: delik/mil eksenine göre"><Dilimler etiket="Ön görünüş ekseni" v={cfg.fa} sec={(v) => up('fa', v)} secenekler={[['auto', 'Otomatik'], ['X', 'X'], ['Y', 'Y'], ['Z', 'Z']]} /></Ayar>
      <Anahtar l="Gizli çizgiler" d="Arkada kalan kenarlar kesikli çizilir" acik={cfg.hidden} degistir={(v) => up('hidden', v)} />
      <Anahtar l="Otomatik ölçülendirme" d="Çaplar, delik grupları, PCD, kademe boyları" acik={cfg.autoDim} degistir={(v) => up('autoDim', v)} />
      <span className="tc-ay5-bolum">Balonlar</span>
      <Ayar l="Balon boyutu"><Dilimler etiket="Balon boyutu" v={cfg.balS} sec={(v) => up('balS', v)} secenekler={BALON_BOYU} /></Ayar>
    </>
  );
  const elenen = (S.table || 0) + (S.border || 0) + (S.notes || 0) + (S.prose || 0);
  const diagView = (
    <>
      {!info && <p className="tc-ay5-soluk">Bir dosya aç; okuma sonuçları, süreler ve ham yazılar burada görünür.</p>}
      {C && (
        <>
          <div className="tc-ay5-istatistik">
            <Deger l="Sayfa" v={C.w + '×' + C.h + ' px'} /><Deger l="Ölçek" v={C.scale.toFixed(2) + ' px/pt'} />
            <Deger l="PDF yazısı" v={C.items.length + (C.junk ? ' · bozuk font' : '')} {...(C.junk ? { z: 'none' } : {})} />
            <Deger l="Metin katmanı" v={C.textless ? 'yok' : 'var'} z={C.textless ? 'table' : 'dim'} />
            <Deger l="OCR" v={info.needOcr ? (C.ocrDims ? C.ocrDims.length + ' ölçü' : 'çalıştı') : 'gerekmedi'} {...(info.needOcr ? { z: 'ocr' } : {})} />
            <Deger l="Bulunan" v={(info.dims || []).length + ' ölçü'} z="dim" />
            <Deger l="Yüksek / kontrol / düşük" v={(S.high || 0) + ' / ' + (S.mid || 0) + ' / ' + (S.low || 0)} />
            <Deger l="Elenen" v={elenen + ' yazı'} />
            {C.ms ? (
              <>
                <Deger l="Çizim" v={(C.ms.render || 0) + ' ms'} /><Deger l="Ölçü ayıklama" v={(C.ms.dims || 0) + ' ms'} />
                {C.ms.ocr ? <Deger l="OCR" v={(C.ms.ocr / 1000).toFixed(1) + ' sn'} /> : null}
              </>
            ) : <Deger l="Kaynak" v="önbellek" />}
          </div>
          <span className="tc-ay5-bolum">Katmanlar · bu sekme açıkken resimde renkli çerçeveler</span>
          <div className="tc-ay5-cipler">
            {(Object.keys(BOLGE_SINIFLARI) as BolgeSinifi[]).map((k) => (
              <button key={k} type="button" className={`tc-ay5-cip tc-ay5-z-${k}`} aria-pressed={ov[k]} onClick={() => setOv({ ...ov, [k]: !ov[k] })}><i />{BOLGE_SINIFLARI[k]}<b>{nz(k)}</b></button>
            ))}
            <button type="button" className="tc-ay5-cip tc-ay5-z-zones" aria-pressed={ov.zones} onClick={() => setOv({ ...ov, zones: !ov.zones })}><i />Bölgeler</button>
            {osegs.length > 0 && <button type="button" className="tc-ay5-cip tc-ay5-z-ocr" aria-pressed={ov.ocr} onClick={() => setOv({ ...ov, ocr: !ov.ocr })}><i />OCR yazıları<b>{osegs.length}</b></button>}
          </div>
          <span className="tc-ay5-bolum">Ham yazılar · {list.length}</span>
          <Girdi etiket="Ham yazılarda ara" placeholder="Ara: Ø25, H7, malzeme…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="tc-ay5-ham">
            {list.slice(0, 400).map((s, i) => {
              const z = bolgeSinifi(String(s.z));
              return <div key={i} className={`tc-ay5-ham-satir tc-ay5-z-${z}`}><i /><span className="tc-ay5-mono">{s.t}</span><small>{s.src} · {BOLGE_SINIFLARI[z]}</small></div>;
            })}
          </div>
        </>
      )}
      {M && (
        <div className="tc-ay5-istatistik">
          <Deger l="Biçim" v={M.kind} /><Deger l="Süre" v={info.ms + ' ms' + ((info.ms ?? 0) < 400 ? ' · önbellek' : '')} />
          {M.D && (
            <>
              <Deger l="Ölçek" v={M.D.info.scale} /><Deger l="Boyut" v={M.D.info.size.join(' × ') + ' mm'} /><Deger l="Üçgen" v={sayi(M.D.info.tris)} />
              <Deger l="Kenar" v={sayi(M.D.info.edges)} /><Deger l="Silindir" v={M.D.info.cylinders} /><Deger l="Delik" v={M.D.info.holes} />
              <Deger l="Ön eksen" v={M.D.info.frontAxis} /><Deger l="Ölçü önerisi" v={M.D.balloons.length} z="dim" />
            </>
          )}
        </div>
      )}
    </>
  );

  const slot = (kind: 'pdf' | 'model', f: CalismaDosyasi | undefined, label: string) => (
    <div className={`tc-ay5-yuva${f ? ' tc-ay5-dolu' : ''}`}>
      <span className={`tc-ay5-tur tc-ay5-tur-${kind}`}>{kind === 'pdf' ? 'PDF' : '3B'}</span>
      <div className="tc-ay5-metin">
        <b>{f ? f.name : label}</b>
        <small>{f ? (f.bytes.length / 1024).toFixed(0) + ' KB' + (w.files.length > 1 && w.primary === f.name ? ' · ana resim' : '') : kind === 'pdf' ? 'Teknik resim · isteğe bağlı' : 'STEP / IGES / STL · isteğe bağlı'}</small>
        {f && <MerkezRozeti f={f} uyari={mUyari} mesgul={mBusy} guncelle={(g) => { void merkezdenAl(Number(g.merkez), true); }} />}
      </div>
      {f && !saltOkunur && <button type="button" className="tc-ay5-kapat" onClick={() => rmFile(kind)} aria-label="Çıkar"><Simge ad="x" /></button>}
    </div>
  );
  const gizli = (k: Kip) => (lv !== k ? ' tc-ay5-dar-gizli' : '');

  return (
    <div className="tc-ay5">
      <ArkonBandi simge="lab" baslik="Çizim stüdyosu" renk="lab" kisayollar={CIZIM_KISAYOLLARI} alt="PDF · 3B okuma" />
      <div className="tc-ay5-kipler"><Dilimler etiket="Görünüm" v={lv} sec={setLv} secenekler={KIPLER} /></div>
      <div className="tc-ay5-govde">
        <aside className={'tc-ay5-panel' + gizli('files')} aria-label="Dosyalar">
          <div className="tc-ay5-calisma">
            <div className="tc-ay5-calisma-ust">
              <span className="tc-ay5-ust-yazi">Çalışma</span>
              {w.saved ? <Rozet ton="tamam">Kayıtlı</Rozet> : w.files.length ? <Rozet ton="uyari">Kaydedilmedi</Rozet> : null}
              <Dugme onClick={newWork}>Yeni</Dugme>
            </div>
            <Girdi etiket="Çizim adı" placeholder="Çizim adı · örn. GVD-340 Rev C" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value, saved: false })} />
            {slot('pdf', pdfF, 'PDF eklenmedi')}{slot('model', mdlF, '3B model eklenmedi')}
            {pdfF && mdlF && <Dilimler etiket="Ana resim" v={w.primary ?? ''} sec={setPrimary} secenekler={[[pdfF.name, 'Ana resim: PDF'], [mdlF.name, 'Modelden üret']]} />}
            {!saltOkunur && <Dugme tur="birincil" simge="check" disabled={!w.files.length} onClick={() => { void saveDraw(); }}>Kaydet</Dugme>}
            {merkezVar && !saltOkunur && <Dugme simge="layers" onClick={() => setMSec(true)}>Çizim Merkezi’nden ekle</Dugme>}
            {mSec && <MerkezSecici sec={(b) => merkezdenAl(b.id, false)} kapat={() => setMSec(false)} />}
            <small className="tc-ay5-soluk">{MERKEZDEN_EKLENIR} · balonlar ve ayarlar da kaydedilir</small>
          </div>
          {draws.length > 0 && (
            <>
              <span className="tc-ay5-bolum">Kayıtlı çizimler · {draws.length}</span>
              {draws.map((d) => (
                <div key={d.id} className={`tc-ay5-kayit${w.id === d.id ? ' tc-ay5-guncel' : ''}`}>
                  <button type="button" className="tc-ay5-satir" onClick={() => loadDraw(d)}>
                    <span className="tc-ay5-tur tc-ay5-tur-cizim"><Simge ad="lab" /></span>
                    <span className="tc-ay5-metin"><b>{d.name}</b><small>{d.files.map(dosyaEtiketi).join(' + ')}{d.bal?.length ? ' · ' + d.bal.length + ' balon' : ''}</small></span>
                  </button>
                  {silebilir && <button type="button" className="tc-ay5-kapat" onClick={() => { void delDraw(d); }} aria-label={'Sil: ' + d.name}><Simge ad="trash" /></button>}
                </div>
              ))}
            </>
          )}
          {pkgs.some((p) => p.files?.length) && (
            <>
              <span className="tc-ay5-bolum">İş paketlerinden</span>
              {pkgs.filter((p) => p.files?.length).slice(0, 10).map((p) => (
                <button key={p.id} type="button" className={`tc-ay5-satir${w.from === p.id ? ' tc-ay5-guncel' : ''}`} onClick={() => loadPkg(p)}>
                  <span className="tc-ay5-tur tc-ay5-tur-paket">{(p.files ?? []).map((f) => (f.kind === 'pdf' ? 'PDF' : '3B')).join('+')}</span>
                  <span className="tc-ay5-metin"><b>{p.no}</b><small>{p.part}{p.readCfg ? ' · özel ayar' : ''}</small></span>
                </button>
              ))}
            </>
          )}
        </aside>
        <section className={'tc-ay5-cizim' + gizli('view')} aria-label="Çizim önizlemesi">
          {w.files.length ? <TeknikResim kontrol={ctl} /> : (
            <div className="tc-ay5-bos">
              <Simge ad="lab" boyut="b" /><b>Çizim stüdyosu</b>
              <small>Soldan Çizim Merkezi'nden PDF'i ve 3B modeli ekle (ikisi birlikte de olur) ya da bir iş paketini aç. Sağdaki ayarları değiştirip <b>Uygula</b> de: okuma yeniden yapılır, sonucu resim üzerinde renkli kutularla görürsün. <b>Kaydet</b> dediğin çizim Üretim Terminali Hazırlık › Dokümanlar'da hazır olur.</small>
            </div>
          )}
        </section>
        <aside className={'tc-ay5-panel' + gizli('set')} aria-label="Okuma ayarları">
          <div className="tc-ay5-dilimler tc-ay5-sekmeler" role="tablist" aria-label="Ayar sekmeleri">
            {SEKMELER.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tc-ay5-dilim${tab === k ? ' tc-ay5-acik' : ''}`} onClick={() => setTab(k)}>
                {l}{k === 'diag' && info && <i className="tc-ay5-isaret" aria-label="sonuç var" />}
              </button>
            ))}
          </div>
          <div className="tc-ay5-ayar-govde" role="tabpanel">{tab === 'pdf' ? pdfSet : tab === '3d' ? m3Set : diagView}</div>
          <div className="tc-ay5-eylemler">
            <div className="tc-ay5-eylem-satiri">
              <Dugme tur="birincil" simge="check" disabled={!w.files.length || !dirty} onClick={() => apply(false)}>{dirty ? 'Uygula · yeniden oku' : 'Ayarlar uygulandı'}</Dugme>
              <Dugme simge="bolt" title="Önbelleği atlayıp baştan işle" aria-label="Önbelleği atlayıp baştan işle" disabled={!w.files.length} onClick={() => apply(true)} />
              <Dugme simge="back" title="Varsayılan ayarlara dön" aria-label="Varsayılan ayarlara dön" onClick={reset} />
            </div>
            <Dugme simge="layers" onClick={useAll}>Ayarları tüm sistemde kullan</Dugme>
            {saltOkunur ? null : send ? (
              <div className="tc-ay5-aktarim">
                <Secim etiket="İş paketi" value={pkgId} onChange={(e) => setPkgId(e.target.value)} secenekler={pkgs.map((p) => ({ deger: p.id, baslik: p.no + ' · ' + (p.part ?? '') }))} />
                <Anahtar l="Dosyalar" d={w.files.map((f) => f.name).join(' + ') || 'dosya yok'} acik={send.files} degistir={(v) => setSend({ ...send, files: v })} />
                <Anahtar l={'Kontrol planı · ' + w.bal.length + ' balon'} d={curPkg?.plan?.length ? 'Paketteki ' + curPkg.plan.length + ' noktanın yerine geçer' : 'Balonlar kontrol planı olur'}
                  acik={send.plan} degistir={(v) => setSend({ ...send, plan: v })} />
                <Anahtar l="Okuma ayarları" d="Operatör ekranı bu ayarla açar" acik={send.cfg} degistir={(v) => setSend({ ...send, cfg: v })} />
                <div className="tc-ay5-eylem-satiri">
                  <Dugme onClick={() => setSend(null)}>Vazgeç</Dugme>
                  <Dugme tur="birincil" simge="next" disabled={!pkgId || !(send.files || send.plan || send.cfg)} onClick={() => { void doSend(); }}>Pakete aktar</Dugme>
                </div>
              </div>
            ) : (
              <Dugme simge="next" disabled={!w.files.length} onClick={() => setSend({ files: true, plan: w.bal.length > 0, cfg: true })}>
                İş paketine aktar{w.from && curPkg && w.from === curPkg.id ? ' · ' + curPkg.no : ''}
              </Dugme>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
