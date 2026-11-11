import { komutKodu, type Komut } from '#paylasilan/kod-sozlugu.ts';
import { Dugme, Kart, Qr } from '../../ortak/arayuz/index.ts';
import { OKUT_MODLARI } from './okutma-modlari.ts';
import { SayfaBasi } from './ortak.tsx';
import './stok.css';

// Komut kartı (1909, 1912): okuyucunun tetiği bilgisayara bir şey göndermez; ekrandaki düğmenin karşılığı bu kartın barkodudur.
// Basılıp okuyucunun yanına asılır. QR basılır: el okuyucu da kamera da okur (kamera yalnız QR okur). Kartta yalnız komut vardır.
interface Satir { komut: Komut; ad: string; not: string }
const ISLER: readonly Satir[] = [
  { komut: { ad: 'KAYDET' }, ad: 'Kaydet', not: 'Sayımı kaydet, adımı topla' },
  { komut: { ad: 'GERI-AL' }, ad: 'Geri al', not: 'Son okutmayı geri al' },
  { komut: { ad: 'EVET' }, ad: 'Evet', not: 'Açık soruyu onayla' },
  { komut: { ad: 'VAZGEC' }, ad: 'Vazgeç', not: 'Açık soruyu kapat' },
  { komut: { ad: 'ARTI' }, ad: 'Artı bir', not: 'Son satıra +1' },
  { komut: { ad: 'EKSI' }, ad: 'Eksi bir', not: 'Son satırdan -1' },
];
const MIKTARLAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 50, 100] as const;

function Hucre({ kod, ad, not }: { kod: string; ad: string; not?: string }) {
  return (
    <li className="tc-stok-komut">
      <Qr metin={kod} boyut={112} />
      <strong>{ad}</strong>
      {not && <span className="tc-stok-not">{not}</span>}
      <span className="tc-stok-mono tc-stok-komut-kod">{kod}</span>
    </li>
  );
}

export function KomutKarti() {
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Komut kartı" aciklama="El okuyucuyla okutulunca ekrandaki düğmeye basılmış olur. Yazdır, okuyucunun yanına as."
        sag={<Dugme simge="printer" onClick={() => window.print()}>Yazdır</Dugme>} />
      <div className="tc-stok-yazdir tc-stok-komut-karti">
        <Kart baslik="İşler" simge="check">
          <ul className="tc-stok-komutlar" aria-label="İş komutları">{ISLER.map((s) => <Hucre key={s.ad} kod={komutKodu(s.komut)} ad={s.ad} not={s.not} />)}</ul>
        </Kart>
        <Kart baslik="Miktar" simge="sort">
          <p className="tc-stok-not">Son okutulan satırın miktarını yazar.</p>
          <ul className="tc-stok-komutlar tc-stok-komutlar-sik" aria-label="Miktar komutları">
            {MIKTARLAR.map((n) => <Hucre key={n} kod={komutKodu({ ad: 'MIKTAR', miktar: n })} ad={String(n)} />)}
          </ul>
        </Kart>
        <Kart baslik="Okut modu" simge="scan">
          <p className="tc-stok-not">Okut panelinin modunu seçer; yalnız yetkin olan mod açılır.</p>
          <ul className="tc-stok-komutlar" aria-label="Mod komutları">
            {OKUT_MODLARI.map((m) => <Hucre key={m.mod} kod={komutKodu({ ad: 'MOD', mod: m.komut })} ad={`Mod: ${m.ad}`} not={m.aciklama} />)}
          </ul>
        </Kart>
      </div>
    </section>
  );
}
