import { useState } from 'react';
import { CokSatir, Dugme, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { AdimliForm, type FormVerisi, type KmAlan } from '../AdimliForm.tsx';
import { Ekler } from '../Ekler.tsx';
import { bugun, devDurumu } from '../kurallar.ts';
import { FAI_NEDEN, INSP_TUR } from '../sabitler.ts';
import type { Muayene } from '../tipler.ts';
import { siradakiNo, useKmKomutu, yeniKimlik, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { BelgeKontrolu } from './BelgeKontrolu.tsx';
import {
  aqlIleNumune, FAI_KAPSAM, kayitEngeli, kayitGovdesi, muayeneEksikleri, muayeneTopla, olcumleriKoru, sonucTonu, type MuayeneDegeri,
} from './hesap.ts';
import { KarakteristikTablosu } from './KarakteristikTablosu.tsx';
import { MuayeneBelgesi } from './MuayeneBelgesi.tsx';

// Form verisi uygulamanın serbest kayıt gövdesidir; muayene alanları buradan okunur.
const muayene = (d: FormVerisi): MuayeneDegeri => d as MuayeneDegeri;

const faiMi = (d: FormVerisi) => d.tur === 'FAI';

function alanlar(veri: KmVerisi): KmAlan[] {
  return [
    { k: 'no', etiket: 'Muayene no', zorunlu: true },
    { k: 'tur', etiket: 'Muayene türü', tur: 'secim', secenekler: INSP_TUR },
    { k: 'tarih', etiket: 'Tarih', tur: 'tarih', zorunlu: true },
    { k: 'muayeneci', etiket: 'Muayeneci', zorunlu: true, liste: 'kisi' },
    { k: 'parcaNo', etiket: 'Parça no', zorunlu: true, liste: 'parca' },
    { k: 'parcaAdi', etiket: 'Parça adı' },
    { k: 'rev', etiket: 'Revizyon', zorunlu: true, ipucu: 'Konfigürasyon izlenebilirliği için zorunlu' },
    { k: 'lot', etiket: 'Lot / seri no' },
    { k: 'emir', etiket: 'İş emri / sipariş', liste: 'emir' },
    { k: 'miktar', etiket: 'Parti miktarı', tur: 'sayi' },
    { k: 'numune', etiket: 'Numune sayısı', tur: 'sayi' },
    {
      k: 'tedarikci', etiket: 'Tedarikçi', tur: 'secim', genis: 'tam',
      secenekler: [['', '— (iç üretim)'] as const, ...veri.sup.map((s) => [s._id, `${s.kod ?? ''} ${s.ad ?? ''}`.trim()] as const)],
    },
    // Uygulama FAI bölümünü yalnız FAI türünde gösterir; tek tek kipte nedeni ve kapsamı ayrı sorar.
    { k: 'faiNeden', etiket: 'FAI nedeni', tur: 'secim', genis: 'yarim', zorunlu: true, gorunur: faiMi, secenekler: [['', 'Seçin'] as const, ...FAI_NEDEN] },
    { k: 'faiKapsam', etiket: 'Kapsam', tur: 'secim', genis: 'yarim', gorunur: faiMi, secenekler: FAI_KAPSAM, varsayilan: FAI_KAPSAM[0] },
  ];
}

const PARCA_ADIMI = ['no', 'tur', 'tarih', 'muayeneci', 'parcaNo', 'parcaAdi', 'rev', 'lot', 'emir', 'miktar', 'numune', 'tedarikci'];

export function MuayeneFormu({ veri, yetki, kayit, on, kapat, retOldu }: {
  veri: KmVerisi;
  yetki: KmYetkisi;
  kayit: Muayene | null;
  on?: Partial<Muayene>;
  kapat: () => void;
  // Yeni muayene Ret çıkınca NCR açma sorusu ekranda sorulur.
  retOldu: (d: MuayeneDegeri) => void;
}) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [kimlik] = useState(() => kayit?._id ?? yeniKimlik('insp'));
  const A = alanlar(veri);
  const kaynak = kayit ?? on ?? {};
  const ilk: MuayeneDegeri = {
    no: siradakiNo(veri.insp, 'MUA'), tur: INSP_TUR[0], tarih: bugun(),
    ...kaynak,
    satirlar: kaynak.chars?.length ? kaynak.chars : [{}, {}, {}],
  };
  const cihazGecerli = (id: string) => { const d = veri.dev.find((x) => x._id === id); return !d || devDurumu(d).kullanilir; };

  return (
    <AdimliForm
      baslik={kayit ? `${kayit.no ?? ''} düzenle` : 'Muayene kaydet'}
      alanlar={A}
      ilk={ilk}
      taslak={kayit ? undefined : 'insp'}
      gecmis={kayit ? { kol: 'insp', kimlik: kayit._id } : undefined}
      adimlar={[
        {
          baslik: 'Parça ve parti', alanlar: PARCA_ADIMI, ipucu: 'Muayene türünü seçin; numuneyi "AQL ile hesapla" ile bulabilirsiniz.',
          icerik: (d, degistir) => (
            <Dugme
              simge="target"
              onClick={() => {
                const p = aqlIleNumune(muayene(d).miktar, veri.ayarlar);
                if (!p) { bildir('hata', 'Önce parti miktarını girin.'); return; }
                degistir('numune', p.numune);
                degistir('aqlPlan', p.metin);
                bildir('bilgi', p.metin);
              }}
            >
              AQL ile hesapla
            </Dugme>
          ),
        },
        {
          baslik: 'Belge kontrolü', alanlar: ['faiNeden', 'faiKapsam'], ipucu: "Giriş muayenesinde belge ve kaynak kontrolleri, FAI'de AS9102 Form 1-2-3.",
          icerik: (d, degistir) => <BelgeKontrolu d={muayene(d)} degistir={degistir} />,
        },
        {
          baslik: 'Ölçümler', ipucu: 'Her karakteristik için ölçülen değeri ve cihazı girin; sonuç toleransa göre otomatik hesaplanır.',
          icerik: (h, degistir) => {
            const d = muayene(h);
            return (
            <>
              <KarakteristikTablosu satirlar={d.satirlar ?? []} cihazlar={veri.dev} degistir={(s) => { degistir('satirlar', s); }} />
              <CokSatir etiket="Not" rows={2} value={d.not ?? ''} onChange={(e) => { degistir('not', e.target.value); }} />
              <Ekler veri={veri} yetki={yetki} kol="insp" kimlik={kimlik} no={kayit?.no ?? ''} parcaNo={d.parcaNo ?? ''} />
            </>
            );
          },
        },
      ]}
      topla={(d) => muayeneTopla(muayene(d))}
      denetle={(d) => muayeneEksikleri(muayene(d))}
      sonuc={(d) => <>Muayene sonucu: <Rozet ton={sonucTonu(muayene(d).sonuc)}>{muayene(d).sonuc ?? ''}</Rozet></>}
      onizleme={(d) => <MuayeneBelgesi veri={veri} i={muayene(d)} />}
      kaydet={async (ham) => {
        const d = muayeneTopla(muayene(ham));
        const engel = kayitEngeli(d, !kayit, cihazGecerli);
        if (engel) { bildir('hata', engel); return; }
        const govde = kayitGovdesi({ ...d, chars: olcumleriKoru(d.chars ?? [], kayit?.chars) });
        await komut.kaydet('insp', { ...(kayit ?? {}), ...govde, _id: kimlik, cizimId: kayit?.cizimId || on?.cizimId || '' });
        kapat();
        if (d.sonuc === 'Ret' && !kayit) retOldu(d);
        else bildir('tamam', `Muayene kaydedildi: ${d.sonuc ?? ''}`);
      }}
      kapat={kapat}
    />
  );
}
