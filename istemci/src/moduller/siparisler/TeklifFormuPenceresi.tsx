import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import type { TeklifAyrintiCevabi, TeklifFormuCevabi, TeklifFormuVerisiCevabi, TeklifSurumuCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { DurumKutusu, Dugme, Girdi, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKurumLogosu } from '../../ortak/veri/kurum-logosu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { TeklifFormuKagidi, type FormVerisi } from './TeklifFormuKagidi.tsx';
import { kdvOraniOku, useKagitOlcegi } from './teklif-formu.ts';
import './teklif-formu.css';

interface Ozellikler { acik: boolean; kapat: () => void; teklif: TeklifAyrintiCevabi; surum: TeklifSurumuCevabi }

const KDV_VARSAYILAN = '20';

// Teklif formu penceresi (3245 d): şablon seçilir (varsayılan önce gelir), ilgili kişi ve KDV oranı yazılır; ikisi saklanmaz.
// "Yazdır / PDF" tarayıcının basım penceresini açar; PDF orada "PDF olarak kaydet" ile alınır (yeni paket yok, Türkçe harf sorunsuz).
export function TeklifFormuPenceresi({ acik, kapat, teklif, surum }: Ozellikler) {
  const ayar = useQuery({ queryKey: anahtarlar.teklifFormuAyari, queryFn: () => api.get<TeklifFormuCevabi>('/siparisler/teklif-formu'), enabled: acik });
  const logo = useKurumLogosu(acik);
  const [sablonId, sablonIdYaz] = useState<number | null>(null);
  const [ilgili, ilgiliYaz] = useState('');
  const [kdvGirdi, kdvGirdiYaz] = useState(KDV_VARSAYILAN);
  const kdvOrani = kdvOraniOku(kdvGirdi);
  const sorgu = { surumNo: surum.surumNo, kdvOrani: kdvOrani ?? KDV_VARSAYILAN };
  const veri = useQuery({
    queryKey: anahtarlar.teklifFormuVerisi(teklif.id, sorgu),
    queryFn: () => api.get<TeklifFormuVerisiCevabi>(`/siparisler/teklifler/${String(teklif.id)}/form?surumNo=${String(sorgu.surumNo)}&kdvOrani=${encodeURIComponent(sorgu.kdvOrani)}`),
    enabled: acik && kdvOrani !== null,
    placeholderData: (onceki) => onceki,
  });

  const sablonlar = ayar.data?.sablonlar ?? [];
  const sablon = sablonlar.find((s) => s.id === sablonId) ?? sablonlar.find((s) => s.varsayilan) ?? sablonlar[0] ?? null;

  const formVerisi = useMemo<FormVerisi | null>(() => {
    if (!veri.data) return null;
    const fiyat = new Map(surum.fiyatlar.map((f) => [f.satirId, f]));
    return {
      no: teklif.no, surumNo: surum.surumNo, tarih: surum.olusturma, gecerlilik: surum.gecerlilik, baslik: teklif.baslik, paraBirimi: teklif.paraBirimi,
      teslimGun: surum.teslimGun, terminTarihi: surum.terminTarihi, odemeKosulu: surum.odemeKosulu, iskontoOrani: surum.iskontoOrani,
      satirlar: teklif.satirlar.map((s) => ({
        id: s.id, kod: s.malzemeKodu, ad: s.tanim, miktar: s.miktar, birim: s.birim,
        birimFiyat: fiyat.get(s.id)?.birimFiyat ?? null, iskontoluFiyat: fiyat.get(s.id)?.iskontoluFiyat ?? null, tutar: fiyat.get(s.id)?.tutar ?? null,
      })),
      musteri: veri.data.musteri, ilgili,
      toplam: {
        araToplam: veri.data.araToplam, iskontoTutari: veri.data.iskontoTutari, kdvHaric: veri.data.kdvHaric,
        kdvOrani: veri.data.kdvOrani, kdvTutari: veri.data.kdvTutari, genelToplam: veri.data.genelToplam,
      },
    };
  }, [veri.data, teklif, surum, ilgili]);

  // PDF'in dosya adı belge başlığından gelir; basım bitince eski başlık döner.
  useEffect(() => {
    const eski = document.title;
    const bitti = () => { document.title = eski; };
    window.addEventListener('afterprint', bitti);
    return () => { window.removeEventListener('afterprint', bitti); bitti(); };
  }, []);
  const yazdir = () => {
    document.title = `${teklif.no}-S${String(surum.surumNo)}`;
    window.print();
  };

  const hazir = sablon !== null && formVerisi !== null && ayar.data !== undefined;
  const kagitOzellikleri = hazir ? { dil: sablon.dil, icerik: sablon.icerik, kurum: ayar.data.kurum, logo: logo.data?.logo ?? null, veri: formVerisi } : null;
  const kutu = useRef<HTMLDivElement>(null);
  const kagit = useRef<HTMLElement>(null);
  useKagitOlcegi(kutu, kagit, acik && kagitOzellikleri !== null);

  return (
    <Pencere
      acik={acik}
      kapat={kapat}
      baslik={`Teklif formu · ${teklif.no} · Sürüm ${String(surum.surumNo)}`}
      tur="yan"
      genis
      alt={(
        <>
          <Dugme onClick={kapat}>Kapat</Dugme>
          <Dugme tur="birincil" simge="printer" onClick={yazdir} disabled={!hazir || veri.isFetching || kdvOrani === null}>Yazdır / PDF</Dugme>
        </>
      )}
    >
      <div className="tc-sp-yigin">
        <div className="tc-tf-arac">
          <Secim
            etiket="Şablon"
            secenekler={sablonlar.map((s) => ({ deger: String(s.id), baslik: s.varsayilan ? `${s.ad} (varsayılan)` : s.ad }))}
            value={sablon === null ? '' : String(sablon.id)}
            onChange={(o) => sablonIdYaz(Number(o.target.value))}
            disabled={sablonlar.length === 0}
          />
          <Girdi etiket="İlgili kişi" ipucu="İsteğe bağlı; kaydedilmez." autoComplete="off" maxLength={80} value={ilgili} onChange={(o) => ilgiliYaz(o.target.value)} />
          <Girdi
            etiket="KDV oranı (%)"
            inputMode="decimal"
            autoComplete="off"
            value={kdvGirdi}
            onChange={(o) => kdvGirdiYaz(o.target.value)}
            hata={kdvOrani === null ? 'KDV oranı 0 ile 100 arasında, en çok iki ondalıklı bir sayıdır.' : undefined}
          />
        </div>
        <p className="tc-tf-ipucu">PDF için basım penceresinde hedef olarak “PDF olarak kaydet” seçilir.</p>
        {ayar.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayar.error, 'Form şablonları alınamadı')} yenile={() => { void ayar.refetch(); }} />}
        {veri.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Form verisi alınamadı')} yenile={() => { void veri.refetch(); }} />}
        {!ayar.isError && !veri.isError && kagitOzellikleri === null && <DurumKutusu durum="yukleniyor" />}
        {kagitOzellikleri !== null && (
          <div ref={kutu} className="tc-tf-kutu-olcek">
            <TeklifFormuKagidi ref={kagit} {...kagitOzellikleri} />
          </div>
        )}
      </div>
      {acik && kagitOzellikleri !== null && createPortal(<div className="tc-tf-baski"><TeklifFormuKagidi {...kagitOzellikleri} /></div>, document.body)}
    </Pencere>
  );
}
