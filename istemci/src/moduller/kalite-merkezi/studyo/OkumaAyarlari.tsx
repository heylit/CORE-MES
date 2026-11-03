import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AcKapa, Dugme, Girdi, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import { cihazAyari, cihazAyariYaz } from '../../../ortak/cizim/bellek.ts';
import { ayarDuzelt, BOLGE_SINIFLARI, bolgeSinifi, type BolgeSinifi, type OkumaAyari } from '../../../ortak/cizim/kurallar.ts';
import { katla, type TaniParcasi } from '../../../ortak/cizim/okuma.ts';
import { useCizimOrtami } from '../../../ortak/cizim/ortam.tsx';
import type { ResimBelgesi, TaniBilgisi, TeknikResimKontrolu } from '../../../ortak/cizim/TeknikResim.tsx';

// Okuma ayarları ve tanı (2038 a, prototip 17:04:27): Üretim Hazırlık › Çizim sayfasındaki ayar panelinin aynısı, Resim ve modeller'de
// sağ çekmece. Ayar cihazdadır (2033: Hazırlık'la ortak kayıt); kontrol planı değişmez, yalnız resim yeni ayarla yeniden okunur.

export type OkumaSekmesi = 'pdf' | '3d' | 'diag';
type Katman = Record<BolgeSinifi | 'zones' | 'ocr', boolean>;
type Tani = TaniBilgisi & { at: number };
export interface YenidenOkuma { n: number; taze: boolean }

const KATMAN_VARSAYILANI: Katman = { dim: true, table: true, border: true, notes: true, prose: true, stack: false, none: true, zones: true, ocr: true };
const SEKMELER: readonly [OkumaSekmesi, string][] = [['pdf', 'PDF'], ['3d', '3B model'], ['diag', 'Tanı']];
const BALON_BOYU: readonly [number, string][] = [[0.8, 'S'], [1, 'M'], [1.25, 'L'], [1.5, 'XL']];
const AYIKLAMA = [
  ['table', 'Antet ve tablolar', 'Malzeme, revizyon, parça listesi'], ['border', 'Pafta kenarı', 'Kenardaki A–F / 1–8 kare harfleri'],
  ['notes', 'Notlar', '"NOTLAR" başlığı altındaki satırlar'], ['prose', 'Açıklama cümleleri', 'Uzun yazılar'],
] as const;

export interface OkumaDurumu {
  cfg: OkumaAyari; uygulanan: OkumaAyari; degisti: boolean; sekme: OkumaSekmesi; katmanlar: Katman; tani: Tani | null; okuma: YenidenOkuma | null;
  ayarYaz: <K extends keyof OkumaAyari>(k: K, v: OkumaAyari[K]) => void;
  ayiklamaYaz: (k: keyof OkumaAyari['ex'], v: boolean) => void;
  sekmeYaz: (s: OkumaSekmesi) => void;
  katmanYaz: (k: keyof Katman, v: boolean) => void;
  uygula: (taze: boolean) => void;
  varsayilana: () => void;
  herYerde: () => void;
  sifirla: () => void;
  // Teknik resme verilecek alanlar; çekmece kapalıyken tanı istenmez (görüntüleyici tanı için ek hesap yapar).
  kontrol: (acik: boolean) => Pick<TeknikResimKontrolu, 'ayar' | 'tani' | 'katman'>;
}

