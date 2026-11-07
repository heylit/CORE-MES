import type { Ayrinti, MetrikDakikasi } from '#paylasilan/sozlesme/saglik.ts';
import { Simge } from '../../ortak/arayuz/index.ts';
import { saglikKutulari } from './saglik-ozeti.ts';
import './sistem-durumu.css';

// Altı kutu: hüküm büyük, nedeni bir satır, rakam ve sınır en altta. Renk tek başına anlam taşımaz; hüküm yazıyla da söyler.
export function SaglikKutulari({ saglikli, ayrinti, sonDakika }: { saglikli: boolean | null; ayrinti: Ayrinti; sonDakika: MetrikDakikasi | null | undefined }) {
  return (
    <dl className="tc-sistem-saglik" aria-label="Sistem sağlığı">
      {saglikKutulari(saglikli, ayrinti, sonDakika).map((k) => (
        <div key={k.anahtar} className="tc-sistem-saglik-kutu" data-ton={k.ton}>
          <dt><Simge ad={k.simge} boyut="k" />{k.baslik}</dt>
          <dd className="tc-sistem-saglik-hukum">{k.hukum}</dd>
          <dd className="tc-sistem-saglik-yorum">{k.yorum}</dd>
          {k.alt !== null && <dd className="tc-sistem-soluk">{k.alt}</dd>}
        </div>
      ))}
    </dl>
  );
}
