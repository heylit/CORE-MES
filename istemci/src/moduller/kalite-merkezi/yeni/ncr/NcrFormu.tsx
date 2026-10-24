import { useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { AdimliForm, type FormVerisi, type KmAdim, type KmAlan } from '../AdimliForm.tsx';
import { Ekler } from '../Ekler.tsx';
import { Damga } from '../KayitListesi.tsx';
import { bugun, ciddiyetTonu, ncrTonu } from '../kurallar.ts';
import { CIDDIYET, HATA, KAPALI, KAYNAK, MRB, MRB_KARAR_BEKLIYOR, NCR_DURUM } from '../sabitler.ts';
import type { Ncr } from '../tipler.ts';
import { siradakiNo, useKmKomutu, yeniKimlik, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { birakilacakPartiler, konumGerekli, useKarantinaSorulari, type SerbestMiktarlar } from './KarantinaSorulari.tsx';
import { NcrBelgesi } from './NcrBelgesi.tsx';
import { birakanKapanis, ncrSorunlari, yetkiGereken } from './ncr-kurallari.ts';

// Kapama ve MRB kararı kalite mühendisinindir: yetkisi olmayana bu seçenekler gösterilmez (kayıttaki değer korunur).
function secenekler(liste: readonly string[], izinli: boolean, sinirli: readonly string[], mevcut: string | undefined): string[] {
  if (izinli) return [...liste];
  return liste.filter((x) => sinirli.includes(x) || x === mevcut);
}

export function ncrAlanlari(veri: KmVerisi, yetki: KmYetkisi, rec: Ncr | null): KmAlan[] {
  return [
    { k: 'no', etiket: 'NCR no', zorunlu: true, varsayilan: () => siradakiNo(veri.ncr, 'NCR') },
    { k: 'tarih', etiket: 'Tespit tarihi', tur: 'tarih', zorunlu: true, varsayilan: bugun },
    { k: 'kaynak', etiket: 'Tespit yeri', tur: 'secim', secenekler: KAYNAK, varsayilan: KAYNAK[0] },
    { k: 'ciddiyet', etiket: 'Ciddiyet', tur: 'secim', secenekler: CIDDIYET, varsayilan: 'Majör' },
    { k: 'parcaNo', etiket: 'Parça no', zorunlu: true, liste: 'parca' },
    { k: 'parcaAdi', etiket: 'Parça adı' },
    { k: 'rev', etiket: 'Revizyon' },
    { k: 'lot', etiket: 'Lot / seri no' },
    { k: 'proje', etiket: 'Proje', genis: 'yarim' },
    { k: 'emir', etiket: 'İş emri / sipariş', liste: 'emir' },
    { k: 'miktar', etiket: 'Etkilenen miktar', tur: 'sayi', enAz: 0 },
    { k: 'hataTipi', etiket: 'Hata tipi', tur: 'secim', secenekler: HATA, varsayilan: HATA[0] },
    { k: 'tedarikci', etiket: 'İlgili tedarikçi', tur: 'secim', genis: 'yarim', secenekler: [['', '—'], ...veri.sup.map((s) => [s._id, `${s.kod ?? ''} ${s.ad ?? ''}`] as const)] },
    { k: 'sorumlu', etiket: 'Sorumlu', liste: 'kisi' },
    { k: 'durum', etiket: 'Durum', tur: 'secim', secenekler: secenekler(NCR_DURUM, yetki.kapat, NCR_DURUM.filter((d) => d !== KAPALI), rec?.durum), varsayilan: NCR_DURUM[0] },
    { k: 'tanim', etiket: 'Uygunsuzluk tanımı: gereksinim ne, mevcut durum ne', tur: 'cokSatir', zorunlu: true, genis: 'tam' },
    {
      k: 'mrb', etiket: 'MRB kararı', tur: 'secim', genis: 'yarim', secenekler: secenekler(MRB, yetki.kapat, [MRB_KARAR_BEKLIYOR], rec?.mrb),
      varsayilan: MRB_KARAR_BEKLIYOR, ipucu: 'Olduğu gibi kullan ve tamir kararları müşteri / yetkili makam onayı gerektirir.',
    },
    { k: 'mrbGerekce', etiket: 'Karar gerekçesi ve onay referansı', genis: 'yarim' },
  ];
}

interface Ozellikler {
  veri: KmVerisi;
  yetki: KmYetkisi;
  // Düzenlenen kayıt ya da null (yeni); yeni kayıtta ön değerler `on`dan.
  rec: Ncr | null;
  on?: Record<string, unknown>;
  kapat: () => void;
}

// Uygunsuzluk kaydı (uygulamadaki openNcr): dört adım, ekler üçüncü adımda, kontrol adımında MRB kuralları.
export function NcrFormu({ veri, yetki, rec, on, kapat }: Ozellikler) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const sorular = useKarantinaSorulari();
  const [rid] = useState(() => rec?._id ?? yeniKimlik('ncr'));
  const ilk: FormVerisi | null = rec ?? (on ? { ...on } : null);

  const adimlar: KmAdim[] = [
    { baslik: 'Tespit', alanlar: ['no', 'tarih', 'kaynak', 'ciddiyet', 'sorumlu'], ipucu: 'Uygunsuzluğun nerede, ne zaman bulunduğu ve ne kadar ciddi olduğu.' },
    { baslik: 'Ürün', alanlar: ['parcaNo', 'parcaAdi', 'rev', 'lot', 'emir', 'proje', 'miktar', 'tedarikci'], ipucu: 'Parça no yazmaya başlayınca önceki kayıtlardan öneri gelir; bilinen parçada ad kendiliğinden dolar.' },
    {
      baslik: 'Uygunsuzluk', alanlar: ['hataTipi', 'tanim'], ipucu: 'Gereksinim ne (resim, spesifikasyon maddesi), mevcut durum ne (ölçülen değer, görülen hata)?',
      icerik: (d) => <Ekler veri={veri} yetki={yetki} kol="ncr" kimlik={rid} no={String(d.no ?? rec?.no ?? '')} parcaNo={String(d.parcaNo ?? '')} />,
    },
    { baslik: 'MRB kararı', alanlar: ['mrb', 'mrbGerekce', 'durum'], ipucu: 'Karar henüz verilmediyse "Karar bekliyor" bırakın; kayıt açık kalır.' },
  ];

  const kaydet = async (d: FormVerisi) => {
    const kayit = { ...(rec ?? {}), ...d, _id: rid } as Ncr;
    if (yetkiGereken(kayit, rec) && !yetki.kapat) { bildir('hata', 'Kapama ve MRB kararı kalite mühendisi yetkisi ister.'); return; }
    const sorun = ncrSorunlari(kayit)[0];
    if (sorun) { bildir('hata', `${sorun.metin}.`); return; }
    let serbest: SerbestMiktarlar | undefined;
    if (birakanKapanis(kayit) && rec?.durum !== KAPALI) {
      const partiler = await birakilacakPartiler(rid);
      if (partiler.length) {
        const s = await sorular.miktarSor(partiler);
        if (s === null) { bildir('hata', 'Kapanış gönderilmedi.'); return; }
        serbest = s;
      }
    }
    const secenek = serbest?.length ? { serbestMiktarlar: serbest } : {};
    let sonuc: { uyari?: string };
    try {
      sonuc = await komut.kaydet('ncr', kayit, secenek);
    } catch (e) {
      if (!konumGerekli(e)) throw e;
      const konum = await sorular.konumSor(e.sunucuIletisi ?? '');
      if (konum === null) throw e;
      sonuc = await komut.kaydet('ncr', kayit, { ...secenek, karantinaHedefKonumId: konum });
    }
    if (sonuc.uyari) bildir('hata', sonuc.uyari);
    bildir('tamam', rec ? 'NCR güncellendi' : 'NCR kaydedildi');
    kapat();
  };

  return (
    <>
      <AdimliForm
        baslik={rec ? `${rec.no ?? ''} düzenle` : 'Uygunsuzluk kaydet'}
        alanlar={ncrAlanlari(veri, yetki, rec)}
        ilk={ilk}
        adimlar={adimlar}
        kaydet={kaydet}
        denetle={(d) => ncrSorunlari(d as Partial<Ncr>).map((s) => ({ metin: s.metin, adim: 3 }))}
        sonuc={(d) => (
          <p>
            Ciddiyet: <Damga ton={ciddiyetTonu(d.ciddiyet as string | undefined)}>{String(d.ciddiyet ?? '')}</Damga>{' '}
            Durum: <Damga ton={ncrTonu(String(d.durum || 'Açık'))}>{String(d.durum || 'Açık')}</Damga>
          </p>
        )}
        onizleme={(d) => <NcrBelgesi veri={veri} n={d as Partial<Ncr>} />}
        gecmis={rec ? { kol: 'ncr', kimlik: rec._id } : null}
        taslak="ncr"
        kapat={kapat}
      />
      {sorular.pencere}
    </>
  );
}
