import type { ReactNode } from 'react';
import { useMesaj } from '../durum.tsx';
import { iletiParcalari, type IletiParcasi } from '../kurallar.ts';

// İleti biçimi (kod, @kişi, @herkes, bağlantı, kalın, madde, satır) parça listesinden çizilir; HTML yazılmaz.
function Parca({ p, ben, ad }: { p: IletiParcasi; ben: string; ad: (id: string) => string }) {
  let ic: ReactNode;
  switch (p.tur) {
    case 'kod': return <code className="tc-ms-kod">{p.metin}</code>;
    case 'metin': ic = p.metin; break;
    case 'baglanti': ic = <a className="tc-ms-baglanti" href={p.adres} target="_blank" rel="noopener noreferrer">{p.adres}</a>; break;
    case 'kisi': ic = <span className={`tc-ms-bahis${p.id === ben ? ' tc-ms-bahis-ben' : ''}`}>@{ad(p.id)}</span>; break;
    case 'herkes': ic = <span className="tc-ms-bahis tc-ms-bahis-herkes">@herkes</span>; break;
    default: return null;
  }
  return p.kalin ? <strong>{ic}</strong> : <>{ic}</>;
}

export function IletiMetni({ metin }: { metin: string | undefined }) {
  const { ben, ad } = useMesaj();
  const satirlar = iletiParcalari(metin);
  return (
    <>
      {satirlar.map((s, i) => {
        const icerik = s.parcalar.map((p, j) => <Parca key={j} p={p} ben={ben.id} ad={ad} />);
        if (s.madde) return <span key={i} className="tc-ms-madde">{icerik}</span>;
        return <span key={i}>{icerik}{i < satirlar.length - 1 && <br />}</span>;
      })}
    </>
  );
}
