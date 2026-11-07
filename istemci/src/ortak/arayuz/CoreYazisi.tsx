import { UYGULAMA_ADI } from '#paylasilan/uygulama.ts';
import { HARFLER, SVG_KUTUSU, svgYolu } from './core-harfleri.ts';
import './core-yazisi.css';

// Uygulamanın adı giriş ekranındaki harf biçimiyle çizilir (kart 2230a): aynı dış hatlar, aynı renkler, sahnesiz ve hareketsiz.
// Harfler kabuğun yazı rengini alır, O giriş sahnesindeki altın halkadır (core-yazisi.css).
export function CoreYazisi({ className }: { className?: string }) {
  return (
    <svg className={['tc-core-yazisi', className].filter(Boolean).join(' ')} viewBox={SVG_KUTUSU} role="img" aria-label={UYGULAMA_ADI} focusable="false">
      <title>{UYGULAMA_ADI}</title>
      {HARFLER.map((h) => <path key={h.ad} className={h.ad === 'O' ? 'tc-core-yazisi-o' : undefined} d={svgYolu(h)} fillRule="evenodd" />)}
    </svg>
  );
}
