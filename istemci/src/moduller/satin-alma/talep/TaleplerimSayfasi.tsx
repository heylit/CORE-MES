import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { OnTalep, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { Sekmeler, type Sekme } from '../../../ortak/arayuz/index.ts';
import { OnTalepler } from './OnTalepler.tsx';
import { TalepAc } from './TalepAc.tsx';
import { HEPSI, Taleplerim, suzgeceUyar, type DurumSuzgeci, type Duzenleme } from './Taleplerim.tsx';
import { SURE, anahtarlar, cagri } from './ortak.ts';
import './talep.css';

type Bolum = 'on' | 'liste' | 'yeni';

// 898 a: Taleplerim üç bölümdür: sistemin önerdiği ön talepler, açılan talepler ve yeni talep. Ön talep "Talebe çevir" ile formu doldurur.
// Sayılar talep listesinden (en çok 500 talep) ve ön talep ucundan gelir.
export function TaleplerimSayfasi() {
  const [bolum, bolumYaz] = useState<Bolum>('on');
  const [taslak, taslakYaz] = useState<readonly OnTalep[] | null>(null);
  // Üretim emrinden (3329) gelen talep o emre bağlı açılır: formdaki emir seçili gelir.
  const [taslakEmri, taslakEmriYaz] = useState<number | null>(null);
  const [duzenlenen, duzenlenenYaz] = useState<Talebim | null>(null);
  const [kip, kipYaz] = useState<Duzenleme>('duzenle');
  const [suzgec, suzgecYaz] = useState<DurumSuzgeci>('acik');
  // Ctrl K komutu ve arama sonucu (1237) bölümü adresle seçer; adres temizlenir ki geri gelince bölüm yeniden zorlanmasın.
  const [adres, adresYaz] = useSearchParams();
  // Termin takibinden (2433) "Talep aç": eksik miktarla dolu taslak adresin durumunda gelir; ön talep gibi forma düşer.
  const konum = useLocation();
  useEffect(() => {
    const istenen = adres.get('bolum');
    if (istenen !== 'yeni' && istenen !== 'liste') return;
    const durum = konum.state as { taslak?: readonly OnTalep[] | null; uretimEmriId?: number | null } | null;
    const gelen = durum?.taslak;
    if (istenen === 'yeni' && gelen && gelen.length > 0) taslakYaz(gelen);
    if (istenen === 'yeni' && typeof durum?.uretimEmriId === 'number') taslakEmriYaz(durum.uretimEmriId);
    bolumYaz(istenen);
    adresYaz({}, { replace: true });
  }, [adres, adresYaz, konum.state]);
  const on = useQuery({ queryKey: anahtarlar.onTalepler, queryFn: () => cagri.get('/satin-alma-on-talepleri', SURE) });
  const talepler = useQuery({ queryKey: anahtarlar.taleplerim(HEPSI), queryFn: () => cagri.get('/satin-alma-taleplerim', { sorgu: { sinir: HEPSI }, ...SURE }) });
  const say = (s: DurumSuzgeci) => talepler.data?.talepler.filter((t) => suzgeceUyar(t, s)).length;
  const onSayisi = on.data?.onTalepler.length;
  // Özet kutuları yerine (3797) açık talep sayısı sekmede, durum sayıları listenin süzgeç çiplerinde yazar.
  const acikSayisi = say('acik');
  const sekmeler: Sekme<Bolum>[] = [
    { anahtar: 'on', baslik: 'Ön talepler', simge: 'rotate', ...(onSayisi === undefined ? {} : { sayi: onSayisi }) },
    { anahtar: 'liste', baslik: 'Taleplerim', simge: 'list', ...(acikSayisi === undefined ? {} : { sayi: acikSayisi }) },
    { anahtar: 'yeni', baslik: 'Yeni talep', simge: 'plus' },
  ];
  return (
    <div className="sa-talep">
      <Sekmeler etiket="Taleplerim bölümleri" sekmeler={sekmeler} secili={bolum} sec={bolumYaz} />
      {bolum === 'on' && <OnTalepler talepler={talepler.data?.talepler ?? []} talepteGit={() => { suzgecYaz('hepsi'); bolumYaz('liste'); }}
        cevir={(l) => { taslakYaz(l); taslakEmriYaz(null); bolumYaz('yeni'); }} />}
      {bolum === 'liste' && <Taleplerim tam suzgec={suzgec} suzgecYaz={suzgecYaz} duzenle={(t, k) => { kipYaz(k); duzenlenenYaz(t); bolumYaz('yeni'); }} />}
      {/* Form bölüm değişse de bağlı kalır ki yarım kalan talep kaybolmasın. */}
      <div hidden={bolum !== 'yeni'}>
        <TalepAc taslak={taslak} taslakEmri={taslakEmri} taslakBitti={(gonderildi) => { taslakYaz(null); taslakEmriYaz(null); bolumYaz(gonderildi ? 'liste' : 'on'); suzgecYaz('acik'); }}
          duzenlenen={duzenlenen} guncelleme={kip === 'guncelle'} duzenlemeBitti={() => { duzenlenenYaz(null); bolumYaz('liste'); }} />
      </div>
    </div>
  );
}
