import { Dugme } from '../../../../../ortak/arayuz/index.ts';
import { useSihirbaz } from '../baglam.ts';
import { Uyari } from '../parcalar.tsx';

// Malzeme ayarlarındaki kategori bölümü (prototipte `KAT_BOLUMU`); yalnız sarf ve demirbaşın kategorisi ayardan açılır.
const KAT_BOLUMU: Partial<Record<string, string>> = { sarf: 'sarf', demirbas: 'db' };

// Sunucu kartı kategorisi kapalı diye reddettiyse (prototipte `katUyariHTML`): tür ya da kategori değişince uyarı düşer.
export function KategoriUyarisi() {
  const { secim, taslak: d, yetki, git } = useSihirbaz();
  const u = secim.katUyari;
  if (!u || u.tur !== d.tur || u.kat !== (typeof d.g.kat === 'string' ? d.g.kat : undefined)) return null;
  const bolum = KAT_BOLUMU[u.tur];
  return (
    <Uyari ton="uyumsuz">
      <span>{u.mesaj}</span>
      {bolum && (yetki.ayarYaz
        ? <Dugme simge="plus" onClick={() => { git.ayarlar(bolum); }}>Kategorileri aç</Dugme>
        : <span> Kategori açmak için yetkili kişiye başvurun.</span>)}
    </Uyari>
  );
}
