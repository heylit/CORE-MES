import { useCallback } from 'react';
import { Dugme, Simge } from '../../../ortak/arayuz/index.ts';
import { useDenetim } from './baglam.tsx';
import { ornekMi, ornekProfil, profilAdi, profilEkle } from './kurallar/profil.ts';

// Örnek firma (prototip openDemo, demoBanner). Örnek firmayı açmak yalnız yöneticidedir (862-864); dönüş, profil açmak gibi yazma
// yetkisi ister (Ayarlar'daki "Aç" ile aynı).

// Örnek profil yoksa eklenir, varsa açılır; Genel bakış'a gidilir.
export function useOrnegeGec(): (() => void) | null {
  const d = useDenetim();
  const { depoDegistir, git, bildir } = d;
  const izinli = d.yetki.yonetici && d.yetki.yazabilir;
  const gec = useCallback(() => {
    depoDegistir(null, (t) => {
      const var0 = t.order.find((id) => ornekMi(t.data[id]));
      t.active = var0 ?? profilEkle(t, ornekProfil());
    });
    git('dash');
    bildir('Örnek firma açıldı. Kendi profilinize Ayarlar sayfasından dönebilirsiniz.');
  }, [depoDegistir, git, bildir]);
  return izinli ? gec : null;
}

// Örnek firma açıkken her görünümün üstündeki bant; "Kendi profilime dön" örnek olmayan ilk profili açar.
export function OrnekFirmaBandi() {
  const d = useDenetim();
  if (!ornekMi(d.profil)) return null;
  const kendi = d.depo.order.find((id) => !ornekMi(d.depo.data[id]));
  const don = () => {
    if (kendi === undefined) return;
    const ad = profilAdi(d.depo.data[kendi]);
    d.depoDegistir(null, (t) => { t.active = kendi; });
    d.bildir(`${ad} açıldı`);
  };
  return (
    <div className="tc-dhy-bant tc-dhy-ornek" role="status">
      <span className="tc-dhy-ornek-metin">
        <Simge ad="layers" />
        <span><b>Örnek firmadasınız.</b> Tüm sayfalar dolu örnek verilerle; dilediğiniz gibi kurcalayın, kendi verilerinizi etkilemez.</span>
      </span>
      {kendi !== undefined && d.yetki.yazabilir && <Dugme simge="rotate" onClick={don}>Kendi profilime dön</Dugme>}
    </div>
  );
}
