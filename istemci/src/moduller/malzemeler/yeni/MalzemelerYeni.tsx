import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DurumKutusu, Sekmeler } from '../../../ortak/arayuz/index.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { DIS_SAYFALAR, malzemeEtiketiYolu } from '../gorunumler.ts';
import { GenelAyarPenceresi } from './ayarlar/index.tsx';
import { BOLUMLER, YENI_KOK, adrestekiBolum, bolumYolu, type Bolum, type Gezinti } from './sekmeler.ts';
import { useBirimSistemi } from './tercihler.ts';
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
  const [ayarAcik, ayarAcikYaz] = useState(false);

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
      <UstBas qrAc={() => { void yonlendir(`${YENI_KOK}?qr=1`); }} ayarAc={() => ayarAcikYaz(true)} />
      <div className="tc-myeni-govde">
        {tanim ? <tanim.ekran ortam={ortam.data} yetki={yetki} git={git} /> : <DurumKutusu durum="bos" mesaj="Bu bölümü görme yetkin yok." />}
      </div>
      {ayarAcik && <GenelAyarPenceresi ortam={ortam.data} yetki={yetki} git={git} kapat={() => ayarAcikYaz(false)} />}
    </div>
  );
}

// Prototipin üst başı: her görünümde aynı büyük başlık ve açıklama; sağda QR okut, Ayarlar ve birim düğmeleri, altında kayıt yeri notu.
function UstBas({ qrAc, ayarAc }: { qrAc: () => void; ayarAc: () => void }) {
  const [birim, birimYaz] = useBirimSistemi();
  return (
    <header className="tc-myeni-ust">
      <div className="tc-myeni-ust-bas">
        <h1>Malzemeler ve Hizmetler</h1>
        <p className="tc-myeni-ust-aciklama">
          Hammadde, yarı mamul, mamul, sarf malzemesi, demirbaş, ticari mal ve hizmetleri adım adım tanımla. Her kayıt kodlu bir katalog kalemine dönüşür.
        </p>
      </div>
      <div className="tc-myeni-ust-sag">
        <div className="tc-myeni-araclar" role="group" aria-label="Birim sistemi">
          <button type="button" title="Etiketteki QR kodunu okut" onClick={qrAc}>QR okut</button>
          <button type="button" title="Onay akışı, kod, QR ve mükerrer tarama" onClick={ayarAc}>Ayarlar</button>
          <button type="button" aria-pressed={birim === 'met'} onClick={() => birimYaz('met')}>mm, kg</button>
          <button type="button" aria-pressed={birim === 'imp'} onClick={() => birimYaz('imp')}>in, lb</button>
        </div>
        <p className="tc-myeni-not">Kartlar TMI veritabanında</p>
      </div>
    </header>
  );
}
