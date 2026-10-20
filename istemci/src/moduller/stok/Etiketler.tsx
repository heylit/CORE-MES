import { useState } from 'react';
import { Link } from 'react-router-dom';
import qrcode from 'qrcode-generator';
import type { KoduDegisenKonum } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Pencere } from '../../ortak/arayuz/index.ts';
import { KONUM_ETIKETI } from './gorunum.ts';
import { useIslem } from './ortak.tsx';
import { Qr } from './Qr.tsx';
import './stok.css';

// Önizlemedeki etiketler (labelHTML): konum etiketi "LOC:<kod>" QR'lı, kat renginde yan çubuk; malzeme etiketi "MLZ:<no>" QR'lı,
// ad ve stok kodu. A4'e 3 sütun basılır; yazdırma yalnız etiketleri basar, HTML olarak da indirilir.
export type EtiketOgesi =
  | { tur: 'konum'; kod: string; alt: string; katNo: number | null }
  | { tur: 'malzeme'; no: number; ad: string; kod: string };
const qrMetni = (o: EtiketOgesi): string => (o.tur === 'konum' ? `LOC:${o.kod}` : `MLZ:${o.no}`);
const katSinifi = (k: number | null): string => (k === null ? 'tc-stok-etk-zemin' : `tc-stok-kat-${((k - 1) % 6) + 1}`);

function EtiketKarti({ o }: { o: EtiketOgesi }) {
  return (
    <div className="tc-stok-etk">
      {o.tur === 'konum' && <span className={`tc-stok-etk-cubuk ${katSinifi(o.katNo)}`} />}
      <Qr metin={qrMetni(o)} boyut={86} />
      <div>
        {o.tur === 'konum' ? <><div className="tc-stok-etk-buyuk">{o.kod}</div><div className="tc-stok-etk-alt">{o.alt}</div></>
          : <><strong>{o.ad}</strong><div className="tc-stok-etk-kod">{o.kod}</div><div className="tc-stok-etk-alt">Kart {o.no}</div></>}
      </div>
    </div>
  );
}

// Tarayıcıdan bağımsız basılabilir tek dosya (önizlemedeki downloadLabels); QR'lar SVG olarak gömülür.
function htmlOlarakIndir(ogeler: EtiketOgesi[]) {
  const kac = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const svg = (m: string) => { const q = qrcode(0, 'M'); q.addData(m); q.make(); const n = q.getModuleCount(); let d = ''; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`; return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`; };
  const kart = (o: EtiketOgesi) => (o.tur === 'konum'
    ? `<div class="plabel">${svg(qrMetni(o))}<div><div class="big">${kac(o.kod)}</div><div class="l">${kac(o.alt)}</div></div></div>`
    : `<div class="plabel">${svg(qrMetni(o))}<div><b>${kac(o.ad)}</b><div class="k">${kac(o.kod)}</div><div class="l">Kart ${o.no}</div></div></div>`);
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Etiketler</title><style>body{font-family:Arial,sans-serif;margin:10mm}.labels{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.plabel{border:1px dashed #888;border-radius:2mm;padding:3mm;display:flex;gap:3mm;align-items:center;break-inside:avoid}.plabel svg{width:24mm;height:24mm;flex:none}.plabel b{display:block;font-size:11pt}.k{font-weight:700;font-size:13pt}.big{font-weight:700;font-size:22pt}.l{font-size:9pt}@page{margin:10mm}</style></head><body><div class="labels">${ogeler.map(kart).join('')}</div><script>window.onload=()=>window.print()<\/script></body></html>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); a.download = 'etiketler.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function EtiketPenceresi({ baslik, ogeler, kapat }: { baslik: string; ogeler: EtiketOgesi[]; kapat: () => void }) {
  return (
    <Pencere acik kapat={kapat} baslik={baslik} tur="yan"
      alt={<><Dugme tur="ikincil" simge="download" onClick={() => htmlOlarakIndir(ogeler)}>HTML olarak indir</Dugme><Dugme tur="birincil" disabled={ogeler.length === 0} onClick={() => window.print()}>Yazdır</Dugme></>}>
      <p className="tc-stok-not">{ogeler.length} etiket · A4'e 3 sütun basılır{ogeler.length > 60 ? ' · ilk 60 etiket önizleniyor' : ''}. Okut ekranı bu QR'ları tanır.</p>
      {ogeler.length === 0 ? <p className="tc-stok-bilgi tc-stok-bilgi-uyari">Basılacak etiket yok.</p> : (
        <div className="tc-stok-etk-onizleme">{ogeler.slice(0, 60).map((o) => <EtiketKarti key={qrMetni(o)} o={o} />)}</div>
      )}
      <div className="tc-stok-etk-baski" aria-hidden="true">{ogeler.map((o) => <EtiketKarti key={qrMetni(o)} o={o} />)}</div>
      <p className="tc-stok-not">Yazdır penceresi açılmazsa etiketleri HTML olarak indirip tarayıcıdan yazdırabilirsin.</p>
    </Pencere>
  );
}

const iki = (n: number | null): string => String(n ?? 0).padStart(2, '0');
const konumAlti = (d: KoduDegisenKonum): string => (d.tur === 'raf_gozu' && d.bolmeNo !== null ? `Bölme ${iki(d.bolmeNo)} · Kat ${d.katNo ?? ''}` : d.ad ?? KONUM_ETIKETI[d.tur]);

// Etiket Merkezi adresi en çok bu kadar konum kimliği kabul eder.
const MERKEZ_SINIRI = 200;

// 94 a: eski etiketin QR'ı eski kodu taşır ve artık okunmaz; kayıttan sonra kodu değişen konumların etiketi yeniden basılır. Etiket Merkezi'ni
// açabilen orada yazıcıya basar; açamayan stoktaki etiket penceresiyle yazdırır.
export function KodDegisimPenceresi({ degisenler, kapat }: { degisenler: KoduDegisenKonum[]; kapat: () => void }) {
  const [bas, setBas] = useState(false);
  const merkez = useIslem('sayfa.etiket-merkezi');
  if (bas) return <EtiketPenceresi baslik="Kodu değişen konumlar" kapat={kapat} ogeler={degisenler.map((d) => ({ tur: 'konum' as const, kod: d.yeniKod, katNo: d.katNo, alt: konumAlti(d) }))} />;
  const adres = `/etiket-merkezi?tur=konum&id=${degisenler.slice(0, MERKEZ_SINIRI).map((d) => d.konumId).join(',')}`;
  return (
    <Pencere acik kapat={kapat} baslik="Konum kodu değişti" tur="yan"
      alt={merkez ? <Link to={adres}><Dugme tur="birincil" simge="tag">Etiketleri bas</Dugme></Link> : <Dugme tur="birincil" simge="tag" onClick={() => setBas(true)}>Etiketleri bas</Dugme>}>
      <p className="tc-stok-bilgi tc-stok-bilgi-uyari" role="status">{degisenler.length} konumun kodu değişti; eski etiketler artık okunmaz. Yeniden basın.</p>
      {merkez && degisenler.length > MERKEZ_SINIRI && <p className="tc-stok-not">Etiket Merkezi ilk {MERKEZ_SINIRI} konumu açar; kalanları sonra basın.</p>}
      <ul className="tc-stok-liste">{degisenler.slice(0, 60).map((d) => <li key={d.konumId}>{d.eskiKod} → <strong>{d.yeniKod}</strong></li>)}</ul>
      {degisenler.length > 60 && <p className="tc-stok-not">ve {degisenler.length - 60} konum daha.</p>}
    </Pencere>
  );
}
