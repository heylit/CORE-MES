import type { PartiBelgesi } from '#paylasilan/sozlesme/stok.ts';
import { Simge } from '../../ortak/arayuz/index.ts';

// Partiye bağlı sertifika ve raporlar; dosya stok'un kendi ucundan iner (Çizim merkezi yetkisi gerekmez).
export function PartiBelgeleri({ partiId, belgeler }: { partiId: number; belgeler: readonly PartiBelgesi[] }) {
  if (belgeler.length === 0) return null;
  return (
    <span className="tc-stok-belgeler">
      {belgeler.map((b) => (
        <a key={b.id} href={`/api/stok/partiler/${partiId}/belgeler/${b.id}`} target="_blank" rel="noopener">
          <Simge ad="download" boyut="k" />{b.ad}{b.harf ? ` (${b.harf})` : ''}
        </a>
      ))}
    </span>
  );
}
