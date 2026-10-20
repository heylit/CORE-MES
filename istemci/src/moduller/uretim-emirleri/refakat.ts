import qrcode from 'qrcode-generator';
import type { RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';

const kac = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function qrSvg(metin: string): string {
  const q = qrcode(0, 'M');
  q.addData(metin);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" role="img" aria-label="QR: ${kac(metin)}">`
    + `<rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

const tarih = (t: string | null): string => (t === null ? 'yok' : new Date(`${t}T00:00:00`).toLocaleDateString('tr-TR'));

export function partiMetni(p: RefakatKartiCevabi['parti']): string {
  if (p.ustEmirNo === null) return 'Ana emir';
  return p.bolunmeSira === null ? `Alt parti · üst ${p.ustEmirNo}` : `Alt parti ${p.bolunmeSira} · üst ${p.ustEmirNo}`;
}

// Kart kendi belgesinde basılır: sayfa ölçüsü (100x150 mm) yalnız bu belgeye uygulanır, uygulamanın öbür baskılarına
// sızmaz. Kâğıt etiket olduğundan renk ve ölçü tasarım değişkeninden değil, baskıdan gelir (siyah-beyaz, mm).
export function refakatBelgesi(k: RefakatKartiCevabi, basim: Date): string {
  const satirlar = k.adimlar.map((a) => `<tr><td>${a.opNo}</td><td>${kac(a.ad)}</td><td>${a.yer === null ? '-' : kac(a.yer)}${a.fason ? ' (fason)' : ''}</td><td>&#9744;</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Refakat kartı ${kac(k.emirNo)}</title><style>`
    + '@page{size:100mm 150mm;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000}'
    + 'body{font-family:Arial,sans-serif}.etk{width:100mm;height:150mm;padding:4mm;display:flex;flex-direction:column;overflow:hidden}'
    + '.ust{display:flex;gap:3mm}.ust svg{width:40mm;height:40mm;flex:none}.k{font-size:8pt;line-height:1.35}.buyuk{font:800 17pt monospace;line-height:1.1;overflow-wrap:anywhere}'
    + '.ad{font-weight:700;font-size:10pt;overflow-wrap:anywhere}.mono{font-family:monospace}table{width:100%;border-collapse:collapse;font-size:8pt;margin-top:3mm}'
    + 'td,th{border-top:1px solid #000;padding:1mm;text-align:left;vertical-align:top}th{font-size:7pt}td:first-child,th:first-child{width:9mm}td:last-child,th:last-child{width:8mm;text-align:center}'
    + '.alt{margin-top:auto;font-size:7pt;border-top:1px solid #000;padding-top:1mm;display:flex;justify-content:space-between}'
    + '</style></head><body><div class="etk"><div class="ust">'
    + qrSvg(k.qr)
    + `<div><div class="k">REFAKAT KARTI</div><div class="buyuk">${kac(k.emirNo)}</div><div class="ad">${kac(k.urun.ad)}</div>`
    + `<div class="k mono">Parça no: ${kac(k.urun.kod)}</div><div class="k">Adet ${k.adet} · Termin ${tarih(k.teslim)}</div>`
    + `<div class="k">Parti: ${kac(partiMetni(k.parti))}</div></div></div>`
    + `<table><thead><tr><th>Op</th><th>İş</th><th>İstasyon</th><th>Bitti</th></tr></thead><tbody>${satirlar}</tbody></table>`
    + `<div class="alt"><span>Basım ${basim.toLocaleDateString('tr-TR')}</span><span class="mono">${kac(k.emirNo)}</span></div>`
    + '</div></body></html>';
}
