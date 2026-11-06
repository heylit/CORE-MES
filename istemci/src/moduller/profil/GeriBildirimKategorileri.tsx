import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GeriBildirimKategorisi, GeriBildirimKonusu, GeriBildirimSecenekleriCevabi } from '#paylasilan/sozlesme/profil.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONU_ADI, KONULAR, sayiMetni } from './gorunum.ts';
import { useIslemVar, useMerkezKomutu, yazmaIletisi } from './yazma.ts';
import './profil.css';

const KATEGORI_AD_EN_AZ = 2;
const KATEGORI_AD_EN_COK = 60;
const konuMetni = (k: GeriBildirimKonusu | null): string => (k === null ? 'İkisi de' : KONU_ADI[k]);

// Kategoriler (2192-3 a): çalışan kategori seçmez, kaydı merkezdeki kişi sınıflar. Kategori silinmez, pasife alınır;
// eski kayıt adını korur. Ekleme ve düzenleme yalnız kategori yazma işlemi olana görünür.
export function GeriBildirimKategorileri() {
  const yazabilir = useIslemVar('profil.geri-bildirim-kategori-yaz');
  const komut = useMerkezKomutu();
  const [ad, adYaz] = useState('');
  const [konu, konuYaz] = useState('');
  const [gidiyor, gidiyorYaz] = useState<number | 'yeni' | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.secenekler, queryFn: () => api.get<GeriBildirimSecenekleriCevabi>('/profil/geri-bildirim-secenekleri'),
  });

  const calistir = async (anahtar: number | 'yeni', is: () => Promise<unknown>) => {
    gidiyorYaz(anahtar);
    hataYaz(null);
    try {
      await is();
      return true;
    } catch (e) {
      hataYaz(yazmaIletisi(e, 'Kaydedilemedi.'));
      return false;
    } finally {
      gidiyorYaz(null);
    }
  };

  const ekle = async (o: FormEvent) => {
    o.preventDefault();
    if (ad.trim().length < KATEGORI_AD_EN_AZ) return;
    const govde = { ad: ad.trim(), konu: konu === '' ? null : konu };
    if (await calistir('yeni', () => komut('/profil/geri-bildirim-kategorileri', govde, true))) { adYaz(''); konuYaz(''); }
  };
  const etkinlikDegistir = (k: GeriBildirimKategorisi) => calistir(k.id, () => komut(
    `/profil/geri-bildirim-kategorileri/${k.id}/guncelle`, { ad: k.ad, konu: k.konu, etkin: !k.etkin, surum: k.surum }, false,
  ));

  const sutunlar: readonly Sutun<GeriBildirimKategorisi>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (k) => k.ad },
    { anahtar: 'konu', baslik: 'Konu', hucre: (k) => konuMetni(k.konu) },
    { anahtar: 'kayit', baslik: 'Kayıt', hizala: 'sag', mono: true, hucre: (k) => sayiMetni(k.kayitSayisi) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (k) => <Rozet ton={k.etkin ? 'tamam' : 'pasif'}>{k.etkin ? 'Etkin' : 'Pasif'}</Rozet> },
    ...(yazabilir ? [{
      anahtar: 'eylem', baslik: '', csv: false as const,
      hucre: (k: GeriBildirimKategorisi) => (
        <Dugme simge={k.etkin ? 'pause' : 'play'} yukleniyor={gidiyor === k.id} onClick={() => { void etkinlikDegistir(k); }}>
          {k.etkin ? 'Pasife al' : 'Etkinleştir'}
        </Dugme>
      ),
    }] : []),
  ];

  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Kategoriler alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  return (
    <div className="tc-profil">
      <Kart baslik="Kategoriler" simge="tag">
        <Tablo etiket="Kategoriler" sutunlar={sutunlar} satirlar={sorgu.data.kategoriler} satirAnahtari={(k) => k.id} bosMesaj="Kategori yok" />
        {yazabilir && (
          <form className="tc-profil-suzgec tc-gbm-kategori-formu" onSubmit={(o) => { void ekle(o); }} noValidate>
            <Girdi etiket="Yeni kategori" value={ad} maxLength={KATEGORI_AD_EN_COK} onChange={(o) => adYaz(o.target.value)} />
            <Secim etiket="Konu" value={konu} bosSecenek="İkisi de" onChange={(o) => konuYaz(o.target.value)}
              secenekler={KONULAR.map((k) => ({ deger: k, baslik: KONU_ADI[k] }))} />
            <Dugme tur="birincil" type="submit" simge="plus" disabled={ad.trim().length < KATEGORI_AD_EN_AZ} yukleniyor={gidiyor === 'yeni'}>Kategori ekle</Dugme>
          </form>
        )}
        {hata !== null && <p className="tc-profil-hata" role="alert">{hata}</p>}
      </Kart>
    </div>
  );
}
