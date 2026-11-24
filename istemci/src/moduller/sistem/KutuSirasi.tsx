import { Simge } from '../../ortak/arayuz/index.ts';
import { TONA_GORE_AD, type Kutu } from './izleme-yorumu.ts';

const SIMGE = { tamam: 'check', uyari: 'alert', hata: 'alert', pasif: 'help' } as const;

// Durum kutuları: renk şeridi + simge + yazılı hüküm (renk tek başına anlam taşımaz).
export function KutuSirasi({ kutular, etiket }: { kutular: readonly Kutu[]; etiket: string }) {
  return (
    <dl className="tc-sistem-saglik tc-izleme-kutular" aria-label={etiket}>
      {kutular.map((k) => (
        <div key={k.anahtar} className="tc-sistem-saglik-kutu" data-ton={k.ton}>
          <dt>{k.baslik}</dt>
          <dd className="tc-sistem-saglik-hukum"><Simge ad={SIMGE[k.ton]} boyut="k" /> {k.hukum}<span className="tc-gizli-etiket"> ({TONA_GORE_AD[k.ton]})</span></dd>
          <dd className="tc-sistem-saglik-yorum">{k.yorum}</dd>
        </div>
      ))}
    </dl>
  );
}
