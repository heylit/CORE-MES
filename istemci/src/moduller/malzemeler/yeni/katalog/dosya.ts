// Katalogdan inen dosyalar (CSV, JSON, Excel). Dosya tarayıcıda kurulur; sunucuya ayrı istek gitmez. Etiket Etiket Merkezi'nde basılır (1288).

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
