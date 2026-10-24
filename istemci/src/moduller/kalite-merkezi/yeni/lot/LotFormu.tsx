import { useState } from 'react';
import { Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { AdimliForm, type FormVerisi, type KmAlan } from '../AdimliForm.tsx';
import { AQL_DEGERLERI, DURDURULDU, lotAnahtari, SEVIYELER, SIKI, YUZDE_YUZ } from '../aql.ts';
import { Ekler } from '../Ekler.tsx';
import { bugun } from '../kurallar.ts';
import type { Lot } from '../tipler.ts';
import { siradakiNo, useKmKomutu, yeniKimlik, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import {
  aqlMetni, bulunanlar, lotEksikleri, lotKayitEngeli, lotSikiligi, lotTopla, planHucreleri, sikilikTonu, varsayilanAql, type LotDegeri,
} from './hesap.ts';
import { LotBelgesi } from './LotBelgesi.tsx';
import { PlanTablosu } from './Tablolar.tsx';

// Form verisi uygulamanın serbest kayıt gövdesidir; lot alanları buradan okunur.
const lot = (d: FormVerisi): LotDegeri => d as LotDegeri;

const aqlSecenekleri = (liste: readonly string[]) => liste.map((a) => [a, aqlMetni(a)] as const);

function alanlar(veri: KmVerisi): KmAlan[] {
  return [
    { k: 'no', etiket: 'Kayıt no', zorunlu: true },
    { k: 'tarih', etiket: 'Muayene tarihi', tur: 'tarih', zorunlu: true },
    { k: 'parcaNo', etiket: 'Parça no', zorunlu: true, liste: 'parca' },
    { k: 'parcaAdi', etiket: 'Parça adı' },
    {
      k: 'tedarikci', etiket: 'Tedarikçi', tur: 'secim', genis: 'tam',
      secenekler: [['', '— (iç üretim)'] as const, ...veri.sup.map((s) => [s._id, `${s.kod ?? ''} ${s.ad ?? ''}`.trim()] as const)],
    },
    { k: 'lotNo', etiket: 'Lot / parti no' },
    { k: 'emir', etiket: 'İş emri / sipariş', liste: 'emir' },
    { k: 'N', etiket: 'Parti büyüklüğü (N)', tur: 'sayi', zorunlu: true },
    { k: 'seviye', etiket: 'Muayene seviyesi', tur: 'secim', secenekler: SEVIYELER },
    { k: 'kr', etiket: 'Kritik', tur: 'secim', secenekler: aqlSecenekleri([YUZDE_YUZ, ...AQL_DEGERLERI]) },
    { k: 'mj', etiket: 'Majör AQL', tur: 'secim', secenekler: aqlSecenekleri(AQL_DEGERLERI) },
    { k: 'mn', etiket: 'Minör AQL', tur: 'secim', secenekler: aqlSecenekleri(AQL_DEGERLERI) },
    { k: 'muayeneci', etiket: 'Muayeneci', zorunlu: true, liste: 'kisi' },
    { k: 'yenidenSunum', etiket: 'Yeniden sunulan lot (geçişe sayılmaz)', tur: 'evet', genis: 'tam' },
    { k: 'bKr', etiket: 'Bulunan kritik', tur: 'sayi' },
    { k: 'bMj', etiket: 'Bulunan majör', tur: 'sayi' },
    { k: 'bMn', etiket: 'Bulunan minör', tur: 'sayi' },
    { k: 'not', etiket: 'Hata açıklaması / not', tur: 'cokSatir', genis: 'tam' },
  ];
}

function PlanOzeti({ veri, d, kayit }: { veri: KmVerisi; d: LotDegeri; kayit: Lot | null }) {
  const st = lotSikiligi(veri.lot, d, kayit);
  const sev = st.st === SIKI ? SIKI : 'Normal';
  return (
    <div className="tc-km2-lot-plan">
      <p>
        Sıkılık: <Rozet ton={sikilikTonu(st.st)}>{st.st}</Rozet>{' '}
        <span className="tc-km2-kucuk">{d.parcaNo ? st.sonraki : 'Parça no girildiğinde geçmiş lotlardan sıkılık hesaplanır.'}</span>
      </p>
      {st.st === DURDURULDU
        ? <p className="tc-km2-not tc-km2-not-hata">Bu parça ve tedarikçi için kabul muayenesi durduruldu.</p>
        : <PlanTablosu satirlar={planHucreleri(d.N, d.seviye, d, sev)} />}
    </div>
  );
}

function Karsilastirma({ veri, d, kayit }: { veri: KmVerisi; d: LotDegeri; kayit: Lot | null }) {
  const st = lotSikiligi(veri.lot, d, kayit);
  if (st.st === DURDURULDU) return null;
  const sev = st.st === SIKI ? SIKI : 'Normal';
  const t = lotTopla(veri.lot, d, kayit);
  return (
    <div className="tc-km2-lot-plan">
      <p>
        Karşılaştırma{' '}
        {t.karar === 'Bekliyor' ? <span className="tc-km2-kucuk">Üç sayı girilince karar çıkar</span> : <Rozet ton={t.karar === 'Kabul' ? 'tamam' : 'hata'}>{t.karar ?? ''}</Rozet>}
      </p>
      <PlanTablosu satirlar={planHucreleri(d.N, d.seviye, d, sev)} bulunan={bulunanlar(d)} />
    </div>
  );
}

export function LotFormu({ veri, yetki, kayit, on, kapat, retOldu }: {
  veri: KmVerisi; yetki: KmYetkisi; kayit: Lot | null; on?: Partial<Lot>; kapat: () => void; retOldu: (d: LotDegeri) => void;
}) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [kimlik] = useState(() => kayit?._id ?? yeniKimlik('lot'));
  const A = alanlar(veri);
  const v = varsayilanAql(veri.ayarlar);
  const ilk: LotDegeri = kayit ?? { no: siradakiNo(veri.lot, 'LOT'), tarih: bugun(), seviye: v.seviye, kr: v.kr, mj: v.mj, mn: v.mn, ...on };
  return (
    <AdimliForm
      baslik={kayit ? `${kayit.no ?? ''} düzenle` : 'Lot kabul kaydı (KF-12)'}
      alanlar={A}
      ilk={ilk}
      taslak={kayit ? undefined : 'lot'}
      gecmis={kayit ? { kol: 'lot', kimlik: kayit._id } : undefined}
      adimlar={[
        { baslik: 'Parti', alanlar: ['no', 'tarih', 'parcaNo', 'parcaAdi', 'tedarikci', 'lotNo', 'emir', 'N', 'yenidenSunum'], ipucu: 'Parça no ve tedarikçi girildiğinde sıkılık geçmiş lotlardan belirlenir.' },
        {
          baslik: 'Numune planı', alanlar: ['seviye', 'kr', 'mj', 'mn'],
          ipucu: 'Varsayılan AQL değerleri gelir; değiştirirseniz plan anında güncellenir. Numuneyi partiden rastgele çekin.',
          icerik: (d) => <PlanOzeti veri={veri} d={lot(d)} kayit={kayit} />,
        },
        {
          baslik: 'Sonuç', alanlar: ['bKr', 'bMj', 'bMn', 'muayeneci', 'not'],
          ipucu: 'Numunede bulunan uygun olmayan birim sayısını her sınıf için girin (yoksa 0).',
          icerik: (d) => (
            <>
              <Karsilastirma veri={veri} d={lot(d)} kayit={kayit} />
              <Ekler veri={veri} yetki={yetki} kol="lot" kimlik={kimlik} no={kayit?.no ?? ''} parcaNo={lot(d).parcaNo ?? ''} tur="Malzeme sertifikası" />
            </>
          ),
        },
      ]}
      topla={(d) => lotTopla(veri.lot, lot(d), kayit)}
      denetle={(d) => lotEksikleri(lot(d))}
      sonuc={(h) => {
        const d = lot(h);
        return <>Lot kararı: {d.karar === 'Bekliyor' ? <span className="tc-km2-kucuk">sayılar girilince</span> : <Rozet ton={d.karar === 'Kabul' ? 'tamam' : 'hata'}>{d.karar ?? ''}</Rozet>}</>;
      }}
      onizleme={(d) => <LotBelgesi veri={veri} l={lot(d)} />}
      kaydet={async (h) => {
        const ham = lot(h);
        const engel = lotKayitEngeli(veri.lot, ham, kayit);
        if (engel) { bildir('hata', engel); return; }
        const d = lotTopla(veri.lot, ham, kayit);
        await komut.kaydet('lot', { ...(kayit ?? {}), ...d, _id: kimlik, anahtar: lotAnahtari(d.parcaNo, d.tedarikci) });
        kapat();
        if (d.karar === 'Ret' && !kayit) retOldu(d);
        else bildir('tamam', `Lot kaydedildi: ${d.karar ?? ''}`);
      }}
      kapat={kapat}
    />
  );
}
