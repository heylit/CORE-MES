import { useEffect, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useMesaj } from '../durum.tsx';

// Prototipin `prop` satırı: simge, ad ve değer.
export function Ozellik({ simge, ad, children }: { simge: SimgeAdi; ad: string; children: ReactNode }) {
  return (
    <div className="tc-mi-ozellik">
      <dt><Simge ad={simge} /><span>{ad}</span></dt>
      <dd>{children}</dd>
    </div>
  );
}

export function Baslik({ simge, baslik, alt }: { simge: SimgeAdi; baslik: ReactNode; alt?: ReactNode }) {
  return (
    <div className="tc-mi-sayfa-ust">
      <span className="tc-mi-simge" aria-hidden="true"><Simge ad={simge} /></span>
      <div className="tc-mi-govde">
        {baslik}
        {alt && <div className="tc-mi-sayfa-alt">{alt}</div>}
      </div>
    </div>
  );
}

// Yerinde düzenlenen metin: odak çıkınca, değiştiyse yazılır; başkası değiştirirse odakta değilken yenilenir.
export function YerindeMetin({ deger, kaydet, tekSatir, ...geri }: {
  deger: string; kaydet: (yeni: string) => void; tekSatir?: boolean;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [yerel, yerelYaz] = useState(deger);
  const [odakta, odaktaYaz] = useState(false);
  useEffect(() => { if (!odakta) yerelYaz(deger); }, [deger, odakta]);
  return (
    <textarea
      {...geri}
      value={yerel}
      onFocus={() => odaktaYaz(true)}
      onChange={(o) => yerelYaz(o.target.value)}
      onKeyDown={tekSatir ? (o) => { if (o.key === 'Enter') { o.preventDefault(); o.currentTarget.blur(); } } : undefined}
      onBlur={() => { odaktaYaz(false); if (yerel !== deger) kaydet(yerel); }}
    />
  );
}

// Kaydın geldiği ileti: kanal varsa "#kanal kanalında göster".
export function KaynakBaglantisi({ cid, mid }: { cid?: string | null | undefined; mid?: string | null | undefined }) {
  const { veri, git, kapat } = useMesaj();
  const kanal = cid ? veri.kanallar.find((k) => k.id === cid) : undefined;
  if (!kanal || !mid) return null;
  return (
    <button type="button" className="tc-mi-kaynak" onClick={() => { kapat(); git({ kanal: kanal.id, ileti: mid }); }}>
      <Simge ad="users" /><span>#{kanal.name} kanalında göster</span>
    </button>
  );
}

export const Bolum = ({ baslik, ek, children }: { baslik: string; ek?: ReactNode; children: ReactNode }) => (
  <section className="tc-mi-sayfa-bolum" aria-label={baslik}>
    <div className="tc-mi-sayfa-bolum-ust"><h3>{baslik}</h3>{ek}</div>
    {children}
  </section>
);
