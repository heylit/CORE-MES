import { adSoyad, basHarfler } from '../bicim.ts';
import type { Personel } from '../tipler.ts';

// Baş harf ve ad; ikinci satır (pozisyon gibi) isteğe bağlı. Renk tasarım değişkenindendir, kişiye göre renk verilmez (203 a).
export function KisiHucresi({ personel, alt }: { personel: Pick<Personel, 'ad' | 'soyad'> | null; alt?: string | undefined }) {
  return (
    <span className="tc-ik-kisi">
      <span className="tc-ik-kisi-bas" aria-hidden="true">{basHarfler(personel)}</span>
      <span className="tc-ik-kisi-ad">
        <b>{adSoyad(personel)}</b>
        {alt && <small>{alt}</small>}
      </span>
    </span>
  );
}
