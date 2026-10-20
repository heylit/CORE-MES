import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { RafTuru, YerlesimCevabi, YerlesimKaydetGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { NUMARA, NUMARALAMALAR } from './gorunum.ts';
import { hataMetni, useIslem } from './ortak.tsx';
import type { Bina, Kabul, YerRafi } from './yerlesim.ts';
import {
  KORIDOR, RAF_TIPLERI, adresAraligi, bolmeNo, bosYerBul, cakisanlar, carpisir, dunyaya, ilkYerlesim, onYuz, rafUzunlugu, sonrakiKod, sutunAdi, yeniRaf, yerlesmemisMi,
} from './yerlesim.ts';
import './stok.css';

// Önizlemedeki yerleşim düzenleyici (E). Taslak üzerinde çalışır; Kaydet tek komutla sunucuya yazar.
type TaslakRaf = YerRafi & { anahtar: string; id: number | null; surum: number | null; doluBolmeler: number[]; stokluGoz: number };
interface Taslak { depoAdi: string; bina: Bina; kabul: Kabul; kareBoyu: number; sayimSuresiGun: number; fason: { x: number; z: number; aci: 0 | 90 | 180 | 270 }; raflar: TaslakRaf[] }
type Secili = { tur: 'raf'; anahtar: string } | { tur: 'kabul' } | { tur: 'fason' } | { tur: 'bina' } | null;
type Surukle =
  | { tur: 'raf'; anahtar: string; ox: number; oz: number; hareket: number }
  | { tur: 'kabul' | 'fason'; ox: number; oz: number; hareket: number }
  | { tur: 'kaydir'; cx: number; cy: number; vx: number; vy: number; hareket: number; bina: boolean }
  | { tur: 'h0' | 'h1' | 'kt'; hareket: number }
  | { tur: 'kistir'; d0: number | null; hareket: number };
const RAF_TURLERI = Object.keys(RAF_TIPLERI) as RafTuru[];
let sayac = 0;
const yeniAnahtar = (): string => `t${++sayac}`;
const sinirla = (v: number, mn: number, mx: number): number => Math.max(mn, Math.min(mx, v));
const say = (v: string, onceki: number): number => { const n = Number(v.replace(',', '.')); return Number.isFinite(n) ? n : onceki; };
const bir = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('tr-TR');

function taslakKur(v: YerlesimCevabi): { taslak: Taslak; ilk: boolean } {
  let raflar: TaslakRaf[] = v.raflar.map((r) => ({ ...r, anahtar: `r${r.id}`, id: r.id, surum: r.surum }));
  const ilk = yerlesmemisMi(raflar) && raflar.length > 1;
  if (ilk) raflar = ilkYerlesim(raflar, v.yerlesim.bina);
  return { taslak: { depoAdi: v.depo.ad, bina: v.yerlesim.bina, kabul: v.yerlesim.kabul, kareBoyu: v.yerlesim.kareBoyu, sayimSuresiGun: v.yerlesim.sayimSuresiGun, fason: v.yerlesim.fason, raflar }, ilk };
}

export function YerlesimDuzenleyici() {
  const tanimlar = useIslem('stok.tanim');
  const yonlendir = useNavigate();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const v = useQuery({ queryKey: [...anahtarlar.hepsi, 'yerlesim'], queryFn: () => api.get<YerlesimCevabi>('/stok/yerlesim') });
  const [taslak, setTaslak] = useState<Taslak | null>(null);
  const [silinenler, setSilinenler] = useState<{ id: number; surum: number }[]>([]);
  const [secili, setSecili] = useState<Secili>(null);
  const [kirli, setKirli] = useState(false);
  const [ilkYer, setIlkYer] = useState(false);
  const [hatalar, setHatalar] = useState<string[]>([]);
  const [adim, setAdim] = useState(0.1);
  const [vb, setVb] = useState<{ x: number; y: number; s: number } | null>(null);
  const [boyut, setBoyut] = useState({ w: 800, h: 500 });
  const [silHazir, setSilHazir] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const surukle = useRef<Surukle | null>(null);
  const isaretciler = useRef(new Map<number, { x: number; y: number }>());
  const [ipucu, setIpucu] = useState('');

  useEffect(() => {
    if (!v.data || taslak) return;
    const k = taslakKur(v.data);
    setTaslak(k.taslak); setIlkYer(k.ilk); setKirli(k.ilk);
  }, [v.data, taslak]);
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const g = new ResizeObserver(() => setBoyut({ w: el.clientWidth || 800, h: el.clientHeight || 500 }));
    g.observe(el);
    return () => g.disconnect();
  }, [taslak !== null]);
  const sigdir = useCallback(() => {
    if (!taslak) return;
    const h = taslak.bina, bw = h.x1 - h.x0 + 4, bh = h.z1 - h.z0 + 4, sc = Math.min(boyut.w / bw, boyut.h / bh);
    setVb({ x: (h.x0 + h.x1) / 2 - boyut.w / sc / 2, y: (h.z0 + h.z1) / 2 - boyut.h / sc / 2, s: sc });
  }, [taslak, boyut]);
  useEffect(() => { if (taslak && !vb) sigdir(); }, [taslak, vb, sigdir]);

  const degistir = (f: (t: Taslak) => Taslak) => { setTaslak((t) => (t ? f(t) : t)); setKirli(true); setHatalar([]); };
  const rafDegistir = (anahtar: string, f: (r: TaslakRaf) => TaslakRaf) => degistir((t) => ({ ...t, raflar: t.raflar.map((r) => (r.anahtar === anahtar ? f(r) : r)) }));
  const yuvarla = (n: number) => Math.round(n / adim) * adim;
  const dunyaNoktasi = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: vb!.x + (cx - r.left) / vb!.s, z: vb!.y + (cy - r.top) / vb!.s };
  };
  const yakinlas = (f: number, cx: number, cy: number) => setVb((o) => {
    if (!o || !svg.current) return o;
    const r = svg.current.getBoundingClientRect(), w = { x: o.x + (cx - r.left) / o.s, z: o.y + (cy - r.top) / o.s }, ns = sinirla(o.s * f, 2, 200);
    return { x: w.x - (w.x - o.x) * o.s / ns, y: w.z - (w.z - o.y) * o.s / ns, s: ns };
  });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => { e.preventDefault(); yakinlas(Math.exp(-sinirla(e.deltaY, -60, 60) * 0.0025), e.clientX, e.clientY); };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => el.removeEventListener('wheel', tekerlek);
  }, [taslak !== null]);

  const cakisma = useMemo(() => (taslak ? cakisanlar(taslak.raflar, (r) => r.anahtar) : new Set<string>()), [taslak]);
  const kaydet = useMutation({
    mutationFn: (g: YerlesimKaydetGovdesi) => api.post<YerlesimCevabi>('/stok/yerlesim/kaydet', g),
    onSuccess: async (c) => {
      bildir('tamam', 'Yerleşim kaydedildi.');
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
      const k = taslakKur(c); setTaslak(k.taslak); setSilinenler([]); setKirli(false); setIlkYer(false); setSecili(null);
    },
    onError: (h) => setHatalar([hataIletisi(h, 'Kaydedilemedi.')]),
  });

  if (!tanimlar) return <DurumKutusu durum="hata" mesaj="Yerleşimi düzenlemek için raf tanımı yetkisi gerekiyor." />;
  if (v.isPending || !taslak) return v.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(v.error)} yenile={() => void v.refetch()} /> : <DurumKutusu durum="yukleniyor" />;
  const t = taslak, hall = t.bina, kb = t.kabul, s = vb?.s ?? 10, px = 1 / s, fs = 13 / s;
  const secRaf = secili?.tur === 'raf' ? t.raflar.find((r) => r.anahtar === secili.anahtar) ?? null : null;

  const asagi = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!vb) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    isaretciler.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isaretciler.current.size > 1) { surukle.current = { tur: 'kistir', d0: null, hareket: 0 }; return; }
    const w = dunyaNoktasi(e.clientX, e.clientY), hedef = e.target as Element;
    const rg = hedef.closest('[data-raf]'), tu = hedef.closest('[data-tutamac]');
    if (tu) surukle.current = { tur: tu.getAttribute('data-tutamac') as 'h0' | 'h1' | 'kt', hareket: 0 };
    else if (rg) {
      const a = rg.getAttribute('data-raf')!, r = t.raflar.find((x) => x.anahtar === a)!;
      setSecili({ tur: 'raf', anahtar: a }); surukle.current = { tur: 'raf', anahtar: a, ox: w.x - r.xM, oz: w.z - r.zM, hareket: 0 };
    } else if (hedef.closest('[data-fason]')) { setSecili({ tur: 'fason' }); surukle.current = { tur: 'fason', ox: w.x - t.fason.x, oz: w.z - t.fason.z, hareket: 0 }; }
    else if (hedef.closest('[data-kabul]')) { setSecili({ tur: 'kabul' }); surukle.current = { tur: 'kabul', ox: w.x - kb.x, oz: w.z - kb.z, hareket: 0 }; }
    else surukle.current = { tur: 'kaydir', cx: e.clientX, cy: e.clientY, vx: vb.x, vy: vb.y, hareket: 0, bina: !!hedef.closest('[data-bina]') };
  };
  const hareket = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = isaretciler.current.get(e.pointerId), d = surukle.current;
    if (!p || !d || !vb) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY; d.hareket += Math.abs(dx) + Math.abs(dy);
    if (d.tur === 'kistir') {
      const ps = [...isaretciler.current.values()]; if (ps.length < 2) return;
      const uz = Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y);
      if (d.d0) yakinlas(uz / d.d0, (ps[0]!.x + ps[1]!.x) / 2, (ps[0]!.y + ps[1]!.y) / 2);
      d.d0 = uz; return;
    }
    const w = dunyaNoktasi(e.clientX, e.clientY);
    if (d.tur === 'kaydir') setVb({ ...vb, x: d.vx - (e.clientX - d.cx) / vb.s, y: d.vy - (e.clientY - d.cy) / vb.s });
    else if (d.tur === 'raf') { rafDegistir(d.anahtar, (r) => ({ ...r, xM: yuvarla(w.x - d.ox), zM: yuvarla(w.z - d.oz) })); const r = t.raflar.find((x) => x.anahtar === d.anahtar); if (r) setIpucu(`${r.kod}: X ${bir(yuvarla(w.x - d.ox))} m, Z ${bir(yuvarla(w.z - d.oz))} m`); }
    else if (d.tur === 'kabul') degistir((x) => ({ ...x, kabul: { ...x.kabul, x: yuvarla(w.x - d.ox), z: yuvarla(w.z - d.oz) } }));
    else if (d.tur === 'fason') degistir((x) => ({ ...x, fason: { ...x.fason, x: yuvarla(w.x - d.ox), z: yuvarla(w.z - d.oz) } }));
    else if (d.tur === 'kt') degistir((x) => { const k = x.kabul, x0 = k.x - k.genislik / 2, z0 = k.z - k.derinlik / 2, g = Math.max(x0 + 2, yuvarla(w.x)) - x0, dd = Math.max(z0 + 2, yuvarla(w.z)) - z0; return { ...x, kabul: { genislik: g, derinlik: dd, x: x0 + g / 2, z: z0 + dd / 2 } }; });
    else if (d.tur === 'h0') degistir((x) => ({ ...x, bina: { ...x.bina, x0: Math.min(x.bina.x1 - 5, yuvarla(w.x)), z0: Math.min(x.bina.z1 - 5, yuvarla(w.z)) } }));
    else if (d.tur === 'h1') degistir((x) => ({ ...x, bina: { ...x.bina, x1: Math.max(x.bina.x0 + 5, yuvarla(w.x)), z1: Math.max(x.bina.z0 + 5, yuvarla(w.z)) } }));
  };
  const yukari = (e: ReactPointerEvent<SVGSVGElement>) => {
    isaretciler.current.delete(e.pointerId);
    const d = surukle.current;
    if (isaretciler.current.size === 0 && d) {
      if (d.tur === 'kaydir' && d.hareket < 5) setSecili(d.bina ? { tur: 'bina' } : null);
      surukle.current = null; setIpucu('');
    }
  };

  const ekle = (tur: RafTuru) => {
    if (!vb) return;
    const cx = vb.x + boyut.w / vb.s / 2, cz = vb.y + boyut.h / vb.s / 2;
    const r = yeniRaf(tur, yuvarla(cx), yuvarla(cz + 3), sonrakiKod(t.raflar));
    const y = bosYerBul(r, t.raflar, hall, kb, cx, cz);
    if (!y) bildir('hata', 'Boş yer bulunamadı; rafı elle uygun yere sürükle ya da binayı büyüt.');
    const yeni: TaslakRaf = { ...r, ...(y ? { xM: yuvarla(y.x), zM: yuvarla(y.z) } : {}), anahtar: yeniAnahtar(), id: null, surum: null, doluBolmeler: [], stokluGoz: 0 };
    degistir((x) => ({ ...x, raflar: [...x.raflar, yeni] })); setSecili({ tur: 'raf', anahtar: yeni.anahtar });
  };
  const cogalt = (r: TaslakRaf) => {
    const capraz = r.tur === 'zemin' ? r.derinlikM + 1.2 : r.derinlikM + KORIDOR.genis, f = onYuz(r);
    const ofs = dunyaya({ xM: 0, zM: 0, aci: r.aci }, f * capraz, 0);
    let n: TaslakRaf = { ...r, anahtar: yeniAnahtar(), id: null, surum: null, doluBolmeler: [], stokluGoz: 0, onYuzTers: r.tur === 'zemin' ? r.onYuzTers : !r.onYuzTers, xM: yuvarla(r.xM + ofs.x), zM: yuvarla(r.zM + ofs.z) };
    if (r.tur !== 'zemin' && r.numaralama === 'tek') n = { ...n, numaralama: 'cift' };
    else if (r.tur !== 'zemin' && r.numaralama === 'cift') n = { ...n, numaralama: 'tek' };
    else n = { ...n, kod: sonrakiKod(t.raflar) };
    if (t.raflar.some((o) => carpisir(n, o))) { const y = bosYerBul(n, t.raflar, hall, kb, n.xM, n.zM); if (y) n = { ...n, xM: y.x, zM: y.z }; }
    degistir((x) => ({ ...x, raflar: [...x.raflar, n] })); setSecili({ tur: 'raf', anahtar: n.anahtar });
  };
  const sil = (r: TaslakRaf) => {
    if (silHazir !== r.anahtar) { setSilHazir(r.anahtar); setTimeout(() => setSilHazir(null), 3500); return; }
    degistir((x) => ({ ...x, raflar: x.raflar.filter((y) => y.anahtar !== r.anahtar) }));
    if (r.id !== null && r.surum !== null) setSilinenler((l) => [...l, { id: r.id!, surum: r.surum! }]);
    setSecili(null); setSilHazir(null);
  };
  const dondur = (d: number) => {
    if (secili?.tur === 'fason') degistir((x) => ({ ...x, fason: { ...x.fason, aci: ((((x.fason.aci + d) % 360) + 360) % 360) as 0 | 90 | 180 | 270 } }));
    else if (secRaf) rafDegistir(secRaf.anahtar, (r) => ({ ...r, aci: ((((r.aci + d) % 360) + 360) % 360) }));
  };
  const kaydetTikla = () => {
    if (!kirli) { void yonlendir('/stok/depo'); return; }
    const bos = t.raflar.filter((r) => !r.kod);
    if (bos.length) { setHatalar(['Kodu boş bir raf var.']); return; }
    kaydet.mutate({
      surum: v.data!.yerlesim.surum, depoAdi: t.depoAdi, bina: t.bina, kabul: t.kabul, kareBoyu: t.kareBoyu, sayimSuresiGun: t.sayimSuresiGun, fason: t.fason, silinenler,
      raflar: t.raflar.map(({ anahtar: _a, doluBolmeler: _d, stokluGoz: _s, aci, ...r }) => ({ ...r, aci: aci as 0 | 90 | 180 | 270, katSayisi: r.tur === 'zemin' ? 1 : r.katSayisi })),
    });
  };
  const vazgec = () => { if (v.data) { const k = taslakKur(v.data); setTaslak(k.taslak); setKirli(k.ilk); } setSilinenler([]); setSecili(null); setHatalar([]); };

  // ---- Çizim (önizlemedeki draw) --------------------------------------------------------------------------------------------
  const kare = t.kareBoyu, nSut = Math.ceil((hall.x1 - hall.x0) / kare - 0.01), nSat = Math.ceil((hall.z1 - hall.z0) / kare - 0.01);
  let izgara = '';
  for (let i = 1; i < nSut; i++) izgara += `M${hall.x0 + i * kare} ${hall.z0}V${hall.z1}`;
  for (let j = 1; j < nSat; j++) izgara += `M${hall.x0} ${hall.z1 - j * kare}H${hall.x1}`;
  const nKutu = 2, hs = 9 * px;
  return (
    <div className="tc-stok-ed">
      <div className="tc-stok-ed-ana">
        <div className="tc-stok-ed-arac">
          <strong className="tc-stok-ed-baslik">Yerleşim düzenleyici</strong>
          {RAF_TURLERI.map((k) => (
            <Dugme key={k} tur="ikincil" onClick={() => ekle(k)} title={RAF_TIPLERI[k].aciklama}><svg className="tc-stok-ed-renk" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={RAF_TIPLERI[k].renk} /></svg>{RAF_TIPLERI[k].kisa}</Dugme>
          ))}
          <span className="tc-stok-ed-bosluk" />
          <Secim etiket="Izgara" value={String(adim)} onChange={(e) => setAdim(Number(e.target.value))} secenekler={[{ deger: '0.05', baslik: '5 cm' }, { deger: '0.1', baslik: '10 cm' }, { deger: '0.5', baslik: '50 cm' }, { deger: '1', baslik: '1 m' }]} />
          <Dugme tur="ikincil" onClick={sigdir}>Sığdır</Dugme>
        </div>
        <svg ref={svg} className="tc-stok-ed-svg" xmlns="http://www.w3.org/2000/svg" role="application" aria-label="Depo yerleşim planı"
          viewBox={vb ? `${vb.x} ${vb.y} ${boyut.w / vb.s} ${boyut.h / vb.s}` : '0 0 10 10'}
          onPointerDown={asagi} onPointerMove={hareket} onPointerUp={yukari} onPointerCancel={yukari}>
          <rect x={hall.x0} y={hall.z0} width={hall.x1 - hall.x0} height={hall.z1 - hall.z0} fill="var(--panel-solid)" stroke="var(--ink)" strokeWidth={3 * px} data-bina="1" />
          <path d={izgara} stroke="var(--done)" strokeOpacity={0.28} strokeWidth={1.5 * px} pointerEvents="none" />
          {Array.from({ length: nSut }, (_, i) => <text key={`c${i}`} x={Math.min(hall.x0 + (i + 0.5) * kare, hall.x1 - 0.3)} y={hall.z1 + fs * 1.3} fontSize={fs * 1.1} textAnchor="middle" fontWeight={700} fill="var(--done)" pointerEvents="none">{sutunAdi(i)}</text>)}
          {Array.from({ length: nSat }, (_, j) => <text key={`r${j}`} x={hall.x0 - fs * 0.9} y={Math.max(hall.z1 - (j + 0.5) * kare, hall.z0 + 0.3)} fontSize={fs * 1.1} textAnchor="middle" dominantBaseline="middle" fontWeight={700} fill="var(--done)" pointerEvents="none">{j + 1}</text>)}
          {s * kare > 40 && Array.from({ length: nSut * nSat }, (_, n) => { const i = n % nSut, j = Math.floor(n / nSut); return <text key={`k${n}`} x={hall.x0 + i * kare + 0.25} y={hall.z1 - j * kare - 0.3} fontSize={fs * 0.8} fill="var(--done)" fillOpacity={0.7} pointerEvents="none">{sutunAdi(i)}{j + 1}</text>; })}
          <g data-fason="1" transform={`translate(${t.fason.x} ${t.fason.z}) rotate(${-t.fason.aci})`} className="tc-stok-ed-tasi">
            <rect x={-0.275} y={-nKutu} width={0.55} height={nKutu} fill="var(--stop)" fillOpacity={secili?.tur === 'fason' ? 0.4 : 0.22} stroke="var(--stop)" strokeWidth={2 * px} />
            <line x1={0.275} y1={0} x2={0.275} y2={-nKutu} stroke="var(--hazard)" strokeWidth={3 * px} />
            <text transform={`translate(0 ${-nKutu / 2}) rotate(${t.fason.aci})`} fontSize={Math.min(fs, 0.5)} textAnchor="middle" dominantBaseline="middle" fontWeight={700} fill="var(--stop)" pointerEvents="none">FASON</text>
          </g>
          <g data-kabul="1" className="tc-stok-ed-tasi">
            <rect x={kb.x - kb.genislik / 2} y={kb.z - kb.derinlik / 2} width={kb.genislik} height={kb.derinlik} fill="var(--hazard)" fillOpacity={0.14} stroke={secili?.tur === 'kabul' ? 'var(--ink)' : 'var(--hazard-ink)'} strokeWidth={2 * px} strokeDasharray={`${8 * px} ${5 * px}`} />
            <text x={kb.x} y={kb.z} fontSize={fs * 1.2} textAnchor="middle" dominantBaseline="middle" fill="var(--hold)" fontWeight={700} pointerEvents="none">MAL KABUL</text>
          </g>
          {t.raflar.map((r) => {
            const tip = RAF_TIPLERI[r.tur], L = rafUzunlugu(r), f = onYuz(r), sec = secRaf?.anahtar === r.anahtar, kotu = cakisma.has(r.anahtar);
            const ayniVeri = r.id !== null && v.data!.raflar.find((x) => x.id === r.id)?.bolmeSayisi === r.bolmeSayisi;
            let cizgi = ''; for (let j = 1; j < r.bolmeSayisi; j++) cizgi += `M${-r.derinlikM / 2} ${-j * r.bolmeGenislikM}H${r.derinlikM / 2}`;
            return (
              <g key={r.anahtar} data-raf={r.anahtar} transform={`translate(${r.xM} ${r.zM}) rotate(${-r.aci})`} className="tc-stok-ed-tasi">
                <rect x={-r.derinlikM / 2} y={-L} width={r.derinlikM} height={L} fill={tip.renk} fillOpacity={sec ? 0.32 : 0.2} stroke={kotu ? 'var(--stop)' : tip.renk} strokeWidth={(sec ? 2.5 : 1.5) * px} />
                {cizgi && <path d={cizgi} stroke={tip.renk} strokeWidth={px} strokeOpacity={0.8} />}
                {ayniVeri && r.doluBolmeler.map((n, k) => (n ? <rect key={k} x={-r.derinlikM / 2 + 0.06} y={-(k + 1) * r.bolmeGenislikM + 0.08} width={(r.derinlikM - 0.12) * n / Math.max(1, r.katSayisi)} height={r.bolmeGenislikM - 0.16} fill={tip.renk} fillOpacity={0.55} pointerEvents="none" /> : null))}
                {r.tur !== 'zemin' && <line x1={f * r.derinlikM / 2} y1={0} x2={f * r.derinlikM / 2} y2={-L} stroke="var(--hazard)" strokeWidth={4 * px} />}
                <path d={`M${-r.derinlikM / 2} 0.02H${r.derinlikM / 2}`} stroke="var(--ink)" strokeWidth={3 * px} />
                {s * r.bolmeGenislikM > 22 && Array.from({ length: r.bolmeSayisi }, (_, k) => <text key={k} transform={`translate(${f * (r.derinlikM / 2 + 0.25)} ${-(k + 0.5) * r.bolmeGenislikM}) rotate(${r.aci})`} fontSize={fs * 0.75} textAnchor="middle" dominantBaseline="middle" fill="var(--muted)" pointerEvents="none">{bolmeNo(r, k)}</text>)}
                <text transform={`translate(0 ${-L / 2}) rotate(${r.aci})`} fontSize={Math.min(fs * 1.6, r.derinlikM * 0.9, L * 0.4)} textAnchor="middle" dominantBaseline="middle" fontWeight={700} fill="var(--ink)" pointerEvents="none">{r.kod}</text>
              </g>
            );
          })}
          {secili?.tur === 'bina' && ([[hall.x0, hall.z0, 'h0'], [hall.x1, hall.z1, 'h1']] as const).map(([x, z, k]) => <rect key={k} data-tutamac={k} x={x - hs} y={z - hs} width={2 * hs} height={2 * hs} fill="var(--panel-solid)" stroke="var(--ink)" strokeWidth={2 * px} className="tc-stok-ed-boy" />)}
          {secili?.tur === 'kabul' && <rect data-tutamac="kt" x={kb.x + kb.genislik / 2 - hs} y={kb.z + kb.derinlik / 2 - hs} width={2 * hs} height={2 * hs} fill="var(--panel-solid)" stroke="var(--ink)" strokeWidth={2 * px} className="tc-stok-ed-boy" />}
        </svg>
        <p className="tc-stok-not tc-stok-ed-ipucu">{ipucu || 'Rafı sürükleyerek taşı, boş alanı sürükleyerek kaydır, tekerlek ya da iki parmakla yakınlaş. Sarı çizgi rafın ön yüzü (koridor tarafı).'}</p>
      </div>
      <aside className="tc-stok-ed-panel" aria-label="Seçilenin ayarları">
        <div className="tc-stok-ed-alt">
          <span className="tc-stok-not">{kirli ? 'Kaydedilmemiş değişiklik var' : 'Değişiklik yok'}</span>
          <span className="tc-stok-eylem">
            {kirli ? <Dugme tur="ikincil" onClick={vazgec}>Vazgeç</Dugme> : <Link to="/stok/depo"><Dugme tur="ikincil">Kapat</Dugme></Link>}
            {kirli && <Dugme tur="birincil" yukleniyor={kaydet.isPending} onClick={kaydetTikla}>Kaydet</Dugme>}
          </span>
        </div>
        {ilkYer && <p className="tc-stok-bilgi">Raflar daha önce yerleştirilmemişti; koridor düzeninde dizildi. Gözden geçirip kaydedin.</p>}
        {hatalar.length > 0 && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">{hatalar.join(' ')}</p>}
        {cakisma.size > 0 && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">{cakisma.size} raf birbiriyle çakışıyor (kırmızı çerçeve). Kaydetmeden önce aralarını aç.</p>}
        {secRaf ? (
          <div className="tc-stok-form">
            <div className="tc-stok-bas"><h3 className="tc-stok-alt-baslik">Raf {secRaf.kod}</h3><Dugme tur="ikincil" simge="x" onClick={() => setSecili(null)}>Seçimi kaldır</Dugme></div>
            <Secim etiket="Raf tipi" value={secRaf.tur} ipucu={RAF_TIPLERI[secRaf.tur].aciklama} secenekler={RAF_TURLERI.map((k) => ({ deger: k, baslik: RAF_TIPLERI[k].ad }))}
              onChange={(e) => { const k = e.target.value as RafTuru, tp = RAF_TIPLERI[k]; rafDegistir(secRaf.anahtar, (r) => ({ ...r, tur: k, bolmeGenislikM: tp.bw, derinlikM: tp.dep, katAraligiM: tp.lh, katSayisi: k === 'zemin' ? 1 : Math.min(r.katSayisi, tp.enCokKat) })); }} />
            <div className="tc-stok-iki">
              <Girdi etiket="Kod" value={secRaf.kod} maxLength={3} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, kod: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) }))} />
              <Secim etiket="Numaralama" value={secRaf.numaralama} secenekler={NUMARALAMALAR.map((n) => ({ deger: n, baslik: NUMARA[n] }))} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, numaralama: e.target.value as typeof r.numaralama }))} />
              {secRaf.numaralama === 'sirali' && <Girdi etiket="İlk bölme no" inputMode="numeric" value={String(secRaf.ilkBolme)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, ilkBolme: Math.round(sinirla(say(e.target.value, r.ilkBolme), 1, 999)) }))} />}
              <Girdi etiket="Bölme sayısı" inputMode="numeric" value={String(secRaf.bolmeSayisi)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, bolmeSayisi: Math.round(sinirla(say(e.target.value, r.bolmeSayisi), 1, 80)) }))} />
              {secRaf.tur !== 'zemin' && <Girdi etiket="Kat sayısı" inputMode="numeric" value={String(secRaf.katSayisi)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, katSayisi: Math.round(sinirla(say(e.target.value, r.katSayisi), 1, RAF_TIPLERI[r.tur].enCokKat)) }))} />}
              <Girdi etiket={secRaf.tur === 'zemin' ? 'Hücre genişliği (m)' : 'Bölme genişliği (m)'} inputMode="decimal" value={String(secRaf.bolmeGenislikM)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, bolmeGenislikM: sinirla(say(e.target.value, r.bolmeGenislikM), 0.3, 6) }))} />
              <Girdi etiket="Derinlik (m)" inputMode="decimal" value={String(secRaf.derinlikM)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, derinlikM: sinirla(say(e.target.value, r.derinlikM), 0.2, 3) }))} />
              <Girdi etiket={secRaf.tur === 'zemin' ? 'İstif yüksekliği (m)' : 'Kat aralığı (m)'} inputMode="decimal" value={String(secRaf.katAraligiM)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, katAraligiM: sinirla(say(e.target.value, r.katAraligiM), 0.2, 4) }))} />
              <Girdi etiket="Konum X (m)" inputMode="decimal" value={String(secRaf.xM)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, xM: sinirla(say(e.target.value, r.xM), -500, 500) }))} />
              <Girdi etiket="Konum Z (m)" inputMode="decimal" value={String(secRaf.zM)} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, zM: sinirla(say(e.target.value, r.zM), -500, 500) }))} />
            </div>
            <div className="tc-stok-eylem">
              <Dugme tur="ikincil" simge="rotate" onClick={() => dondur(90)} title="Saat yönünün tersine 90°">⟲ 90°</Dugme>
              <Dugme tur="ikincil" onClick={() => dondur(-90)} title="Saat yönünde 90°">⟳ 90°</Dugme>
              {secRaf.tur !== 'zemin' && <label className="tc-stok-ed-onay"><input type="checkbox" checked={secRaf.onYuzTers} onChange={(e) => rafDegistir(secRaf.anahtar, (r) => ({ ...r, onYuzTers: e.target.checked }))} />Ön yüzü çevir</label>}
            </div>
            <p className="tc-stok-not"><strong>{secRaf.bolmeSayisi * (secRaf.tur === 'zemin' ? 1 : secRaf.katSayisi)}</strong> göz · {bir(rafUzunlugu(secRaf))} × {bir(secRaf.derinlikM)} m<br />Adresler: <strong className="tc-stok-mono">{adresAraligi(secRaf)[0]}</strong> … <strong className="tc-stok-mono">{adresAraligi(secRaf)[1]}</strong></p>
            {secRaf.stokluGoz > 0 && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">Bu rafta {secRaf.stokluGoz} dolu göz var. Kod ya da numaralama değişirse stoklar gözle birlikte yeni adrese geçer; stoklu göz kaldırılamaz.</p>}
            <div className="tc-stok-eylem">
              <Dugme tur="ikincil" onClick={() => cogalt(secRaf)}>Çoğalt</Dugme>
              {secRaf.id !== null && <Link to={`/stok/raflar/${secRaf.id}`}><Dugme tur="ikincil">Raf matrisi</Dugme></Link>}
              <Dugme tur="ikincil" simge="trash" onClick={() => sil(secRaf)}>{silHazir === secRaf.anahtar ? (secRaf.stokluGoz ? 'Stoklu raf, yine de kaldır?' : 'Kaldırmak için tekrar dokun') : 'Sil'}</Dugme>
            </div>
          </div>
        ) : secili?.tur === 'kabul' ? (
          <div className="tc-stok-form">
            <div className="tc-stok-bas"><h3 className="tc-stok-alt-baslik">Mal kabul alanı</h3><Dugme tur="ikincil" simge="x" onClick={() => setSecili(null)}>Seçimi kaldır</Dugme></div>
            <div className="tc-stok-iki">
              {(['x', 'z', 'genislik', 'derinlik'] as const).map((k) => <Girdi key={k} etiket={{ x: 'Merkez X (m)', z: 'Merkez Z (m)', genislik: 'Genişlik (m)', derinlik: 'Derinlik (m)' }[k]} inputMode="decimal" value={String(kb[k])}
                onChange={(e) => degistir((x) => ({ ...x, kabul: { ...x.kabul, [k]: sinirla(say(e.target.value, x.kabul[k]), k === 'x' || k === 'z' ? -500 : 1, k === 'x' || k === 'z' ? 500 : 200) } }))} />)}
            </div>
            <p className="tc-stok-not">Sağ alt köşedeki tutamaçla da boyutlandırabilirsin.</p>
          </div>
        ) : secili?.tur === 'fason' ? (
          <div className="tc-stok-form">
            <div className="tc-stok-bas"><h3 className="tc-stok-alt-baslik">Fason dolabı</h3><Dugme tur="ikincil" simge="x" onClick={() => setSecili(null)}>Seçimi kaldır</Dugme></div>
            <p className="tc-stok-not">Her fason firmanın depoda ayrı bir kutusu (gözü) olur; fasona gidecek malzeme burada bekler. Kutular firmalar modülü gelince açılır.</p>
            <div className="tc-stok-iki">
              <Girdi etiket="Konum X (m)" inputMode="decimal" value={String(t.fason.x)} onChange={(e) => degistir((x) => ({ ...x, fason: { ...x.fason, x: sinirla(say(e.target.value, x.fason.x), -500, 500) } }))} />
              <Girdi etiket="Konum Z (m)" inputMode="decimal" value={String(t.fason.z)} onChange={(e) => degistir((x) => ({ ...x, fason: { ...x.fason, z: sinirla(say(e.target.value, x.fason.z), -500, 500) } }))} />
            </div>
            <div className="tc-stok-eylem"><Dugme tur="ikincil" onClick={() => dondur(90)}>⟲ 90°</Dugme><Dugme tur="ikincil" onClick={() => dondur(-90)}>⟳ 90°</Dugme></div>
          </div>
        ) : secili?.tur === 'bina' ? (
          <div className="tc-stok-form">
            <div className="tc-stok-bas"><h3 className="tc-stok-alt-baslik">Bina</h3><Dugme tur="ikincil" simge="x" onClick={() => setSecili(null)}>Seçimi kaldır</Dugme></div>
            <Girdi etiket="Depo adı" value={t.depoAdi} maxLength={60} onChange={(e) => degistir((x) => ({ ...x, depoAdi: e.target.value }))} />
            <div className="tc-stok-iki">
              {(['x0', 'x1', 'z0', 'z1'] as const).map((k) => <Girdi key={k} etiket={{ x0: 'Sol kenar X', x1: 'Sağ kenar X', z0: 'Arka kenar Z', z1: 'Ön kenar Z' }[k]} inputMode="decimal" value={String(hall[k])}
                onChange={(e) => degistir((x) => ({ ...x, bina: { ...x.bina, [k]: sinirla(say(e.target.value, x.bina[k]), -500, 500) } }))} />)}
            </div>
            <Girdi etiket="Sayım süresi (gün)" inputMode="numeric" value={String(t.sayimSuresiGun)} ipucu="Dolu göz bu süreden uzun sayılmazsa iş kutusunda sayım bekler." onChange={(e) => degistir((x) => ({ ...x, sayimSuresiGun: Math.round(sinirla(say(e.target.value, x.sayimSuresiGun), 1, 365)) }))} />
            <Girdi etiket="Dama tahtası kare boyu (m)" inputMode="decimal" value={String(t.kareBoyu)} onChange={(e) => degistir((x) => ({ ...x, kareBoyu: sinirla(say(e.target.value, x.kareBoyu), 1, 50) }))} />
            <p className="tc-stok-not">Bina {bir(hall.x1 - hall.x0)} × {bir(hall.z1 - hall.z0)} m ({Math.round((hall.x1 - hall.x0) * (hall.z1 - hall.z0))} m²). Köşe tutamaçlarıyla da boyutlandırabilirsin.</p>
          </div>
        ) : (
          <div className="tc-stok-form">
            <h3 className="tc-stok-alt-baslik">Yerleşim</h3>
            <p className="tc-stok-not">{t.raflar.length} raf, {t.raflar.reduce((a, r) => a + r.bolmeSayisi * (r.tur === 'zemin' ? 1 : r.katSayisi), 0)} göz. Bir rafa dokunarak düzenle; üstteki düğmelerle yeni raf ekle.</p>
            <div className="tc-stok-ed-ekle">
              {RAF_TURLERI.map((k) => (
                <button key={k} type="button" className="tc-stok-ambalaj" onClick={() => ekle(k)}>
                  <strong>{RAF_TIPLERI[k].ad} ekle</strong><span>{RAF_TIPLERI[k].aciklama} · {bir(RAF_TIPLERI[k].bw)}×{bir(RAF_TIPLERI[k].dep)} m göz</span>
                </button>
              ))}
            </div>
            <div className="tc-stok-eylem">
              <Dugme tur="ikincil" onClick={() => setSecili({ tur: 'bina' })}>Bina ve kareler</Dugme>
              <Dugme tur="ikincil" onClick={() => setSecili({ tur: 'kabul' })}>Mal kabul alanı</Dugme>
              <Dugme tur="ikincil" onClick={() => setSecili({ tur: 'fason' })}>Fason dolabı</Dugme>
            </div>
            <ul className="tc-stok-satirlar">
              {t.raflar.map((r) => (
                <li key={r.anahtar}>
                  <button type="button" className="tc-stok-ed-satir" onClick={() => setSecili({ tur: 'raf', anahtar: r.anahtar })}>
                    <svg className="tc-stok-ed-renk" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill={RAF_TIPLERI[r.tur].renk} /></svg>
                    <strong className="tc-stok-mono">{r.kod}</strong> <span className="tc-stok-not">{RAF_TIPLERI[r.tur].kisa} · {r.bolmeSayisi}×{r.katSayisi}</span>
                  </button>
                  {cakisma.has(r.anahtar) && <span className="tc-stok-eksi">Çakışma</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
