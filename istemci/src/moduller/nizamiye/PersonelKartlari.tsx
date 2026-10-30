import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PersonelKart, PersonelKartEkleGovdesi, PersonelKartlariCevabi } from '#paylasilan/sozlesme/nizamiye.ts';
import { Dugme, DurumKutusu, Girdi, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useKomut } from './komut.ts';
import { tarihSaat } from './gorunum.ts';

// Okuyucu klavye gibi yazar ve Enter'a basar: kart alanı odaktayken okutmak formu gönderir. Kişi önce seçilir.
function KartVer({ kisiler, bitti }: { kisiler: PersonelKartlariCevabi['kisiler']; bitti: () => void }) {
  const [kisiId, kisiIdYaz] = useState('');
  const [kartNo, kartNoYaz] = useState('');
  const ekle = useKomut<PersonelKartEkleGovdesi, PersonelKart>('Kart kaydedilemedi.');
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    if (kisiId === '' || kartNo.trim() === '') return;
    ekle.mutate({ yol: '/nizamiye/personel-kartlari', govde: { kisiId: Number(kisiId), kartNo } }, {
      onSuccess: bitti,
      onError: () => kartNoYaz(''),
    });
  };
  return (
    <form className="tc-nz-panel-form" onSubmit={gonder}>
      <Secim etiket="Kişi" required bosSecenek="Listeden seç" value={kisiId} onChange={(o) => kisiIdYaz(o.target.value)}
        secenekler={kisiler.map((k) => ({ deger: String(k.id), baslik: k.sicilNo === null ? k.ad : `${k.ad} · ${k.sicilNo}` }))} />
      <Girdi etiket="Kart" required maxLength={64} autoComplete="off" value={kartNo} disabled={kisiId === ''}
        onChange={(o) => kartNoYaz(o.target.value)} ipucu="Alana tıklayıp kartı okuyucuya okutun." />
      <div className="tc-nz-panel-alt">
        <Dugme onClick={bitti}>Vazgeç</Dugme>
        <Dugme tur="birincil" type="submit" simge="plus" disabled={kisiId === '' || kartNo.trim() === ''} yukleniyor={ekle.isPending}>Kaydet</Dugme>
      </div>
    </form>
  );
}

function KartSatiri({ kart }: { kart: PersonelKart }) {
  const [sor, sorYaz] = useState(false);
  const kaldir = useKomut<{ surum: number }, { tamam: true }>('Kart kaldırılamadı.');
  return (
    <article className="tc-nz-satir tc-nz-okuyucu">
      <span className="tc-nz-satir-simge"><Simge ad="user" /></span>
      <span className="tc-nz-satir-ad">
        <strong>{kart.kisiAd ?? 'Bilinmeyen kişi'}</strong>
        <span className="tc-nz-soluk tc-nz-kartno">{`Kart ••••${kart.kartSon4}${kart.sicilNo === null ? '' : ` · Sicil ${kart.sicilNo}`}`}</span>
      </span>
      <span className="tc-nz-satir-zaman"><span className="tc-nz-soluk">{`Kayıt ${tarihSaat(kart.kaydedildi)}`}</span></span>
      {sor ? (
        <div className="tc-nz-panel-alt">
          <span className="tc-nz-uyari"><Simge ad="alert" boyut="k" /> Kişi bu kartla giremez.</span>
          <Dugme onClick={() => sorYaz(false)}>Vazgeç</Dugme>
          <Dugme tur="tehlike" simge="x" yukleniyor={kaldir.isPending}
            onClick={() => kaldir.mutate({ yol: `/nizamiye/personel-kartlari/${String(kart.id)}/kaldir`, govde: { surum: kart.surum } })}>
            Kaldır
          </Dugme>
        </div>
      ) : (
        <div className="tc-nz-panel-alt"><Dugme simge="x" onClick={() => sorYaz(true)}>Kartı kaldır</Dugme></div>
      )}
    </article>
  );
}

// 1326 (karar 1327 a): istasyonda kart + PIN ile giriş kartı buradan kişiye çevirir. Kart numarası geri gösterilmez, yalnız son dört hane.
export function PersonelKartlari() {
  const veri = useQuery({ queryKey: anahtarlar.personelKartlari, queryFn: () => api.get<PersonelKartlariCevabi>('/nizamiye/personel-kartlari') });
  const [verAcik, verAcikYaz] = useState(false);

  if (veri.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (veri.isError) return <DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} />;
  const { kartlar, kisiler } = veri.data;

  return (
    <section className="tc-nz-liste" aria-label="Personel kartları">
      <p className="tc-nz-panel-baslik"><Simge ad="user" /> Personel kartları</p>
      <p className="tc-nz-soluk">İstasyonda kişi kartını okutup kendi PIN'ini girer. Kişi başına bir kart; kart yalnız bir kişide.</p>
      {kartlar.length === 0 && !verAcik && <p className="tc-nz-bos">Kayıtlı personel kartı yok.</p>}
      {kartlar.map((k) => <KartSatiri key={k.id} kart={k} />)}
      {verAcik
        ? <KartVer kisiler={kisiler} bitti={() => verAcikYaz(false)} />
        : <div className="tc-nz-panel-alt"><Dugme tur="birincil" simge="plus" onClick={() => verAcikYaz(true)}>Kart ver</Dugme></div>}
    </section>
  );
}
