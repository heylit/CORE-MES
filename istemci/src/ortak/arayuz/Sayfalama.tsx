import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Dugme } from './Dugme.tsx';
import './sayfalama.css';

export interface SayfalamaOzellikleri {
  sayfa: number;
  sayfaBoyu: number;
  // null: sunucu toplamı saymıyor; yalnız önceki ve sonraki gösterilir.
  toplam: number | null;
  degistir: (sayfa: number) => void;
  // Bu sayfada gelen satır sayısı. Toplam bilinmiyorken son sayfayı (eksik dolu sayfa) ve özeti bu belirler.
  satirSayisi?: number;
  etiket?: string;
}

const sayi = (n: number) => n.toLocaleString('tr-TR');
// Sınır dışı girdi (sıfır, eksi, sayı olmayan) özeti ve sayfa sayısını bozmasın diye en küçük geçerli değere çekilir.
const enAzBir = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1);

export function Sayfalama({ sayfa: hamSayfa, sayfaBoyu: hamBoy, toplam, degistir, satirSayisi, etiket = 'Sayfalar' }: SayfalamaOzellikleri) {
  const sayfa = enAzBir(hamSayfa);
  const sayfaBoyu = enAzBir(hamBoy);
  const sonSayfa = toplam === null ? null : Math.max(1, Math.ceil(toplam / sayfaBoyu));
  const ilkKayit = (sayfa - 1) * sayfaBoyu + 1;
  // İlk sayfada kayıt yoksa söylenecek şey listenin boş durumudur; sayfalama yer tutmaz.
  if (sayfa <= 1 && (toplam === 0 || (toplam === null && satirSayisi === 0))) return null;

  let ozet: string;
  if (toplam !== null) {
    ozet = ilkKayit > toplam ? `${sayi(toplam)} kayıt` : `${sayi(toplam)} kayıttan ${sayi(ilkKayit)}–${sayi(Math.min(sayfa * sayfaBoyu, toplam))}`;
  } else if (satirSayisi === 0) {
    ozet = 'Bu sayfada kayıt yok';
  } else {
    ozet = `Kayıt ${sayi(ilkKayit)}–${sayi(satirSayisi === undefined ? sayfa * sayfaBoyu : ilkKayit - 1 + satirSayisi)}`;
  }

  const oncekiVar = sayfa > 1;
  const sonrakiVar = sonSayfa !== null ? sayfa < sonSayfa : satirSayisi === undefined || satirSayisi >= sayfaBoyu;
  const dugmeler = sonSayfa === null || sonSayfa > 1 || sayfa > 1;

  // Pasif düğme `disabled` almaz: sınıra gelince basılan düğme odağını yitirmez, klavyeyle gezen yerinde kalır.
  const dugme = (simge: SimgeAdi, ad: string, hedef: number, acik: boolean) => (
    <Dugme className="tc-sayfalama-dugme" simge={simge} aria-label={ad} aria-disabled={!acik} onClick={() => { if (acik) degistir(hedef); }} />
  );

  return (
    <nav className="tc-sayfalama" aria-label={etiket}>
      <p className="tc-sayfalama-ozet" role="status">{ozet}</p>
      {dugmeler && (
        <div className="tc-sayfalama-dugmeler">
          {sonSayfa !== null && dugme('first', 'İlk sayfa', 1, oncekiVar)}
          {dugme('chev-left', 'Önceki sayfa', Math.min(sayfa - 1, sonSayfa ?? sayfa - 1), oncekiVar)}
          <span className="tc-sayfalama-yer" aria-current="page">
            {sonSayfa === null ? `Sayfa ${sayi(sayfa)}` : `${sayi(sayfa)} / ${sayi(sonSayfa)}`}
          </span>
          {dugme('chev-right', 'Sonraki sayfa', sayfa + 1, sonrakiVar)}
          {sonSayfa !== null && dugme('last', 'Son sayfa', sonSayfa, sonrakiVar)}
        </div>
      )}
    </nav>
  );
}
