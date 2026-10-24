import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DurumKutusu, Sekmeler } from '../../../ortak/arayuz/index.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { DIS_SAYFALAR, malzemeEtiketiYolu } from '../gorunumler.ts';
import { BOLUMLER, YENI_KOK, adrestekiBolum, bolumYolu, type Bolum, type Gezinti } from './sekmeler.ts';
import { useKatalogOrtami } from './veri.ts';
import { useMalzemeYetkisi } from './yetki.ts';
import './malzemeler-yeni.css';

// TS geçişi (199 b): Malzeme Kataloğu'nun doğal ekranı, eski çerçevenin yanında ikinci yolda ve yalnız yöneticide.
// İç gezinme sekmelerledir; ikinci menü alıma kadar eski ekranı açar.
export function MalzemelerYeni() {
  return (
    <YeniEkranKapisi>
      <Icerik />
    </YeniEkranKapisi>
  );
}

function useGezinti(): Gezinti {
  const yonlendir = useNavigate();
  return useMemo<Gezinti>(() => {
    const gezin = (yol: string) => { void yonlendir(yol); };
    return {
      katalog: (kimlik) => gezin(kimlik ? `${YENI_KOK}?${new URLSearchParams({ kart: kimlik }).toString()}` : YENI_KOK),
      yeniKart: (s = {}) => {
        const sorgu = new URLSearchParams(Object.entries(s).filter((x): x is [string, string] => typeof x[1] === 'string')).toString();
        gezin(sorgu ? `${bolumYolu('kart')}?${sorgu}` : bolumYolu('kart'));
      },
      ayarlar: (bolum) => gezin(bolum ? `${bolumYolu('ayarlar')}?${new URLSearchParams({ bolum }).toString()}` : bolumYolu('ayarlar')),
      sablonlar: () => gezin(bolumYolu('sablonlar')),
      kilavuz: () => gezin(bolumYolu('kilavuz')),
      disari: (a) => gezin(a === 'logo' ? '/malzemeler/logo' : DIS_SAYFALAR[a]),
      etiketMerkezi: (no) => {
        const yol = malzemeEtiketiYolu(no);
        if (yol) gezin(yol);
      },
    };
  }, [yonlendir]);
}

function Icerik() {
  const { bolum: parca } = useParams();
  const ortam = useKatalogOrtami();
  const yetki = useMalzemeYetkisi(ortam.data);
  const git = useGezinti();
  const yonlendir = useNavigate();
  const bolum = adrestekiBolum(parca);

  if (ortam.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (ortam.isError) return <DurumKutusu durum="hata" mesaj="Malzeme ayarları okunamadı." yenile={() => void ortam.refetch()} />;
  if (bolum === null) return <DurumKutusu durum="bos" mesaj="Bu bölüm yok." />;

  const gorunen = BOLUMLER.filter((b) => b.gorur(yetki));
  const tanim = gorunen.find((b) => b.anahtar === bolum);
  return (
    <div className="tc-myeni">
      <Sekmeler<Bolum>
        etiket="Malzemeler ve Hizmetler"
        sekmeler={gorunen.map((b) => ({ anahtar: b.anahtar, baslik: b.baslik, simge: b.simge }))}
        secili={bolum}
        sec={(b) => { void yonlendir(bolumYolu(b)); }}
      />
      <div className="tc-myeni-govde">
        {tanim ? <tanim.ekran ortam={ortam.data} yetki={yetki} git={git} /> : <DurumKutusu durum="bos" mesaj="Bu bölümü görme yetkin yok." />}
      </div>
    </div>
  );
}
