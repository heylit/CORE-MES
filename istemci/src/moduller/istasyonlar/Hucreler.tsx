import { useEffect, useState, type ReactNode } from 'react';

// Hücrede düzenleme (kullanıcı kararı, kart #1109): değer yazılır, alandan çıkınca ya da Enter ile değişmişse kaydedilir;
// Escape eski değere döner. Sunucudan yeni değer gelince alan onu gösterir.
interface Ortak {
  etiket: string;
  // Kaydın sürümü: değişince (başkası yazdı, ya da eski sürüm uyarısından sonra güncel kayıt geldi) alan sunucudaki değere döner.
  surum?: number;
  disabled?: boolean;
  className?: string;
}

function useTaslak<T>(deger: T, surum: number | undefined) {
  const [taslak, taslakYaz] = useState(deger);
  useEffect(() => { taslakYaz(deger); }, [deger, surum]);
  return [taslak, taslakYaz] as const;
}

export function MetinHucresi({ etiket, deger, kaydet, disabled, className, mono, enCok, surum }: Ortak & {
  deger: string; kaydet: (d: string) => void; mono?: boolean; enCok?: number;
}) {
  const [taslak, taslakYaz] = useTaslak(deger, surum);
  const bitir = () => {
    const temiz = taslak.trim();
    // Boş ad ya da kod gönderilmez; sunucu reddedecekti, alan eski değere döner.
    if (temiz === '' || temiz === deger) { taslakYaz(deger); return; }
    kaydet(temiz);
  };
  return (
    <input
      className={['tc-alan-kutu', 'tc-ist-hucre', mono ? 'tc-ist-mono' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-label={etiket}
      value={taslak}
      maxLength={enCok}
      disabled={disabled}
      onChange={(o) => taslakYaz(o.target.value)}
      onBlur={bitir}
      onKeyDown={(o) => {
        if (o.key === 'Enter') o.currentTarget.blur();
        if (o.key === 'Escape') { taslakYaz(deger); }
      }}
    />
  );
}

// Ondalık virgülle yazılır; geçersiz sayı gönderilmez, alan eski değere döner.
export function SayiHucresi({ etiket, deger, kaydet, disabled, enAz, enCok, surum }: Ortak & {
  deger: number; kaydet: (d: number) => void; enAz: number; enCok: number;
}) {
  const metin = (d: number) => d.toLocaleString('tr-TR', { maximumFractionDigits: 2, useGrouping: false });
  const [taslak, taslakYaz] = useTaslak(metin(deger), surum);
  const bitir = () => {
    const sayi = Number(taslak.trim().replace(',', '.'));
    if (taslak.trim() === '' || !Number.isFinite(sayi) || sayi < enAz || sayi > enCok) { taslakYaz(metin(deger)); return; }
    if (sayi !== deger) kaydet(sayi);
  };
  return (
    <input
      className="tc-alan-kutu tc-ist-hucre tc-ist-sayi"
      aria-label={etiket}
      inputMode="decimal"
      value={taslak}
      disabled={disabled}
      onChange={(o) => taslakYaz(o.target.value)}
      onBlur={bitir}
      onKeyDown={(o) => {
        if (o.key === 'Enter') o.currentTarget.blur();
        if (o.key === 'Escape') taslakYaz(metin(deger));
      }}
    />
  );
}

// Seçim değişince hemen kaydedilir.
export function SecimHucresi({ etiket, deger, secenekler, kaydet, disabled, bos }: Ortak & {
  deger: string; secenekler: readonly { deger: string; baslik: string }[]; kaydet: (d: string) => void; bos?: string;
}) {
  return (
    <select
      className="tc-alan-kutu tc-ist-hucre"
      aria-label={etiket}
      value={deger}
      disabled={disabled}
      onChange={(o) => { if (o.target.value !== deger) kaydet(o.target.value); }}
    >
      {bos !== undefined && <option value="">{bos}</option>}
      {secenekler.map((s) => <option key={s.deger} value={s.deger}>{s.baslik}</option>)}
    </select>
  );
}

// Dar ekranda satır yığılır; her hücrenin başlığı görünür olur (geniş ekranda sütun başlığı yeter).
export function Hucre({ baslik, children, className }: { baslik: string; children: ReactNode; className?: string }) {
  return (
    <div className={['tc-ist-h', className ?? ''].filter(Boolean).join(' ')} role="cell">
      <span className="tc-ist-h-baslik" aria-hidden="true">{baslik}</span>
      {children}
    </div>
  );
}

export function SatirHatasi({ ileti }: { ileti: string | undefined }) {
  if (!ileti) return null;
  return <p className="tc-ist-hata tc-ist-satir-hata" role="alert">{ileti}</p>;
}
