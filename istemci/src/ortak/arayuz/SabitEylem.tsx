import { useLayoutEffect, useRef, type ReactNode } from 'react';
import './sabit-eylem.css';

interface Ozellikler {
  children: ReactNode;
  // false: eylemin hedefi henüz belli değil (açık form yok, kayıt seçilmedi); düğme yerinde akar, sabitlenmez ve Kayıt gir dairesi
  // olduğu gibi kalır. Sabit eylem yalnız tek ve belirsiz olmayan hedefi etkiler (kart 3676, Arayüz bakışı).
  etkin?: boolean;
}

// Sayfanın tek ana eylemi. Telefonda alt gezinmenin hemen üstünde sabit durur (başparmak bölgesi); geniş ekranda olduğu
// yerde akar. Etkinken kabuğa `data-sabit-eylem` yazılır: Kayıt gir dairesi düz simgeye iner ve içerik alttan boşluk bırakır
// (kabuk.css). `:has` yerine öznitelik kullanılır; eski telefon tarayıcılarında da çalışır.
export function SabitEylem({ children, etkin = true }: Ozellikler) {
  const kap = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!etkin) return undefined;
    const kabuk = kap.current?.closest('.tc-kabuk');
    kabuk?.setAttribute('data-sabit-eylem', '');
    return () => { kabuk?.removeAttribute('data-sabit-eylem'); };
  }, [etkin]);
  return (
    <div ref={kap} className="tc-sabit-eylem" data-sabit={etkin ? '' : undefined}>
      <div className="tc-sabit-eylem-kutu">{children}</div>
    </div>
  );
}
