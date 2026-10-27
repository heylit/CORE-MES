// Prototipteki küçük kutlamalar: görev bitince satır kayarak gider, onaylayınca damga basılır, Bugün'de bekleyen iş
// sıfıra inince konfeti atılır. Hareket azaltma tercihinde hiçbiri oynamaz, işlem beklemeden yapılır.

let kutlanacak = false;

// Kullanıcının kendi eylemi (bitirme, onay, okudum) bir sonraki Bugün çiziminde konfetiye izin verir (S.celebrate).
export function kutlamaIste(): void { kutlanacak = true; }
export function kutlamaAl(): boolean { const k = kutlanacak; kutlanacak = false; return k; }

export const hareketAzaltildi = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Prototipte damga 700 ms, bitirme 520 ms sonra yazılır; animasyon bitmeden kart değişmesin diye.
export const DAMGA_MS = 700;
export const BITIS_MS = 520;

const KONFETI_MS = 2600;
const KONFETI_SAYI = 140;
const KONFETI_RENKLERI = ['--hazard', '--grafik-2', '--run', '--stop', '--done', '--hold'];

export function konfeti(): void {
  if (hareketAzaltildi()) return;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  cv.className = 'tc-mk-konfeti';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const kok = getComputedStyle(document.documentElement);
  const renkler = KONFETI_RENKLERI.map((d) => kok.getPropertyValue(d).trim()).filter(Boolean);
  const dpr = window.devicePixelRatio || 1;
  const W = cv.width = window.innerWidth * dpr;
  const Y = cv.height = window.innerHeight * dpr;
  const parca = Array.from({ length: KONFETI_SAYI }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: Y * 0.45,
    vx: (Math.random() - 0.5) * 15 * dpr, vy: (-Math.random() * 15 - 6) * dpr,
    r: (5 + Math.random() * 6) * dpr, c: renkler[Math.floor(Math.random() * renkler.length)] ?? 'currentColor',
    a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3,
  }));
  const t0 = performance.now();
  const kare = (t: number) => {
    const gecen = t - t0;
    ctx.clearRect(0, 0, W, Y);
    for (const q of parca) {
      q.vy += 0.42 * dpr; q.vx *= 0.99; q.x += q.vx; q.y += q.vy; q.a += q.va;
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
      ctx.globalAlpha = Math.max(0, 1 - gecen / KONFETI_MS); ctx.fillStyle = q.c;
      ctx.fillRect(-q.r / 2, -q.r / 4, q.r, q.r / 2);
      ctx.restore();
    }
    if (gecen < KONFETI_MS) requestAnimationFrame(kare);
    else cv.remove();
  };
  requestAnimationFrame(kare);
}
