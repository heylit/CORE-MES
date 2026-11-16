import './tur-kunyesi.css';

// Kartın türü ve kategorisi tek bakışta: tür kodu (HM, YM, MM ...) tür renginde dolu, kategori yanında çizgili. Renk tek başına
// anlam taşımaz: kısa kod okunur, tam ad ekran okuyucuya ve ipucuna gider.
export function TurKunyesi({ tur, kisa, ad, kategori, tamAd = false }: {
  tur: string; kisa: string; ad: string; kategori?: string | null; tamAd?: boolean;
}) {
  return (
    <span className="tc-tk" data-tur={tur}>
      <span className="tc-tk-tur" title={ad}>
        <span aria-hidden="true">{kisa || ad}</span>
        {tamAd ? <span className="tc-tk-ad">{ad}</span> : <span className="tc-gizli-etiket">{ad}</span>}
      </span>
      {kategori && <span className="tc-tk-kat" title={kategori}>{kategori}</span>}
    </span>
  );
}

// Kodun tür öneki (HM-ORN-00001'deki HM) tür renginde dolu görünür. Kod tek metin kalır (kopyalanan, aranan ve okunan aynı):
// boya, eş genişlikli yazıda önekin üstüne CSS ile çizilir. Önek kodda yoksa (Logo'dan gelen ya da elle yazılmış kod) tür kodu
// kodun önüne ayrı konur.
const ONEK_YERI = /^(?:[A-Z0-9]{2,5}-)?/;
export function TurluKod({ kod, tur, kisa, ad }: { kod: string; tur: string; kisa: string; ad: string }) {
  const yer = ONEK_YERI.exec(kod)?.[0].length ?? 0;
  const onekte = kisa !== '' && new RegExp(`^${kisa}(?=-|$)`).test(kod.slice(yer))
    ? yer : kisa !== '' && kod.startsWith(`${kisa}-`) ? 0 : -1;
  return (
    <span className="tc-tk-kod" data-tur={tur} title={ad}>
      {onekte < 0 && <span className="tc-tk-tur" aria-hidden="true">{kisa || ad}</span>}
      <span className="tc-tk-metin" {...(onekte >= 0 ? { 'data-onek': String(onekte), 'data-kisa': kisa } : {})}>{kod}</span>
    </span>
  );
}
