import type { EmirTamamlamaCevabi } from '#paylasilan/sozlesme/stok.ts';

// 3437: ikame notu adın altında ayrı satırdır; kodlar dar ekranda tireden bölünmez (Test 3437-not, 360).
export function IkameNotu({ ikame }: { ikame: EmirTamamlamaCevabi['bilesenler'][number]['ikame'] }) {
  if (!ikame) return null;
  return (
    <small className="tc-emir-ikame">
      Alternatif: <span className="tc-emir-ikame-kod">{ikame.kod}</span> (istenen <span className="tc-emir-ikame-kod">{ikame.istenenKod}</span>)
    </small>
  );
}
