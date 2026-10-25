import { useLayoutEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import type { KalemStokOzeti } from '../secici.ts';

// Kurulum ve Hazırlık görünümlerinin ortak küçük parçaları (prototipin kv ve stockHTML'i).

// Genişlik ölçüsü tasarım değişkeni değildir, veriden gelir: satır içi stil yerine öğenin değişkenine yazılır.
export function useOran<T extends HTMLElement>(oran: number) {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => { ref.current?.style.setProperty('--tc-ck-oran', String(oran)); }, [oran]);
  return ref;
}

export function StokMetni({ s }: { s: KalemStokOzeti }) {
  return s.st === 'none' ? <span className="tc-ck-mut">stok girilmedi</span> : <span className={`tc-ck-st-${s.st}`}>depoda {s.avail} / toplam {s.qty}</span>;
}
export function Kv({ k, children }: { k: string; children: ReactNode }) { return <div className="tc-ck-kv"><span>{k}</span><b>{children}</b></div>; }


// Prototipin `change` olayı: değer alan bırakılınca ya da Enter'la işlenir (React'in onChange'i her tuşta çalışırdı).
export function DegisinceGirdi({ deger, isle, ...geri }: { deger: string | number; isle: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'>) {
  const son = useRef(String(deger));
  const bitir = (v: string): void => { if (v === son.current) return; son.current = v; isle(v); };
  return (
    <input
      {...geri} key={String(deger)} defaultValue={deger}
      onBlur={(e) => { bitir(e.currentTarget.value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') bitir(e.currentTarget.value); }}
    />
  );
}
