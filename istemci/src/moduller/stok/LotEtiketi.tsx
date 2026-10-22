import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import qrcode from 'qrcode-generator';
import type { LotEtiketi, LotEtiketleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { MALZEME_TURU, birimliMiktar } from './gorunum.ts';
import { hataMetni } from './ortak.tsx';
import { Qr } from './Qr.tsx';
import './stok.css';

// Lot etiketi (#1060): 100x50 mm, termal yazıcıya siyah beyaz. QR yalnız `LOT:<lot no>` taşır; Okut ekranı geri kalanı sunucudan okur.
// Veri yoksa satır basılmaz.
export const lotQrMetni = (lotNo: string): string => `LOT:${lotNo}`;
const TARIH = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function lotEtiketSatirlari(e: LotEtiketi): string[] {
  const ad = [e.malzemeAd, e.malzemeKod].filter(Boolean).join(' · ');
  const kart = [`Kart ${e.malzemeId}`, e.malzemeTuru ? MALZEME_TURU[e.malzemeTuru] : null].filter(Boolean).join(' · ');
  const parti = [e.tedarikciPartiNo && `Parti ${e.tedarikciPartiNo}`, e.dokumNo && `Döküm ${e.dokumNo}`, e.sertifikaNo && `Sertifika ${e.sertifikaNo}`].filter(Boolean).join(' · ');
  const giris = [TARIH.format(new Date(e.giris)), e.miktar === null ? null : birimliMiktar(e.miktar, e.birim), e.belgeNo].filter(Boolean).join(' · ');
  return [ad, kart, parti, giris].filter((x) => x !== '');
}

function LotEtiketKarti({ e }: { e: LotEtiketi }) {
  return (
    <div className="tc-stok-lot-etk">
      <Qr metin={lotQrMetni(e.lotNo)} boyut={120} />
      <div className="tc-stok-lot-etk-metin">
        <div className="tc-stok-lot-etk-no">{e.lotNo}</div>
        {lotEtiketSatirlari(e).map((s) => <div key={s}>{s}</div>)}
      </div>
    </div>
  );
}

// Basım ayrı belgede yapılır: sayfa ölçüsü etiketin kendisidir (100x50 mm), her kopya bir sayfa.
export function lotEtiketHtml(ogeler: { e: LotEtiketi; adet: number }[]): string {
  const kac = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const svg = (m: string) => { const q = qrcode(0, 'M'); q.addData(m); q.make(); const n = q.getModuleCount(); let d = ''; for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`; return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`; };
  const kart = (e: LotEtiketi) => `<div class="e">${svg(lotQrMetni(e.lotNo))}<div><div class="n">${kac(e.lotNo)}</div>${lotEtiketSatirlari(e).map((s) => `<div>${kac(s)}</div>`).join('')}</div></div>`;
  const sayfalar = ogeler.flatMap(({ e, adet }) => Array.from({ length: adet }, () => kart(e))).join('');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Lot etiketleri</title><style>@page{size:100mm 50mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000;background:#fff}.e{width:100mm;height:50mm;padding:3mm;display:flex;gap:3mm;align-items:center;overflow:hidden;break-after:page}.e svg{width:40mm;height:40mm;flex:none}.e div{font-size:8.5pt;line-height:1.25}.e .n{font-family:"Courier New",monospace;font-weight:700;font-size:20pt;margin-bottom:1mm}</style></head><body>${sayfalar}</body></html>`;
}

export function yazdir(html: string) {
  const cerceve = document.createElement('iframe');
  cerceve.setAttribute('aria-hidden', 'true');
  cerceve.className = 'tc-stok-gizli-cerceve';
  document.body.appendChild(cerceve);
  const belge = cerceve.contentDocument;
  if (!belge || !cerceve.contentWindow) { cerceve.remove(); return; }
  belge.open(); belge.write(html); belge.close();
  cerceve.contentWindow.focus();
  cerceve.contentWindow.print();
  setTimeout(() => cerceve.remove(), 60_000);
}
function indir(html: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); a.download = 'lot-etiketleri.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// `yol`: `/stok/mal-kabuller/:id/lot-etiketleri` ya da `/stok/partiler/:id/etiket`. `kopyalar`: satır sırası -> önerilen kopya (ambalaj sayısı).
export function LotEtiketPenceresi({ baslik, yol, kopyalar = {}, kapat }: { baslik: string; yol: string; kopyalar?: Record<number, number>; kapat: () => void }) {
  const q = useQuery({ queryKey: [...anahtarlar.hepsi, 'lot-etiketi', yol], queryFn: () => api.get<LotEtiketleriCevabi>(`${yol}`) });
  const [adet, setAdet] = useState<string[]>([]);
  useEffect(() => { if (q.data) setAdet(q.data.etiketler.map((e) => String(e.sira === null ? 1 : kopyalar[e.sira] ?? 1))); }, [q.data]);
  const ogeler = (q.data?.etiketler ?? []).map((e, i) => ({ e, adet: Math.max(0, Math.min(99, Math.trunc(Number(adet[i] ?? '1')) || 0)) }));
  const toplam = ogeler.reduce((t, x) => t + x.adet, 0);
  return (
    <Pencere acik kapat={kapat} baslik={baslik} tur="yan"
      alt={<>
        <Dugme tur="ikincil" simge="download" disabled={toplam === 0} onClick={() => indir(lotEtiketHtml(ogeler))}>HTML olarak indir</Dugme>
        <Dugme tur="birincil" simge="tag" disabled={toplam === 0} onClick={() => yazdir(lotEtiketHtml(ogeler))}>Yazdır ({toplam})</Dugme>
      </>}>
      {q.isPending && <DurumKutusu durum="yukleniyor" />}
      {q.isError && <DurumKutusu durum="hata" mesaj={hataMetni(q.error)} yenile={() => void q.refetch()} />}
      {q.data && q.data.etiketler.length === 0 && <DurumKutusu durum="bos" mesaj="Bu belgede lotlu satır yok; basılacak etiket yok." />}
      {q.data && q.data.etiketler.length > 0 && (
        <div className="tc-stok-form">
          <p className="tc-stok-not">Etiket 100x50 mm, her kopya bir sayfa. Okut ekranı QR'ı tanır ve o lottan düşer.</p>
          {q.data.etiketler.map((e, i) => (
            <div key={`${e.partiId}-${e.sira ?? 0}`} className="tc-stok-lot-etk-satir">
              <LotEtiketKarti e={e} />
              <Girdi etiket="Kopya" inputMode="numeric" value={adet[i] ?? '1'} onChange={(x) => setAdet((l) => l.map((v, j) => (j === i ? x.target.value : v)))} />
            </div>
          ))}
        </div>
      )}
    </Pencere>
  );
}
