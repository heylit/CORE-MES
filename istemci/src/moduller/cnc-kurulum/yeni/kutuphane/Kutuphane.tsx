import { useCallback, useEffect, useRef, useState, type PointerEvent as TepkiImleci } from 'react';
import { Dugme, IsaretKutusu, OnayPenceresi, Simge } from '../../../../ortak/arayuz/index.ts';
import { useCncSurum } from '../depo.ts';
import { clamp } from '../bicim.ts';
import { byId, invKey } from '../secici.ts';
import { onbellekSil } from '../sahne/gl.ts';
import { Sahne, type Cizim, type Dikdortgen } from '../sahne/Sahne.tsx';
import { useTuslar } from '../gorunum.ts';
import { download } from '../indir.ts';
import { useCncYetkisi } from '../veri.ts';
import { KalemAyrintisi } from './KalemAyrintisi.tsx';
import { Liste, resimUnut } from './Liste.tsx';
import { Onizleme } from './onizleme.ts';
import { LSH, LSP, RafSahnesi } from './raf-sahnesi.ts';
import {
  allShelves, bumpQty, deleteCustom, ozet, saveEdit, stokCsvAdi, stokCsvMetni, suzulmusRaflar, tezgahOzetleri,
  type Duzenleme, type DuzenlemeAlanlari, type Kalem, type Raf,
} from './raf.ts';
import './kutuphane.css';

// Raf ve seçim durumu karede okunur (prototipin L'si); React yalnız görünen metni çizer.
interface Gezinme {
  r: number;
  sel: Record<string, string>;
  curKey: string | undefined;
  dragR: number | null;
  dragK: number | null;
}

function seciliSira(g: Gezinme, raflar: Raf[], ri: number): number {
  const row = raflar[ri];
  if (!row) return 0;
  const i = row.items.findIndex((x) => x.id === g.sel[row.key]);
  return i < 0 ? 0 : i;
}

// Kalem ya da tanım değişince önbellekteki resim ve dokular bırakılır (prototipin invalidateItem'ı).
function kalemiUnut(id: string): void { onbellekSil(id); resimUnut(id); }

