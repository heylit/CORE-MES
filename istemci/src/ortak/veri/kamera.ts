import { useCallback, useEffect, useRef, useState } from 'react';
import { matrisOku } from './matris-okuyucu.ts';

// Kamera ile kod okuma: tarayıcının BarcodeDetector'ü QR ve DataMatrix'i birlikte okuyorsa o (Android), yoksa zxing-wasm (Windows dahil;
// matris-okuyucu.ts). zxing yüklenemezse eski jsqr yalnız QR için son yedektir. Aynı kod 2 saniye içinde ikinci kez bildirilmez.
interface Algilayici { detect(kaynak: CanvasImageSource): Promise<{ rawValue: string }[]> }
type AlgilayiciSinifi = (new (s: { formats: string[] }) => Algilayici) & { getSupportedFormats?: () => Promise<string[]> };
const YEREL_BICIMLER = ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'data_matrix'];
let yerel: Promise<Algilayici | null> | null = null;
// Yalnız iki 2B simgeyi de okuduğu doğrulanan tarayıcı yerel okuyucuyu kullanır: DataMatrix'siz yerel okuyucu kodsuz kare döndürüp
// asıl okuyucuyu hiç çalıştırmazdı.
function yerelAlgilayici(): Promise<Algilayici | null> {
  yerel ??= (async () => {
    const S = (globalThis as { BarcodeDetector?: AlgilayiciSinifi }).BarcodeDetector;
    if (!S?.getSupportedFormats) return null;
    try {
      const var_ = await S.getSupportedFormats();
      return var_.includes('qr_code') && var_.includes('data_matrix') ? new S({ formats: YEREL_BICIMLER.filter((b) => var_.includes(b)) }) : null;
    } catch { return null; }
  })();
  return yerel;
}
async function jsqrIleOku(tuval: HTMLCanvasElement): Promise<string | null> {
  const ctx = tuval.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const veri = ctx.getImageData(0, 0, tuval.width, tuval.height);
  const { default: jsQR } = await import('jsqr');
  return jsQR(veri.data, veri.width, veri.height)?.data ?? null;
}
// Motor düşerse 10 saniye yedekle gidilir, sonra yeniden denenir: geçici bir yükleme hatası okumayı sayfa yenilenene kadar kısmasın.
const YEDEK_SURESI_MS = 10_000;
let motorDustu = 0;
async function tuvaldenOku(tuval: HTMLCanvasElement): Promise<string | null> {
  if (Date.now() - motorDustu >= YEDEK_SURESI_MS) {
    const ctx = tuval.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    try { return await matrisOku(ctx.getImageData(0, 0, tuval.width, tuval.height)); } catch { motorDustu = Date.now(); }
  }
  return jsqrIleOku(tuval);
}
export async function goruntudenOku(kaynak: ImageBitmap | HTMLVideoElement, tuval: HTMLCanvasElement): Promise<string | null> {
  const g = kaynak instanceof HTMLVideoElement ? kaynak.videoWidth : kaynak.width;
  const y = kaynak instanceof HTMLVideoElement ? kaynak.videoHeight : kaynak.height;
  if (!g || !y) return null;
  const a = await yerelAlgilayici();
  if (a) { try { return (await a.detect(kaynak))[0]?.rawValue ?? null; } catch { /* zxing'e düş */ } }
  const olcek = Math.min(1, 960 / Math.max(g, y));
  tuval.width = Math.round(g * olcek); tuval.height = Math.round(y * olcek);
  tuval.getContext('2d')?.drawImage(kaynak, 0, 0, tuval.width, tuval.height);
  return tuvaldenOku(tuval);
}

export function useKamera(okundu: (kod: string) => void) {
  const video = useRef<HTMLVideoElement | null>(null);
  const tuval = useRef<HTMLCanvasElement | null>(null);
  const akis = useRef<MediaStream | null>(null);
  const son = useRef<{ kod: string; zaman: number }>({ kod: '', zaman: 0 });
  const [acik, setAcik] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const bildir = useCallback((kod: string) => {
    const simdi = Date.now();
    if (kod === son.current.kod && simdi - son.current.zaman < 2000) return;
    son.current = { kod, zaman: simdi };
    okundu(kod);
  }, [okundu]);
  // İzin beklenirken kapatılır ya da bileşen kalkarsa (açılışta kendiliğinden açmada sık) geç gelen akış açık kalmasın diye her açma bir nesil alır.
  const nesil = useRef(0);
  const kapat = useCallback(() => { nesil.current += 1; akis.current?.getTracks().forEach((t) => t.stop()); akis.current = null; setAcik(false); }, []);
  const ac = useCallback(async () => {
    const benim = ++nesil.current;
    setHata(null);
    if (!navigator.mediaDevices?.getUserMedia) { setHata('Bu tarayıcı kameraya erişemiyor; el okuyucuyu ya da fotoğraftan okumayı kullanın.'); return; }
    try {
      const yeni = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (benim !== nesil.current) { yeni.getTracks().forEach((t) => t.stop()); return; }
      akis.current?.getTracks().forEach((t) => t.stop());
      akis.current = yeni;
      setAcik(true);
    } catch { if (benim === nesil.current) setHata('Kamera açılamadı: izin verilmedi ya da kamera yok.'); }
  }, []);
  useEffect(() => {
    if (!acik || !video.current || !akis.current) return;
    const v = video.current;
    v.srcObject = akis.current;
    void v.play().catch(() => undefined);
    let bitti = false;
    const dongu = async () => {
      if (bitti) return;
      if (tuval.current && v.readyState >= 2) { const kod = await goruntudenOku(v, tuval.current); if (kod) bildir(kod); }
      setTimeout(() => { void dongu(); }, 250);
    };
    void dongu();
    return () => { bitti = true; };
  }, [acik, bildir]);
  useEffect(() => kapat, [kapat]);
  const fotograftan = useCallback(async (dosya: File) => {
    setHata(null);
    if (!tuval.current) return;
    const kod = await goruntudenOku(await createImageBitmap(dosya), tuval.current);
    if (kod) bildir(kod); else setHata('Fotoğrafta okunabilir kod bulunamadı.');
  }, [bildir]);
  return { video, tuval, acik, hata, ac, kapat, fotograftan };
}