export function useOkumaAyari(): OkumaDurumu {
  const { ayarlar: cihaz } = useCizimOrtami();
  const { bildir } = useBildirim();
  const [cfg, cfgYaz] = useState<OkumaAyari>(() => cihazAyari(cihaz));
  const [uygulanan, uygulananYaz] = useState<OkumaAyari>(() => cihazAyari(cihaz));
  const [sekme, sekmeYaz] = useState<OkumaSekmesi>('pdf');
  const [katmanlar, katmanlarYaz] = useState<Katman>(KATMAN_VARSAYILANI);
  const [tani, taniYaz] = useState<Tani | null>(null);
  const [okuma, okumaYaz] = useState<YenidenOkuma | null>(null);

  const ayarYaz = useCallback(<K extends keyof OkumaAyari>(k: K, v: OkumaAyari[K]) => { cfgYaz((c) => ayarDuzelt({ ...c, [k]: v })); }, []);
  const ayiklamaYaz = useCallback((k: keyof OkumaAyari['ex'], v: boolean) => { cfgYaz((c) => ayarDuzelt({ ...c, ex: { ...c.ex, [k]: v } })); }, []);
  const katmanYaz = useCallback((k: keyof Katman, v: boolean) => { katmanlarYaz((o) => ({ ...o, [k]: v })); }, []);
  const uygula = useCallback((taze: boolean) => {
    uygulananYaz(cfg); taniYaz(null); okumaYaz({ n: Date.now(), taze });
  }, [cfg]);
  const varsayilana = useCallback(() => { cfgYaz(ayarDuzelt({})); }, []);
  const herYerde = useCallback(() => { cihazAyariYaz(cihaz, cfg); bildir('tamam', 'Ayarlar bu cihazda tüm ekranlarda kullanılacak'); }, [cihaz, cfg, bildir]);
  const sifirla = useCallback(() => { okumaYaz(null); taniYaz(null); }, []);
  const taniAl = useCallback((d: TaniBilgisi) => { taniYaz((o) => ({ ...o, ...d, at: Date.now() })); }, []);

  const segs: readonly TaniParcasi[] = tani?.diag?.segs ?? [], osegs: readonly TaniParcasi[] = tani?.ocrDiag?.segs ?? [];
  const katman = useCallback((doc: ResimBelgesi) => {
    // Renkli kutular yalnız Tanı sekmesinde.
    if (sekme !== 'diag' || !tani || doc.kind !== 'pdf' || !tani.C || tani.C.w !== doc.w) return null;
    const bir = (s: TaniParcasi, i: number, ocr: boolean) => {
      const z = bolgeSinifi(String(s.z));
      if (!katmanlar[z] || (ocr && !katmanlar.ocr)) return null;
      return (
        <g key={(ocr ? 'o' : 't') + String(i)} transform={'translate(' + s.x.toFixed(1) + ' ' + s.y.toFixed(1) + ') rotate(' + (s.a * 180 / Math.PI).toFixed(1) + ')'}>
          <rect className={`tc-ay5-tani-yazi tc-ay5-z-${z}${ocr ? ' tc-ay5-tani-ocr' : ''}`} x={-s.w / 2 - s.h * 0.35} y={-s.h * 0.95} width={s.w + s.h * 0.7} height={s.h * 1.6} rx={s.h * 0.2}>
            <title>{(ocr ? 'OCR · ' : '') + BOLGE_SINIFLARI[z] + ' · ' + s.t}</title>
          </rect>
        </g>
      );
    };
    const bolgeler = katmanlar.zones ? [...(tani.diag?.zones ?? []), ...(tani.ocrDiag?.zones ?? [])].map((z, i) => (
      <rect key={'z' + String(i)} className={`tc-ay5-tani-bolge tc-ay5-z-${bolgeSinifi(z.why)}`} x={z.x0} y={z.y0} width={z.x1 - z.x0} height={z.y1 - z.y0} />
    )) : null;
    return <g>{bolgeler}{segs.map((s, i) => bir(s, i, false))}{osegs.map((s, i) => bir(s, i, true))}</g>;
  }, [tani, katmanlar, sekme, segs, osegs]);

  const kontrol = useCallback((acik: boolean) => ({ ayar: uygulanan, ...(acik ? { tani: taniAl, katman } : {}) }), [uygulanan, taniAl, katman]);
  const degisti = JSON.stringify(cfg) !== JSON.stringify(uygulanan);
  return { cfg, uygulanan, degisti, sekme, katmanlar, tani, okuma, ayarYaz, ayiklamaYaz, sekmeYaz, katmanYaz, uygula, varsayilana, herYerde, sifirla, kontrol };
}

function Dilimler<D extends string | number>({ etiket, v, sec, secenekler, kapali }: {
  etiket: string; v: D; sec: (d: D) => void; secenekler: readonly (readonly [D, string])[]; kapali: boolean;
}) {
  return (
    <div className="tc-ay5-dilimler" role="group" aria-label={etiket}>
      {secenekler.map(([k, l]) => (
        <button key={String(k)} type="button" disabled={kapali} className={`tc-ay5-dilim${String(v) === String(k) ? ' tc-ay5-acik' : ''}`} aria-pressed={String(v) === String(k)} onClick={() => { sec(k); }}>{l}</button>
      ))}
    </div>
  );
}
function Ayar({ l, d, children }: { l: string; d?: string; children: ReactNode }) {
  return <div className="tc-ay5-ayar"><div><b>{l}</b>{d && <small>{d}</small>}</div>{children}</div>;
}
function Anahtar({ l, d, acik, degistir, kapali }: { l: string; d?: string; acik: boolean; degistir: (v: boolean) => void; kapali: boolean }) {
  return (
    <div className="tc-ay5-anahtar">
      <div className="tc-ay5-metin"><b>{l}</b>{d && <small>{d}</small>}</div>
      <AcKapa etiket={l} acik={acik} degistir={degistir} disabled={kapali} />
    </div>
  );
}
function Deger({ l, v, z }: { l: string; v: ReactNode; z?: string }) {
  return <div><span>{l}</span><b className={z ? `tc-ay5-tonlu tc-ay5-z-${z}` : undefined}>{v}</b></div>;
}
const sayi = (n: number) => n.toLocaleString('tr-TR');

