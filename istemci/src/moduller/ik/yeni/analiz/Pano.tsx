import { useMemo } from 'react';
import { DurumKutusu, Dugme, Kart, Rozet, SayiKarti } from '../../../../ortak/arayuz/index.ts';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri, IkGorunum } from '../gorunumler.ts';
import { ikSabitleri, MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Izin } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { analizMotoru, analizVerisi, bugunGece } from './baglam.ts';
import { Cubuklar, YakaBolunmesi, YakaGostergesi } from './grafikler.tsx';
import { acikGorevler, gorevler, goreliGun, gunEkle, gunMetni, panoOzeti, sayiOku, sayiYaz, tarihOku, uzunTarih } from './kurallar.ts';
import { useYazma } from './yaz.ts';
import './analiz.css';

const OLAY_SINIRI = 12;
const IZIN_SINIRI = 6;

export function Pano(o: IkEkranOzellikleri) {
  const { depo, yetki, motor, git } = o;
  const komut = useIkKomutu();
  const yaz = useYazma();
  const bugun = useMemo(bugunGece, []);
  const sabit = ikSabitleri();
  const m = useMemo(() => (motor && sabit ? analizMotoru(motor, sabit, bugun) : null), [motor, sabit, bugun]);
  const v = useMemo(() => analizVerisi(depo), [depo]);
  const ozet = useMemo(() => (m ? panoOzeti(v, m, bugun) : null), [v, m, bugun]);
  const isler = useMemo(() => (m ? acikGorevler(gorevler(v, m, bugun)) : []), [v, m, bugun]);

  const personelEkle = yetki.personelYaz ? { etiket: 'Personel ekle', simge: 'user-plus' as const, yap: () => { git('personel'); } } : undefined;
  const izinGir = yetki.izinYaz ? [{ anahtar: 'izin', baslik: 'İzin talebi', simge: 'flag' as const, sec: () => { git('izin'); } }] : [];
  // Karar yetkisi: alanı yazabilen ya da izin onaycısı (karar ucu); ekran yalnız gizler.
  const karar = yetki.izinYaz || yetki.izinOnay;

  useSayfaKomutlari('ik-pano', [
    { anahtar: 'gorev', baslik: 'Yapılacakları aç', simge: 'bell', aciklama: isler.length ? `${isler.length} iş bekliyor` : null, sozcukler: ['yapılacak', 'iş', 'görev', 'onay'], calistir: () => { git('gorev'); } },
    ...(personelEkle ? [{ anahtar: 'personel', baslik: 'Personel ekle', simge: 'user-plus' as const, aciklama: null, sozcukler: ['yeni', 'çalışan', 'personel'], calistir: personelEkle.yap }] : []),
  ]);

  if (!depo.tur('emp').length) {
    return (
      <div className="tc-ikr">
        <SayfaBasligi baslik="Pano" simge="gauge" />
        <Kart>
          <div className="tc-ikr-karsilama">
            <h3>Personel dosyalarınız burada toplanacak</h3>
            <p>Çalışan bilgilerini, izinleri, bordroyu, eğitimleri, performansı ve işe alımı tek yerden takip edin. İlk personeli ekleyerek başlayın.</p>
            {yetki.personelYaz && (
              <div className="tc-ikr-dugmeler">
                <Dugme tur="birincil" simge="user-plus" onClick={() => { git('personel'); }}>Personel ekle</Dugme>
                <Dugme simge="upload" onClick={() => { git('personel'); }}>Excel’den aktar</Dugme>
              </div>
            )}
            <ul>
              <li><b>Özlük dosyası</b>Kimlik, iletişim, sözleşme, ücret ve belgeler</li>
              <li><b>İzin ve devam</b>Kanuni yıllık izin hak edişi, talepler, fazla mesai sınırı</li>
              <li><b>Bordro tahmini</b>SGK, gelir ve damga vergisiyle net ücret ve işveren maliyeti</li>
              <li><b>Gelişim ve işe alım</b>Değerlendirmeler, eğitimler, aday süreci</li>
            </ul>
          </div>
        </Kart>
      </div>
    );
  }

  const baslik = (
    <SayfaBasligi
      baslik="Pano" simge="gauge" alt={`${uzunTarih(gunMetni(bugun))} itibarıyla şirketin insan kaynakları durumu.`}
      {...(personelEkle ? { birincil: personelEkle } : {})} eylemler={izinGir}
    />
  );
  if (!ozet) return <div className="tc-ikr">{baslik}<DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} /></div>;

  const ad = (id: string | undefined) => adSoyad(depo.al(id) as Parameters<typeof adSoyad>[0]);
  const kararVer = (l: Izin, durum: 'Onaylandı' | 'Reddedildi') =>
    yaz(() => komut.kaydet({ ...l, durum, karar: gunMetni(bugunGece()) }), durum === 'Onaylandı' ? 'İzin onaylandı.' : 'İzin reddedildi.');
  const gec = isler.filter((x) => x.kova === 'late').length;
  const bugunku = isler.filter((x) => x.kova === 'today').length;
  const ilkIs = [...isler].sort((a, b) => (a.son ?? '9').localeCompare(b.son ?? '9'))[0];

  return (
    <div className="tc-ikr">
      {baslik}
      {isler.length > 0 && (
        <button type="button" className={`tc-ikr-serit${gec ? ' tc-ikr-serit-gec' : ''}`} onClick={() => { git('gorev'); }}>
          <span>
            <b>{isler.length} iş bekliyor</b>{gec ? `, ${gec} gecikmiş` : ''}{bugunku ? `, ${bugunku} bugün` : ''}. {ilkIs?.baslik}{isler.length > 1 ? ' ve diğerleri' : ''}
          </span>
          <span className="tc-ikr-serit-git">Yapılacaklar</span>
        </button>
      )}
      <div className="tc-ikr-sayilar">
        <SayiKarti baslik="Aktif çalışan" simge="users" sayi={ozet.aktif} />
        <SayiKarti baslik="Bugün izinde" simge="flag" sayi={ozet.bugunIzinde.length} />
        <SayiKarti baslik="Onay bekleyen izin" simge="clock" sayi={ozet.bekleyen.length} ton="uyari" />
        <SayiKarti baslik="Bu ay giriş / çıkış" simge="user-plus" metin={`${ozet.giris} / ${ozet.cikis}`} />
        <SayiKarti baslik="Açık kadro" simge="id-card" sayi={ozet.acikKadro} />
        <SayiKarti baslik="Son 12 ay devir oranı" simge="rotate" metin={`%${sayiYaz(Math.round(ozet.devirOrani * 10) / 10)}`} />
      </div>
      <div className="tc-ikr-izgara">
        <Kart baslik="Önümüzdeki 30 gün">
          {ozet.olaylar.length ? (
            <>
              <ul className="tc-ikr-liste">
                {ozet.olaylar.slice(0, OLAY_SINIRI).map((x, i) => (
                  <li key={`${x.tur}-${i}`}>
                    <span className="tc-ikr-ne-zaman"><b>{tarih(gunMetni(x.tarih)).slice(0, 5)}</b>{goreliGun(x.tarih, bugun)}</span>
                    <span className="tc-ikr-buyu">
                      {x.hedef?.ad !== undefined
                        ? <button type="button" className="tc-ikr-bag" onClick={() => { git(x.hedef!.gorunum as IkGorunum, x.hedef!.kimlik); }}>{x.hedef.ad}</button>
                        : null}
                      <small>{x.aciklama}</small>
                    </span>
                    <Rozet ton={x.uyari ? 'uyari' : x.tur === 'Doğum günü' || x.tur === 'İş yıldönümü' ? 'bilgi' : 'pasif'}>{x.tur}</Rozet>
                  </li>
                ))}
              </ul>
              {ozet.olaylar.length > OLAY_SINIRI && <p className="tc-ikr-not">ve {ozet.olaylar.length - OLAY_SINIRI} olay daha</p>}
            </>
          ) : <DurumKutusu durum="bos" mesaj="Yaklaşan olay yok. Doğum günü, yıldönümü, deneme ve sözleşme bitişleri burada listelenir." />}
        </Kart>
        <div className="tc-ikr-yigin">
          <Kart baslik="Onay bekleyen izinler" sag={ozet.bekleyen.length ? <Dugme onClick={() => { git('izin'); }}>Tümü</Dugme> : undefined}>
            {ozet.bekleyen.length ? (
              <ul className="tc-ikr-liste">
                {ozet.bekleyen.slice(0, IZIN_SINIRI).map((l) => (
                  <li key={l.id}>
                    <span className="tc-ikr-buyu">
                      <button type="button" className="tc-ikr-bag" onClick={() => { if (l.empId) git('calisan', l.empId); }}>{ad(l.empId)}</button>
                      <small>{l.tur}, {tarih(l.baslangic)} – {tarih(l.bitis)}, {sayiYaz(sayiOku(l.gun))} gün</small>
                    </span>
                    {karar && (
                      <span className="tc-ikr-dugmeler">
                        <Dugme disabled={komut.calisiyor} onClick={() => { void kararVer(l, 'Reddedildi'); }}>Reddet</Dugme>
                        <Dugme tur="birincil" disabled={komut.calisiyor} onClick={() => { void kararVer(l, 'Onaylandı'); }}>Onayla</Dugme>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p className="tc-ikr-soluk">Bekleyen talep yok.</p>}
          </Kart>
          <Kart baslik="Bugün izinde olanlar">
            {ozet.bugunIzinde.length ? (
              <ul className="tc-ikr-liste">
                {ozet.bugunIzinde.map((l) => {
                  const bitis = tarihOku(l.bitis);
                  return (
                    <li key={l.id}>
                      <button type="button" className="tc-ikr-bag tc-ikr-kisi-bag" onClick={() => { if (l.empId) git('calisan', l.empId); }}>
                        <KisiHucresi personel={depo.al(l.empId) as Parameters<typeof KisiHucresi>[0]['personel']} alt={`${l.tur ?? ''}, dönüş ${bitis ? uzunTarih(gunMetni(gunEkle(bitis, 1))) : '—'}`} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="tc-ikr-soluk">Bugün izinde kimse yok.</p>}
          </Kart>
        </div>
      </div>
      <div className="tc-ikr-izgara">
        <Kart baslik="Dikkat gerektirenler">
          {ozet.uyarilar.length ? (
            <ul className="tc-ikr-liste tc-ikr-uyarilar">
              {ozet.uyarilar.map((u) => (
                <li key={u.baslik}>
                  <span className={`tc-ikr-isaret${u.kotu ? ' tc-ikr-isaret-kotu' : ''}`} aria-hidden="true" />
                  <span className="tc-ikr-buyu"><b>{u.baslik}</b><small>{u.ayrinti}</small></span>
                  <Dugme onClick={() => { git(u.gorunum as IkGorunum); }}>Göster</Dugme>
                </li>
              ))}
            </ul>
          ) : <p className="tc-ikr-soluk">Şu an dikkat gerektiren bir durum yok.</p>}
        </Kart>
        <Kart baslik="Departman ve yaka dağılımı">
          <Cubuklar satirlar={ozet.departmanlar} />
          {ozet.aktif > 0 && (
            <div className="tc-ikr-yaka-kutu">
              <YakaBolunmesi beyaz={ozet.yaka.beyaz} mavi={ozet.yaka.mavi} />
              <YakaGostergesi beyaz={ozet.yaka.beyaz} mavi={ozet.yaka.mavi} />
            </div>
          )}
        </Kart>
      </div>
    </div>
  );
}
