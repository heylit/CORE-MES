import { useEffect } from 'react';
import {
  Dugme, Kart, Rozet, SayfaBasligi, SayiKarti, Tablo, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import { IzinCipi } from '../ortak/DurumCipi.tsx';
import { ekipKimlikleri } from '../rol.ts';
import type { Personel } from '../tipler.ts';
import {
  izinGunuMetni,
  bekleyenTalepler, bugunIzinde, calisiyorMu, denemede, kisininIzinleri, performansEtiketi, performansOrtalamasi, sayi, sonPerformans,
  sonrakiIzin, sayiMetni,
} from './kurallar.ts';
import {
  BagliDegil, BilgiListesi, Bos, bugun, BuyukSayi, izinBakiyesi, KisaListe, KisiBasligi,
} from './parcalar.tsx';

function ekibim(o: IkEkranOzellikleri): Personel[] {
  if (!o.ben) return [];
  const t = bugun();
  const aktif = o.depo.tur('emp').filter((p) => calisiyorMu(p, t));
  const ids = ekipKimlikleri(aktif, o.depo.tur('dept'), o.ben.id);
  return aktif.filter((p) => ids.has(p.id)).sort((a, b) => adSoyad(a).localeCompare(adSoyad(b), 'tr'));
}

// Ekip (app.js viewTeam): ücret, kimlik ve banka bilgisi gösterilmez (IK-21).
export function Ekip(o: IkEkranOzellikleri) {
  const ekip = ekibim(o);
  useSayfaKomutlari('ik-ekip', o.ben ? ekip.map((p) => ({
    anahtar: p.id, baslik: adSoyad(p), simge: 'user' as const, aciklama: p.pozisyon ?? null,
    sozcukler: [adSoyad(p), p.pozisyon ?? ''], calistir: () => { o.git('uye', p.id); },
  })) : null);
  if (!o.ben) return <BagliDegil baslik="Ekip" simge="layers" />;

  const t = bugun();
  const izinler = o.depo.tur('leave');
  const ids = new Set(ekip.map((p) => p.id));
  const bekleyen = bekleyenTalepler(izinler, ids).length;
  const sutunlar: Sutun<Personel>[] = [
    { anahtar: 'ad', baslik: 'Çalışan', hucre: (p) => <KisiHucresi personel={p} alt={p.pozisyon} />, csv: (p) => adSoyad(p) },
    {
      anahtar: 'bugun', baslik: 'Bugün', csv: false,
      hucre: (p) => {
        const iz = bugunIzinde(izinler, p.id, t);
        if (iz) return <Rozet ton="uyari">İzinde, {tarih(iz.bitis)} dönüş</Rozet>;
        if (denemede(p, t)) return <Rozet ton="bilgi">Deneme süresi {tarih(p.denemeBitis)}</Rozet>;
        return <Rozet ton="tamam">Çalışıyor</Rozet>;
      },
    },
    {
      anahtar: 'kalan', baslik: 'Kalan izin', hizala: 'sag', mono: true,
      hucre: (p) => (o.motor ? sayiMetni(izinBakiyesi(o.motor, p).kalan) : '—'),
    },
    {
      anahtar: 'sonraki', baslik: 'Sonraki izin',
      hucre: (p) => { const s = sonrakiIzin(izinler, p.id, t); return s ? `${tarih(s.baslangic)} (${s.tur})` : '—'; },
    },
    { anahtar: 'giris', baslik: 'İşe giriş', hucre: (p) => tarih(p.iseGiris), kirilmaz: true },
  ];
  return (
    <>
      <SayfaBasligi
        baslik="Ekip" simge="layers"
        alt={`${ekip.length} kişilik ekibiniz. Ücret, kimlik ve banka bilgileri bu ekranda gösterilmez.`}
      />
      <div className="tc-ikm-sayilar">
        <SayiKarti baslik="Ekip üyesi" simge="users" sayi={ekip.length} />
        <SayiKarti baslik="Bugün izinde" simge="gantt" sayi={ekip.filter((p) => bugunIzinde(izinler, p.id, t)).length} />
        <SayiKarti baslik="Onay bekleyen" simge="clock" sayi={bekleyen} ton="uyari" />
        <SayiKarti baslik="Deneme süresinde" simge="user-plus" sayi={ekip.filter((p) => denemede(p, t)).length} />
      </div>
      <Tablo
        etiket="Ekip" sutunlar={sutunlar} satirlar={ekip} satirAnahtari={(p) => p.id} satirSec={(p) => { o.git('uye', p.id); }}
        bosMesaj="Ekibinizde kayıtlı kimse yok. Personel kartlarında “Bağlı olduğu yönetici” alanı size ayarlanınca ekibiniz burada görünür."
      />
    </>
  );
}

// Ekip üyesinin sayfası (app.js viewTeamMember): iletişim, izin, son performans ve eğitim. Ekipte olmayan kişi açılmaz.
export function EkipUyesi(o: IkEkranOzellikleri) {
  const ekip = ekibim(o);
  const e = ekip.find((p) => p.id === o.kimlik) ?? null;
  const yok = !!o.ben && !e;
  useEffect(() => { if (yok) o.git('ekip'); }, [yok]);
  if (!o.ben) return <BagliDegil baslik="Ekip" simge="layers" />;
  if (!e) return null;

  const izinler = kisininIzinleri(o.depo.tur('leave'), e.id).slice(0, 8);
  const bakiye = o.motor ? izinBakiyesi(o.motor, e) : null;
  const perf = sonPerformans(o.depo.tur('perf'), e.id);
  const ort = perf ? performansOrtalamasi(perf) : null;
  const etiket = performansEtiketi(ort);
  const egitimler = o.depo.tur('train').filter((x) => (x.katilimcilar ?? []).includes(e.id)).slice(0, 5);
  return (
    <>
      <div className="tc-ikm-arac"><Dugme simge="back" onClick={() => { o.git('ekip'); }}>Ekip</Dugme></div>
      <KisiBasligi personel={e} baslik={adSoyad(e)} personeller={o.depo.tur('emp')} departmanlar={o.depo.tur('dept')} />
      <div className="tc-ikm-izgara">
        <Kart baslik="İletişim">
          <BilgiListesi satirlar={[
            ['Telefon', e.telefon], ['E-posta', e.eposta], ['İşe giriş', tarih(e.iseGiris)],
            e.denemeBitis ? ['Deneme bitişi', tarih(e.denemeBitis)] : null, ['Sözleşme', e.sozlesmeTuru],
          ]} />
        </Kart>
        <Kart baslik="Yıllık izin">
          {bakiye ? (
            <>
              <BuyukSayi deger={sayiMetni(bakiye.kalan)} birim="gün kaldı" />
              <BilgiListesi satirlar={[
                ['Hak edilen', sayiMetni(bakiye.hak)], ['Kullanılan', sayiMetni(bakiye.used + bakiye.onceki)], ['Bekleyen', sayiMetni(bakiye.pending)],
              ]} />
            </>
          ) : <Bos>Hesap motoru hazırlanıyor.</Bos>}
        </Kart>
        <Kart baslik="Son performans">
          {perf ? (
            <>
              <BuyukSayi deger={ort ? sayiMetni(ort) : '—'} birim={`/ 5, ${perf.donem ?? ''}`} />
              <Rozet ton={etiket.ton}>{etiket.etiket}</Rozet>
            </>
          ) : <Bos>Değerlendirme yok.</Bos>}
        </Kart>
        <Kart baslik="İzin geçmişi">
          {izinler.length ? (
            <KisaListe satirlar={izinler.map((l) => ({
              anahtar: l.id, baslik: l.tur, alt: `${tarih(l.baslangic)} – ${tarih(l.bitis)}, ${izinGunuMetni(l.gun)}`,
              sag: <IzinCipi durum={l.durum} />,
            }))} />
          ) : <Bos>İzin kaydı yok.</Bos>}
        </Kart>
        <Kart baslik="Eğitimler">
          {egitimler.length ? (
            <KisaListe satirlar={egitimler.map((x) => ({
              anahtar: x.id, baslik: x.ad, sag: <small className="tc-ikm-soluk">{tarih(x.tarih)}</small>,
            }))} />
          ) : <Bos>Eğitim kaydı yok.</Bos>}
        </Kart>
      </div>
    </>
  );
}
