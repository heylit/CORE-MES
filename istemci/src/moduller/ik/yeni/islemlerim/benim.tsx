import { useState } from 'react';
import { DurumKutusu, Dugme, Kart, Rozet } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, ayAdi, paraKisa, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { IzinCipi } from '../ortak/DurumCipi.tsx';
import { ekipKimlikleri } from '../rol.ts';
import { CalismaBelgesi, BordroPusulasi } from './belgeler.tsx';
import { IletisimPenceresi } from './iletisim.tsx';
import { IzinTalebi } from './izin-talebi.tsx';
import { OnizlemeSecimi } from './onizleme-secimi.tsx';
import {
  izinGunuMetni,
  bekleyenTalepler, bordroAlani, bugunIzinde, calisiyorMu, gunMetni, kesinBordrolar, kisininEgitimleri, kisininIzinleri, sayi, sayiMetni,
} from './kurallar.ts';
import {
  BagliDegil, BilgiListesi, Bos, bugun, BuyukSayi, izinBakiyesi, KartAlti, KisaListe, KisiBasligi, useEkipAcik,
} from './parcalar.tsx';

type Pencere = 'izin' | 'iletisim' | 'belge' | 'pusula' | 'onizleme' | null;

// Benim sayfam (app.js viewMe): kişinin özeti; yöneticide ekibin durumu. Zimmet kutusu Soru 244 a ile kalktı.
export function BenimSayfam(o: IkEkranOzellikleri) {
  const [pencere, pencereYaz] = useState<Pencere>(null);
  const e = o.ben;
  const yonetici = useEkipAcik(o) && o.rol === 'yonetici';
  // "Başka bir gözle görüntüle" İK'nındır; bugünkü ekrandaki gibi "Görünüm" düğmesiyle açılır, önizleme bu sayfanın (İK İşlemlerim) içindedir.
  const onizletebilir = o.yetki.oku && o.onizleme === null;
  useSayfaKomutlari('ik-benim', e ? [
    ...(o.yetki.izinTalep ? [{ anahtar: 'izin', baslik: 'İzin talep et', simge: 'plus' as const, aciklama: null, sozcukler: ['izin', 'talep'], calistir: () => { pencereYaz('izin'); } }] : []),
    { anahtar: 'belge', baslik: 'Çalışma belgesi', simge: 'printer' as const, aciklama: null, sozcukler: ['belge', 'yazdır'], calistir: () => { pencereYaz('belge'); } },
  ] : null);
  const onizlemePenceresi = onizletebilir && pencere === 'onizleme' && (
    <OnizlemeSecimi acik kapat={() => { pencereYaz(null); }} depo={o.depo} ac={(x) => { o.onizlemeAc(x); o.git('benim'); }} />
  );
  const onizlemeDugmesi = onizletebilir && (
    <div className="tc-ikm-arac tc-ikm-arac-sag">
      <Dugme simge="eye" onClick={() => { pencereYaz('onizleme'); }}>Görünüm</Dugme>
    </div>
  );
  if (!e) return <>{onizlemeDugmesi}<BagliDegil baslik="Benim sayfam" simge="user" />{onizlemePenceresi}</>;

  const t = bugun();
  const personeller = o.depo.tur('emp');
  const departmanlar = o.depo.tur('dept');
  const izinler = o.depo.tur('leave');
  const kendi = kisininIzinleri(izinler, e.id);
  const sonBordro = kesinBordrolar(o.depo.tur('pay'), e.id)[0] ?? null;
  const egitimler = kisininEgitimleri(o.depo.tur('train'), e.id);
  const bakiye = o.motor ? izinBakiyesi(o.motor, e) : null;
  const ekip = yonetici ? ekipKimlikleri(personeller.filter((p) => calisiyorMu(p, t)), departmanlar, e.id) : new Set<string>();
  const bekleyen = bekleyenTalepler(izinler, ekip);
  const izindeOlanlar = [...ekip].filter((id) => bugunIzinde(izinler, id, t)).map((id) => adSoyad(personeller.find((p) => p.id === id)));
  const yazabilir = o.yetki.herhangiYazma;

  return (
    <>
      {onizlemeDugmesi}
      <KisiBasligi personel={e} baslik={`Merhaba, ${e.ad ?? ''}`} personeller={personeller} departmanlar={departmanlar} />
      <div className="tc-ikm-izgara">
        {yonetici && (
          <Kart baslik="Ekibim">
            <BuyukSayi deger={String(ekip.size)} birim="kişi" />
            <p className="tc-ikm-kucuk">{izindeOlanlar.length ? `Bugün izinde: ${izindeOlanlar.join(', ')}` : 'Bugün izinde olan yok.'}</p>
            <KartAlti>
              {bekleyen.length
                ? <Dugme tur="birincil" onClick={() => { o.git('onay'); }}>{bekleyen.length} talep onay bekliyor</Dugme>
                : <span className="tc-ikm-soluk">Bekleyen onay yok.</span>}
              <Dugme onClick={() => { o.git('ekip'); }}>Ekibi gör</Dugme>
            </KartAlti>
          </Kart>
        )}
        <Kart baslik="Yıllık izin">
          {!bakiye ? <DurumKutusu durum="yukleniyor" mesaj="Hesap motoru hazırlanıyor" /> : (
            <>
              <BuyukSayi deger={sayiMetni(bakiye.kalan)} birim="gün kaldı" ton={bakiye.kalan < 0 ? 'hata' : undefined} />
              <BilgiListesi satirlar={[
                ['Hak edilen', sayiMetni(bakiye.hak)], ['Kullanılan', sayiMetni(bakiye.used + bakiye.onceki)], ['Onay bekleyen', sayiMetni(bakiye.pending)],
                bakiye.next ? ['Sonraki hak ediş', `${tarih(gunMetni(bakiye.next))}: ${bakiye.nextDays} gün`] : null,
              ]} />
            </>
          )}
          <KartAlti>
            {o.yetki.izinTalep && <Dugme tur="birincil" simge="plus" onClick={() => { pencereYaz('izin'); }}>İzin talep et</Dugme>}
            <Dugme onClick={() => { o.git('izinlerim'); }}>İzinlerim</Dugme>
          </KartAlti>
        </Kart>
        <Kart baslik="Son taleplerim">
          {kendi.length ? (
            <KisaListe satirlar={kendi.slice(0, 4).map((l) => ({
              anahtar: l.id, baslik: l.tur, alt: `${tarih(l.baslangic)} – ${tarih(l.bitis)}, ${izinGunuMetni(l.gun)}`,
              sag: <IzinCipi durum={l.durum} />,
            }))} />
          ) : <Bos>Henüz izin talebiniz yok.</Bos>}
        </Kart>
        <Kart baslik="Bordro">
          {sonBordro ? (
            <>
              <BuyukSayi deger={paraKisa(bordroAlani(sonBordro, 'net'))} birim={`${ayAdi(sonBordro.donem ?? '')} neti`} />
              <p className="tc-ikm-kucuk tc-ikm-soluk">Toplam brüt {paraKisa(bordroAlani(sonBordro, 'toplam'))}</p>
              <KartAlti>
                <Dugme simge="printer" onClick={() => { pencereYaz('pusula'); }}>Pusulayı aç</Dugme>
                <Dugme onClick={() => { o.git('bordrolarim'); }}>Tüm bordrolarım</Dugme>
              </KartAlti>
            </>
          ) : <Bos>Kesinleşmiş bordronuz henüz yok.</Bos>}
        </Kart>
        <Kart baslik="Eğitimlerim">
          {egitimler.length ? (
            <KisaListe satirlar={egitimler.slice(0, 4).map((x) => ({
              anahtar: x.id, baslik: x.ad, alt: `${tarih(x.tarih)}${x.sure ? `, ${sayiMetni(sayi(x.sure))} saat` : ''}`,
              sag: x.durum === 'Tamamlandı' ? <Rozet ton="tamam">Tamamlandı</Rozet> : <Rozet ton="bilgi">{x.durum || 'Planlandı'}</Rozet>,
            }))} />
          ) : <Bos>Kayıtlı eğitiminiz yok.</Bos>}
        </Kart>
        <Kart baslik="İletişim bilgilerim">
          <BilgiListesi satirlar={[
            ['Telefon', e.telefon], ['E-posta', e.eposta], ['Adres', e.adres],
            ['Acil durumda', [e.acilKisi, e.acilYakinlik, e.acilTelefon].filter(Boolean).join(', ')],
          ]} />
          {yazabilir && <KartAlti><Dugme simge="edit" onClick={() => { pencereYaz('iletisim'); }}>Güncelle</Dugme></KartAlti>}
        </Kart>
        <Kart baslik="Belgelerim">
          <p className="tc-ikm-kucuk">Çalışma belgenizi yazdırabilir veya bilgisayarınıza kaydedebilirsiniz.</p>
          <KartAlti><Dugme simge="printer" onClick={() => { pencereYaz('belge'); }}>Çalışma belgesi</Dugme></KartAlti>
        </Kart>
      </div>
      {o.yetki.izinTalep && pencere === 'izin' && <IzinTalebi acik kapat={() => { pencereYaz(null); }} personel={e} kendiIzinleri={kendi} motor={o.motor} />}
      {yazabilir && pencere === 'iletisim' && <IletisimPenceresi acik kapat={() => { pencereYaz(null); }} personel={e} />}
      {onizlemePenceresi}
      {pencere === 'belge' && <CalismaBelgesi personel={e} departmanlar={departmanlar} kapat={() => { pencereYaz(null); }} />}
      {pencere === 'pusula' && sonBordro && (
        <BordroPusulasi personel={e} bordro={sonBordro} departmanlar={departmanlar} kapat={() => { pencereYaz(null); }} />
      )}
    </>
  );
}