// `degistirir` yoksa (kontrol planını düzenleyemeyen) çekmece salt okunurdur: ayar ve tanı görünür, değiştirilemez.
export function OkumaAyarlari({ d, kapat, degistirir, dosyaVar }: { d: OkumaDurumu; kapat: () => void; degistirir: boolean; dosyaVar: boolean }) {
  const [q, qYaz] = useState('');
  const { cfg, ayarYaz: up, ayiklamaYaz: upEx } = d;
  const k = !degistirir;
  const info = d.tani, C = info?.C, S = info?.dims?.stats ?? {}, M = info?.model;
  const segs = useMemo(() => info?.diag?.segs ?? [], [info]), osegs = useMemo(() => info?.ocrDiag?.segs ?? [], [info]);
  const nz = (z: BolgeSinifi) => segs.filter((s) => bolgeSinifi(String(s.z)) === z).length + osegs.filter((s) => bolgeSinifi(String(s.z)) === z).length;
  const liste = [...segs.map((s) => ({ ...s, src: 'PDF' })), ...osegs.map((s) => ({ ...s, src: 'OCR' }))].filter((s) => !q || katla(s.t).includes(katla(q)));
  const elenen = (S.table || 0) + (S.border || 0) + (S.notes || 0) + (S.prose || 0);

  const pdfAyari = (
    <>
      <span className="tc-ay5-bolum">Görüntü</span>
      <Ayar l="Çizim çözünürlüğü" d="Uzun kenar piksel · keskinlik ↔ hız/bellek"><Dilimler kapali={k} etiket="Çizim çözünürlüğü" v={cfg.res} sec={(v) => { up('res', v); }} secenekler={[[3000, 'Hızlı'], [4200, 'Normal'], [6000, 'Keskin']]} /></Ayar>
      <Ayar l="Çizgi kalınlaştırma" d="İnce CAD çizgileri ekranda kaybolmasın"><Dilimler kapali={k} etiket="Çizgi kalınlaştırma" v={cfg.bold} sec={(v) => { up('bold', v); }} secenekler={[[0, 'Yok'], [1, 'Hafif'], [2, 'Kalın']]} /></Ayar>
      <Ayar l="Renk" d="Net: yüksek kontrast · Mavi: teknik resim görünümü · Orijinal: PDF'in kendi renkleri"><Dilimler kapali={k} etiket="Renk" v={cfg.look} sec={(v) => { up('look', v); }} secenekler={[['net', 'Net'], ['blue', 'Mavi'], ['orig', 'Orijinal']]} /></Ayar>
      <span className="tc-ay5-bolum">Görüntüden okuma (OCR)</span>
      <Ayar l="OCR" d="Otomatik: metin katmanı yoksa ya da ölçüler çizgiye dönmüşse"><Dilimler kapali={k} etiket="OCR" v={cfg.ocr} sec={(v) => { up('ocr', v); }} secenekler={[['auto', 'Otomatik'], ['always', 'Her zaman'], ['off', 'Kapalı']]} /></Ayar>
      <Ayar l="OCR keskinliği" d="Büyük paftada (A2–A0) karo karo yüksek çözünürlük"><Dilimler kapali={k} etiket="OCR keskinliği" v={cfg.dpi} sec={(v) => { up('dpi', v); }} secenekler={[[2.4, 'Hızlı'], [3.2, 'Normal'], [4.2, 'İnce yazı']]} /></Ayar>
      <Ayar l="Otomatik OCR eşiği" d="Metinden bundan az ölçü çıkarsa görüntüden tamamla"><Dilimler kapali={k} etiket="Otomatik OCR eşiği" v={cfg.minDims} sec={(v) => { up('minDims', v); }} secenekler={[[1, '1'], [3, '3'], [6, '6'], [12, '12']]} /></Ayar>
      <span className="tc-ay5-bolum">Ayıklama · ölçü sayılmayacak yazılar</span>
      {AYIKLAMA.map(([a, l, t]) => <Anahtar key={a} kapali={k} l={l} d={t} acik={!!cfg.ex[a]} degistir={(v) => { upEx(a, v); }} />)}
      <span className="tc-ay5-bolum">Öneri listesi ve balonlar</span>
      <Ayar l="Otomatik işaretle" d="Hangi güven seviyesi seçili gelsin"><Dilimler kapali={k} etiket="Otomatik işaretle" v={cfg.auto} sec={(v) => { up('auto', v); }} secenekler={[['high', 'Yüksek'], ['mid', '+ Kontrol et'], ['low', 'Hepsi']]} /></Ayar>
      <Ayar l="Balon boyutu"><Dilimler kapali={k} etiket="Balon boyutu" v={cfg.balS} sec={(v) => { up('balS', v); }} secenekler={BALON_BOYU} /></Ayar>
    </>
  );
  const modelAyari = (
    <>
      <span className="tc-ay5-bolum">Model işleme</span>
      <Ayar l="Ağ kalitesi" d="Üçgenleme sıklığı · eğrisel yüzeylerin pürüzsüzlüğü"><Dilimler kapali={k} etiket="Ağ kalitesi" v={cfg.mesh} sec={(v) => { up('mesh', v); }} secenekler={[['coarse', 'Kaba'], ['normal', 'Normal'], ['fine', 'İnce']]} /></Ayar>
      <Ayar l="Ön görünüş ekseni" d="Otomatik: delik/mil eksenine göre"><Dilimler kapali={k} etiket="Ön görünüş ekseni" v={cfg.fa} sec={(v) => { up('fa', v); }} secenekler={[['auto', 'Otomatik'], ['X', 'X'], ['Y', 'Y'], ['Z', 'Z']]} /></Ayar>
      <Anahtar kapali={k} l="Gizli çizgiler" d="Arkada kalan kenarlar kesikli çizilir" acik={cfg.hidden} degistir={(v) => { up('hidden', v); }} />
      <Anahtar kapali={k} l="Otomatik ölçülendirme" d="Çaplar, delik grupları, PCD, kademe boyları" acik={cfg.autoDim} degistir={(v) => { up('autoDim', v); }} />
      <span className="tc-ay5-bolum">Balonlar</span>
      <Ayar l="Balon boyutu"><Dilimler kapali={k} etiket="Balon boyutu" v={cfg.balS} sec={(v) => { up('balS', v); }} secenekler={BALON_BOYU} /></Ayar>
    </>
  );
  const taniGorunumu = (
    <>
      {!info && <p className="tc-ay5-soluk">Resim açılınca okuma sonuçları, süreler ve ham yazılar burada görünür. Görmüyorsan Uygula · yeniden oku de.</p>}
      {C && info && (
        <>
          <div className="tc-ay5-istatistik">
            <Deger l="Sayfa" v={String(C.w) + '×' + String(C.h) + ' px'} /><Deger l="Ölçek" v={C.scale.toFixed(2) + ' px/pt'} />
            <Deger l="PDF yazısı" v={String(C.items.length) + (C.junk ? ' · bozuk font' : '')} {...(C.junk ? { z: 'none' } : {})} />
            <Deger l="Metin katmanı" v={C.textless ? 'yok' : 'var'} z={C.textless ? 'table' : 'dim'} />
            <Deger l="OCR" v={info.needOcr ? (C.ocrDims ? String(C.ocrDims.length) + ' ölçü' : 'çalıştı') : 'gerekmedi'} {...(info.needOcr ? { z: 'ocr' } : {})} />
            <Deger l="Bulunan" v={String((info.dims || []).length) + ' ölçü'} z="dim" />
            <Deger l="Yüksek / kontrol / düşük" v={String(S.high || 0) + ' / ' + String(S.mid || 0) + ' / ' + String(S.low || 0)} />
            <Deger l="Elenen" v={String(elenen) + ' yazı'} />
            {C.ms ? (
              <>
                <Deger l="Çizim" v={String(C.ms.render || 0) + ' ms'} /><Deger l="Ölçü ayıklama" v={String(C.ms.dims || 0) + ' ms'} />
                {C.ms.ocr ? <Deger l="OCR" v={(C.ms.ocr / 1000).toFixed(1) + ' sn'} /> : null}
              </>
            ) : <Deger l="Kaynak" v="önbellek" />}
          </div>
          <span className="tc-ay5-bolum">Katmanlar · bu sekme açıkken resimde renkli çerçeveler</span>
          <div className="tc-ay5-cipler">
            {(Object.keys(BOLGE_SINIFLARI) as BolgeSinifi[]).map((z) => (
              <button key={z} type="button" className={`tc-ay5-cip tc-ay5-z-${z}`} aria-pressed={d.katmanlar[z]} onClick={() => { d.katmanYaz(z, !d.katmanlar[z]); }}><i />{BOLGE_SINIFLARI[z]}<b>{nz(z)}</b></button>
            ))}
            <button type="button" className="tc-ay5-cip tc-ay5-z-zones" aria-pressed={d.katmanlar.zones} onClick={() => { d.katmanYaz('zones', !d.katmanlar.zones); }}><i />Bölgeler</button>
            {osegs.length > 0 && <button type="button" className="tc-ay5-cip tc-ay5-z-ocr" aria-pressed={d.katmanlar.ocr} onClick={() => { d.katmanYaz('ocr', !d.katmanlar.ocr); }}><i />OCR yazıları<b>{osegs.length}</b></button>}
          </div>
          <span className="tc-ay5-bolum">Ham yazılar · {liste.length}</span>
          <Girdi etiket="Ham yazılarda ara" placeholder="Ara: Ø25, H7, malzeme…" value={q} onChange={(e) => { qYaz(e.target.value); }} />
          <div className="tc-ay5-ham">
            {liste.slice(0, 400).map((s, i) => {
              const z = bolgeSinifi(String(s.z));
              return <div key={i} className={`tc-ay5-ham-satir tc-ay5-z-${z}`}><i /><span className="tc-ay5-mono">{s.t}</span><small>{s.src} · {BOLGE_SINIFLARI[z]}</small></div>;
            })}
          </div>
        </>
      )}
      {M && info && (
        <div className="tc-ay5-istatistik">
          <Deger l="Biçim" v={M.kind} /><Deger l="Süre" v={String(info.ms) + ' ms' + ((info.ms ?? 0) < 400 ? ' · önbellek' : '')} />
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

  return (
    <aside id="km-st-okuma" className="km-st-okuma tc-ay5-panel" aria-label="Okuma ayarları">
      <div className="tc-ay5-cekmece-ust">
        <b>Okuma ayarları</b>
        <button type="button" className="tc-ay5-kapat" aria-label="Okuma ayarlarını kapat" onClick={kapat}><Simge ad="x" /></button>
      </div>
      <div className="tc-ay5-dilimler tc-ay5-sekmeler" role="tablist" aria-label="Ayar sekmeleri">
        {SEKMELER.map(([s, l]) => (
          <button key={s} type="button" role="tab" aria-selected={d.sekme === s} className={`tc-ay5-dilim${d.sekme === s ? ' tc-ay5-acik' : ''}`} onClick={() => { d.sekmeYaz(s); }}>
            {l}{s === 'diag' && info && <i className="tc-ay5-isaret" aria-label="sonuç var" />}
          </button>
        ))}
      </div>
      <div className="tc-ay5-ayar-govde" role="tabpanel">{d.sekme === 'pdf' ? pdfAyari : d.sekme === '3d' ? modelAyari : taniGorunumu}</div>
      {k ? <p className="tc-ay5-soluk">Ayarları kontrol planını düzenleyen değiştirir.</p> : (
        <div className="tc-ay5-eylemler">
          <div className="tc-ay5-eylem-satiri">
            <Dugme tur="birincil" simge="check" disabled={!dosyaVar || !d.degisti} onClick={() => { d.uygula(false); }}>{d.degisti ? 'Uygula · yeniden oku' : 'Ayarlar uygulandı'}</Dugme>
            <Dugme simge="bolt" title="Önbelleği atlayıp baştan işle" aria-label="Önbelleği atlayıp baştan işle" disabled={!dosyaVar} onClick={() => { d.uygula(true); }} />
            <Dugme simge="back" title="Varsayılan ayarlara dön" aria-label="Varsayılan ayarlara dön" onClick={d.varsayilana} />
          </div>
          <Dugme simge="layers" onClick={d.herYerde}>Bu cihazda tüm ekranlarda kullan</Dugme>
        </div>
      )}
    </aside>
  );
}
