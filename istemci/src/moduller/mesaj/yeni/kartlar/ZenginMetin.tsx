import { useMesaj } from '../durum.tsx';
import { iletiParcalari, type IletiParcasi } from '../kurallar.ts';

function Parca({ p }: { p: IletiParcasi }) {
  const { ad } = useMesaj();
  if (p.tur === 'kod') return <code>{p.metin}</code>;
  const icerik = p.tur === 'metin' ? p.metin
    : p.tur === 'kisi' ? <span className="tc-mi-bahis">@{ad(p.id)}</span>
      : p.tur === 'herkes' ? <span className="tc-mi-bahis">@herkes</span>
        : <a href={p.adres} target="_blank" rel="noopener noreferrer">{p.adres}</a>;
  return p.kalin ? <strong>{icerik}</strong> : <>{icerik}</>;
}

// Açıklama, gündem ve notların biçimi (eski ekranın `rich`'i): kalın, kod, bahis, bağlantı ve madde imi; HTML basılmaz.
export function ZenginMetin({ metin, sinif }: { metin: string | undefined; sinif?: string }) {
  const satirlar = iletiParcalari(metin);
  return (
    <div className={['tc-mi-zengin', sinif].filter(Boolean).join(' ')}>
      {satirlar.map((s, i) => (
        // Satırlar yalnız sırayla değişir; sıra anahtarı yeterlidir.
        <p key={i} className={s.madde ? 'tc-mi-madde' : undefined}>{s.parcalar.map((p, j) => <Parca key={j} p={p} />)}</p>
      ))}
    </div>
  );
}