export function Kutuphane() {
  const surum = useCncSurum();
  const yetki = useCncYetkisi();
  const sahne = useRef<RafSahnesi | null>(null);
  const onizleme = useRef<Onizleme | null>(null);
  const g = useRef<Gezinme>({ r: 0, sel: {}, curKey: undefined, dragR: null, dragK: null });
  const sahneKutusu = useRef<HTMLDivElement>(null);
  const sahneDikdortgeni = useRef<Dikdortgen | null>(null);
  const [mode, modeYaz] = useState<'3d' | 'list'>('3d');
  const [aramaMetni, aramaMetniYaz] = useState('');
  const [suzgec, suzgecYaz] = useState({ q: '', mach: '', low: false });
  const [raflar, raflarYaz] = useState<Raf[]>([]);
  const [kirli, kirliYaz] = useState(1);
  const [, ciz] = useState(0);
  const yenile = useCallback(() => { ciz((n) => n + 1); }, []);
  const [duzenleme, duzenlemeYaz] = useState<Duzenleme | null>(null);
  const [silinecek, silinecekYaz] = useState<Kalem | null>(null);
  const [panelAcik, panelAcikYaz] = useState(false);

  if (sahne.current === null) sahne.current = new RafSahnesi();
  if (onizleme.current === null) onizleme.current = new Onizleme();
  useEffect(() => () => { sahne.current?.birakHepsi(); onizleme.current?.birak(); }, []);

  // Süzgeç, özel kalem ve görünüme giriş rafları yeniden kurar (prototipte L.dirty).
  useEffect(() => {
    const yeni = suzulmusRaflar(suzgec);
    g.current.r = sahne.current!.kur(yeni, g.current.curKey, g.current.r);
    raflarYaz(yeni);
  }, [suzgec, kirli]);
  // Arama yazılırken 200 ms beklenir.
  useEffect(() => {
    const t = setTimeout(() => { suzgecYaz((f) => (f.q === aramaMetni.trim() ? f : { ...f, q: aramaMetni.trim() })); }, 200);
    return () => { clearTimeout(t); };
  }, [aramaMetni]);

  const row = raflar[g.current.r];
  const k = seciliSira(g.current, raflar, g.current.r);
  const it = row?.items[k] ?? null;
  if (row) g.current.curKey = row.key;
  if (it) onizleme.current.goster(it);

  const lSetSel = (ri: number, kk: number): void => {
    const r = raflar[ri];
    if (!r) return;
    g.current.sel[r.key] = r.items[clamp(Math.round(kk), 0, r.items.length - 1)]!.id;
    duzenlemeYaz(null);
    yenile();
  };
  const lGoRow = (ri: number): void => {
    const yeni = clamp(Math.round(ri), 0, raflar.length - 1);
    if (yeni === g.current.r || !raflar.length) return;
    g.current.r = yeni;
    lSetSel(yeni, sahne.current!.cx / LSP);
  };
  const lMove = (d: number): void => { lSetSel(g.current.r, seciliSira(g.current, raflar, g.current.r) + d); };
  // Stok ya da atama değişince rafın etiketleri yenilenir; raf yeniden kurulmaz (prototipin refreshLibLabels'ı).
  useEffect(() => { sahne.current?.etiketleriYenile(null); }, [surum]);

  useTuslar(true, (e: KeyboardEvent) => {
    if (mode === 'list') return;
    const t = e.key;
    let h = true;
    if (t === 'ArrowDown' || t === 's' || t === 'S') lGoRow(g.current.r + 1);
    else if (t === 'ArrowUp' || t === 'w' || t === 'W') lGoRow(g.current.r - 1);
    else if (t === 'ArrowRight' || t === 'd' || t === 'D') lMove(1);
    else if (t === 'ArrowLeft' || t === 'a' || t === 'A') lMove(-1);
    else if (t === 'Home') lSetSel(g.current.r, 0);
    else if (t === 'End') lSetSel(g.current.r, 1e6);
    else if ((t === '+' || t === '=' || t === '-') && it && yetki.yazabilir) bumpQty(invKey(it), t === '-' ? -1 : 1);
    else h = false;
    if (h) e.preventDefault();
  });

  /* ---------- sürükleme, tıklama, tekerlek (prototipin lStage olayları) ---------- */
  const surukle = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; r0: number; k0: number } | null>(null);
  const imlecBas = (e: TepkiImleci<HTMLDivElement>): void => {
    if (mode !== '3d' || (e.target as HTMLElement).closest('button,input,select,label')) return;
    surukle.current = { x: e.clientX, y: e.clientY, axis: null, r0: g.current.r, k0: k };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* imleç yakalanamazsa sürükleme yine çalışır */ }
    e.currentTarget.dataset.tut = '';
  };
  const imlecGezin = (e: TepkiImleci<HTMLDivElement>): void => {
    const r = sahneDikdortgeni.current, s = sahne.current!;
    if (r) { s.mx = (e.clientX - r.left) / r.width - 0.5; s.my = (e.clientY - r.top) / r.height - 0.5; }
    const d = surukle.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.axis && Math.sqrt(dx * dx + dy * dy) > 8) d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    const satir = raflar[g.current.r];
    if (!satir) return;
    if (d.axis === 'x') g.current.dragK = clamp(d.k0 - dx / (s.px * LSP), 0, satir.items.length - 1);
    if (d.axis === 'y') g.current.dragR = clamp(d.r0 - dy / (s.px * LSH * 0.6), 0, raflar.length - 1);
  };
  const imlecBit = (e: TepkiImleci<HTMLDivElement>): void => {
    const d = surukle.current;
    if (!d) return;
    delete e.currentTarget.dataset.tut;
    if (!d.axis) {
      const r = sahneDikdortgeni.current;
      const hit = e.type === 'pointerup' && r ? sahne.current!.sec(r, e.clientX, e.clientY) : null;
      if (hit) { g.current.r = hit.row; lSetSel(hit.row, hit.k); }
    } else if (d.axis === 'x' && g.current.dragK != null) { const kk = g.current.dragK; g.current.dragK = null; lSetSel(g.current.r, kk); }
    else if (d.axis === 'y' && g.current.dragR != null) { const r = g.current.dragR; g.current.dragR = null; lGoRow(r); }
    surukle.current = null; g.current.dragK = g.current.dragR = null;
  };
  const tekerlekIsleyici = useRef<(e: WheelEvent) => void>(() => undefined);
  const birikim = useRef({ x: 0, y: 0, son: 0 });
  tekerlekIsleyici.current = (e: WheelEvent) => {
    if (mode !== '3d' || (e.target as HTMLElement).closest('.tc-cl-cubuk')) return;
    e.preventDefault();
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 33; dy *= 33; }
    if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) { dx = dy; dy = 0; }
    const b = birikim.current;
    if (Math.abs(dx) > Math.abs(dy)) { b.x += dx; b.y = 0; } else { b.y += dy; b.x = 0; }
    const now = performance.now();
    if (now - b.son < 85) return;
    if (Math.abs(b.y) >= 40) { lGoRow(g.current.r + (b.y > 0 ? 1 : -1)); b.y = 0; b.son = now; }
    else if (Math.abs(b.x) >= 40) { lMove(b.x > 0 ? 1 : -1); b.x = 0; b.son = now; }
  };
  useEffect(() => {
    const el = sahneKutusu.current;
    if (!el) return;
    const dinle = (e: WheelEvent): void => { tekerlekIsleyici.current(e); };
    el.addEventListener('wheel', dinle, { passive: false });
    return () => { el.removeEventListener('wheel', dinle); };
  }, []);

  const rafCiz = (c: Cizim): void => {
    sahneDikdortgeni.current = c.rect;
    if (mode !== '3d') return;
    sahne.current!.kare({ renderer: c.renderer, rect: c.rect, dt: c.dt, r: g.current.r, k: seciliSira(g.current, raflar, g.current.r), dragR: g.current.dragR, dragK: g.current.dragK });
  };
  const onizlemeCiz = (c: Cizim): void => { onizleme.current!.kare(c.renderer, c.rect, c.dt); };
  const pv = onizleme.current;

  /* ---------- düzenleme ---------- */
  const yeniKalem = (): void => {
    if (mode === 'list') modeYaz('3d');
    const base = it ?? allShelves()[0]!.items[0]!;
    duzenlemeYaz({ mode: 'new', base, shelf: row ? row.key : 'mill' });
    panelAcikYaz(true);
  };
  const kaydet = (alanlar: DuzenlemeAlanlari): void => {
    if (!duzenleme) return;
    const sonuc = saveEdit(duzenleme, alanlar);
    if (duzenleme.mode === 'new' && sonuc.shelf) { g.current.sel[sonuc.shelf] = sonuc.id; g.current.curKey = sonuc.shelf; }
    else kalemiUnut(sonuc.id);
    onizleme.current!.unut();
    duzenlemeYaz(null);
    kirliYaz((n) => n + 1);
  };
  const sablonDegistir = (raf: string, kalemId: string): void => {
    const sh = allShelves().find((x) => x.key === raf);
    const base = sh && (byId(sh.items, kalemId) as Kalem | null);
    if (base) duzenlemeYaz({ mode: 'new', base, shelf: raf });
  };
  const sil = (): void => {
    if (!silinecek) return;
    deleteCustom(silinecek);
    kalemiUnut(silinecek.id);
    silinecekYaz(null);
    onizleme.current!.unut();
    kirliYaz((n) => n + 1);
  };

  const oz = ozet();
  const tezgahlar = tezgahOzetleri();

  return (
    <div className="tc-cl-kutuphane" data-panel={panelAcik ? 'acik' : undefined}>
      <div
        ref={sahneKutusu} className="tc-cl-sahne" data-kip={mode}
        onPointerDown={imlecBas} onPointerMove={imlecGezin} onPointerUp={imlecBit} onPointerCancel={imlecBit}
      >
        {mode === '3d' && <Sahne ciz={rafCiz} sinif="tc-cl-tuval" />}
        <div className="tc-cl-bilgi">
          <div className="tc-cl-adimno">RAF <b>{raflar.length ? g.current.r + 1 : 0}</b> / <span>{raflar.length}</span></div>
          <div className="tc-cl-rafadi">{row ? row.title : 'Sonuç yok'}</div>
          <div className="tc-cl-kalemadi">{it && row ? `${it.name}  ·  ${String(k + 1)} / ${String(row.items.length)}` : ''}</div>
        </div>
        <div className="tc-cl-cubuk">
          <input
            className="tc-alan-kutu" type="search" aria-label="Kütüphanede ara" placeholder="Ara: ad, kod, Ø10, M8…" autoComplete="off"
            value={aramaMetni} onChange={(o) => { aramaMetniYaz(o.target.value); }}
          />
          <select
            className="tc-alan-kutu" aria-label="Tezgâh" value={suzgec.mach}
            onChange={(o) => { suzgecYaz({ ...suzgec, mach: o.target.value }); }}
          >
            <option value="">Tüm tezgâhlar</option>
            {tezgahlar.map((m) => <option key={m.id} value={m.id}>{`${m.name} · ${String(m.aktif)} aktif`}</option>)}
          </select>
          <IsaretKutusu etiket="Kritik / eksik" checked={suzgec.low} onChange={(o) => { suzgecYaz({ ...suzgec, low: o.target.checked }); }} />
          <div className="tc-cl-segment" role="group" aria-label="Görünüm">
            <Dugme simge="cube" aria-pressed={mode === '3d'} onClick={() => { modeYaz('3d'); }}>3D Raf</Dugme>
            <Dugme simge="list" aria-pressed={mode === 'list'} onClick={() => { modeYaz('list'); }}>Liste</Dugme>
          </div>
          {yetki.yazabilir && <Dugme simge="plus" onClick={yeniKalem}>Yeni kalem</Dugme>}
          <Dugme simge="download" onClick={() => { download(stokCsvAdi(), stokCsvMetni(), 'text/csv;charset=utf-8'); }}>Stok CSV</Dugme>
        </div>
        {mode === 'list' && <Liste raflar={raflar} seciliId={it?.id ?? null} sec={(ri, kk) => { g.current.r = ri; lSetSel(ri, kk); modeYaz('3d'); }} />}
        {!raflar.length && <div className="tc-cl-bos">Filtreye uyan malzeme yok</div>}
        {mode === '3d' && (
          <>
            <div className="tc-cl-denetim">
              <button type="button" className="tc-cl-ok" title="Önceki malzeme" aria-label="Önceki malzeme" onClick={() => { lMove(-1); }}><Simge ad="chev-left" /></button>
              <div className="tc-cl-dikey">
                <button type="button" className="tc-cl-ok" title="Üst raf" aria-label="Üst raf" onClick={() => { lGoRow(g.current.r - 1); }}><Simge ad="up" /></button>
                <button type="button" className="tc-cl-ok" title="Alt raf" aria-label="Alt raf" onClick={() => { lGoRow(g.current.r + 1); }}><Simge ad="down" /></button>
              </div>
              <button type="button" className="tc-cl-ok" title="Sonraki malzeme" aria-label="Sonraki malzeme" onClick={() => { lMove(1); }}><Simge ad="chev-right" /></button>
            </div>
            <div className="tc-cl-ipucu">
              <kbd>Tekerlek</kbd> / <kbd>▲</kbd><kbd>▼</kbd> raf değiştir<br />
              <kbd>Shift+Tekerlek</kbd> / <kbd>◀</kbd><kbd>▶</kbd> malzeme seç<br />
              <kbd>+</kbd> <kbd>−</kbd> stok adedi · Tıkla: seç
            </div>
          </>
        )}
      </div>
      <aside className="tc-cl-yan" aria-label="Malzeme kartı">
        <button type="button" className="tc-cl-tutamak" aria-expanded={panelAcik} onClick={() => { panelAcikYaz(!panelAcik); }}>
          <Simge ad={panelAcik ? 'down' : 'up'} boyut="k" /> Malzeme Kartı
        </button>
        <div
          className="tc-cl-onizleme"
          onPointerDown={(e) => { pv.surukle = e.clientX; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yakalanamazsa yine döner */ } }}
          onPointerMove={(e) => { if (pv.surukle == null) return; pv.yaw += (e.clientX - pv.surukle) * 0.012; pv.surukle = e.clientX; pv.autoT = 2.5; }}
          onPointerUp={() => { pv.surukle = null; }} onPointerCancel={() => { pv.surukle = null; }}
        >
          <Sahne ciz={onizlemeCiz} sinif="tc-cl-tuval" />
          <div className="tc-cl-dondur">sürükle: döndür</div>
        </div>
        <section className="tc-cl-ayrinti">
          {it && row
            ? (
              <KalemAyrintisi
                it={it} raf={row} duzenleme={duzenleme} duzenle={duzenlemeYaz} kaydet={kaydet} sablonDegistir={sablonDegistir}
                sil={() => { silinecekYaz(it); }}
              />
            )
            : <p className="tc-cl-not">Filtreye uyan malzeme yok.</p>}
        </section>
        <section className="tc-cl-ozet">
          <div className="tc-cl-ara-baslik">Özet</div>
          <div className="tc-cl-ozetler">
            <div><b>{oz.tot}</b><small>kalem</small></div>
            <div><b>{oz.entered}</b><small>stok girildi</small></div>
            <div><b className="tc-cl-st-low">{oz.low}</b><small>kritik</small></div>
            <div><b className="tc-cl-st-short">{oz.short}</b><small>eksik</small></div>
          </div>
          <div className="tc-cl-ara-baslik">Tezgâhlar <em>tıkla: filtrele</em></div>
          {tezgahlar.map((m) => (
            <button
              key={m.id} type="button" className="tc-cl-tezgahkart" aria-pressed={suzgec.mach === m.id}
              onClick={() => { suzgecYaz({ ...suzgec, mach: suzgec.mach === m.id ? '' : m.id }); }}
            >
              <b>{m.name}</b>
              <span>{`${String(m.aktif)} kalem aktif${m.yuklu !== null ? ` · ${String(m.yuklu)} takım yüklü` : ' · kurulum yok'}`}</span>
            </button>
          ))}
        </section>
      </aside>
      <OnayPenceresi
        acik={silinecek !== null} baslik="Kalemi sil" tehlikeli onayMetni="Sil" onayla={sil} vazgec={() => { silinecekYaz(null); }}
      >
        <p>{`“${silinecek?.name ?? ''}” kütüphaneden silinsin mi? Kurulumdaki cepleri boşaltılır.`}</p>
      </OnayPenceresi>
    </div>
  );
}

