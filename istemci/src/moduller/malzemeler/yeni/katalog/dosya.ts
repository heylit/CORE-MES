// Katalogdan inen dosyalar (CSV, JSON, Excel, etiket) ve etiket basımı. Dosya tarayıcıda kurulur; sunucuya ayrı istek gitmez.

const TURLER: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
  svg: 'image/svg+xml',
  html: 'text/html;charset=utf-8',
};

export function dosyaIndir(ad: string, veri: BlobPart): void {
  const uzanti = ad.slice(ad.lastIndexOf('.') + 1);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([veri], { type: TURLER[uzanti] ?? 'application/octet-stream' }));
  a.download = ad;
  a.click();
  const birak = URL.revokeObjectURL.bind(URL);
  setTimeout(() => birak(a.href), 1500);
}

// Prototipin dosya adı süzgeci: harf, rakam, nokta ve tire kalır.
export const guvenliAd = (s: string): string => String(s).replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(0, 80);

// Basım ayrı belgede yapılır: sayfa ölçüsü etiketin kendisidir, her etiket bir sayfa (stok lot etiketiyle aynı yol).
export function belgeyiYazdir(html: string): boolean {
  const cerceve = document.createElement('iframe');
  cerceve.setAttribute('aria-hidden', 'true');
  cerceve.className = 'tc-mk-gizli-cerceve';
  document.body.appendChild(cerceve);
  const belge = cerceve.contentDocument;
  if (!belge || !cerceve.contentWindow) { cerceve.remove(); return false; }
  belge.open(); belge.write(html); belge.close();
  try {
    cerceve.contentWindow.focus();
    cerceve.contentWindow.print();
  } catch {
    cerceve.remove();
    return false;
  }
  setTimeout(() => cerceve.remove(), 60_000);
  return true;
}

export const svgAdresi = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
