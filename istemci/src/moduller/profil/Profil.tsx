import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ProfilCevabi } from '#paylasilan/sozlesme/profil.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Dugme, Kart, ParolaPenceresi, PinPenceresi, Rozet, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GeriBildirimPenceresi } from './GeriBildirimPenceresi.tsx';
import { SaatPenceresi } from './SaatPenceresi.tsx';
import { BOS, KONU_ADI, TUR_ADI, basHarfler, kidemMetni, sayiMetni, tarihMetni, zamanMetni } from './gorunum.ts';
import './profil.css';

// İK İşlemlerim'deki ekranlar: izin talebi, mesai ayrıntısı ve iletişim güncellemesi orada yapılır (İK'nın kuralları ve onayıyla).
const IK_BENIM = '/ik-islemlerim';
const IK_IZINLERIM = '/ik-islemlerim/izinlerim';
const IK_MESAILERIM = '/ik-islemlerim/mesailerim';
// Operatör Özetim'in kendi adresi yoktur: Üretim Terminali açılınca operatörde ve amirde ilk görünüm odur (Arkon `ozetimGorunur`).
const URETIM_TERMINALI = '/uretim-terminali';

const IZIN_TONU: Record<string, RozetTonu> = { Beklemede: 'uyari', Onaylandı: 'tamam', Reddedildi: 'hata', İptal: 'pasif' };
const TUR_TONU: Record<string, RozetTonu> = { sikayet: 'hata', istek: 'bilgi', oneri: 'tamam' };

function Satirlar({ satirlar }: { satirlar: readonly [string, ReactNode][] }) {
  return (
    <dl className="tc-profil-satirlar">
      {satirlar.map(([ad, deger]) => (
        <div key={ad} className="tc-profil-satir"><dt>{ad}</dt><dd>{deger ?? BOS}</dd></div>
      ))}
    </dl>
  );
}

function Bos({ children }: { children: ReactNode }) {
  return <p className="tc-profil-bos">{children}</p>;
}

function Bag({ to, simge, children }: { to: string; simge: Parameters<typeof Simge>[0]['ad']; children: ReactNode }) {
  return <Link className="tc-profil-bag" to={to}><Simge ad={simge} boyut="k" />{children}</Link>;
}

function Ust({ veri }: { veri: ProfilCevabi }) {
  const p = veri.personel;
  const kidem = kidemMetni(p?.iseGiris ?? null, tesisGunu(new Date()));
  const alt = [p?.pozisyon ?? veri.kisi.gorev, p?.departman, p?.yonetici ? `Yönetici: ${p.yonetici}` : null, kidem].filter(Boolean);
  return (
    <header className="tc-profil-ust">
      <span className="tc-profil-avatar" aria-hidden="true">{basHarfler(veri.kisi.ad)}</span>
      <div className="tc-profil-ust-metin">
        <h2 className="tc-profil-merhaba">Merhaba, {veri.kisi.ad.split(/\s+/)[0]}</h2>
        {alt.length > 0 && <p className="tc-profil-alt">{alt.join(' · ')}</p>}
      </div>
    </header>
  );
}

function IzinKarti({ veri }: { veri: ProfilCevabi }) {
  const i = veri.izin;
  return (
    <Kart baslik="Yıllık izin">
      {i === null ? <Bos>İK kaydınız bağlanınca izin bakiyeniz burada görünür.</Bos> : (
        <>
          <p className="tc-profil-buyuk"><strong className="mono">{sayiMetni(i.kalanGun)}</strong> <span>gün kaldı</span></p>
          <Satirlar satirlar={[
            ['Hak edilen', sayiMetni(i.hakGun)],
            ['Kullanılan', sayiMetni(i.kullanilanGun)],
            ['Onay bekleyen', sayiMetni(i.bekleyenGun)],
            ['Sonraki hak ediş', i.sonrakiHakTarihi === null ? BOS : `${tarihMetni(i.sonrakiHakTarihi)}: ${sayiMetni(i.sonrakiHakGun)} gün`],
          ]} />
        </>
      )}
      <div className="tc-profil-eylemler">
        <Bag to={IK_IZINLERIM} simge="plus">İzin talep et</Bag>
        <Bag to={IK_IZINLERIM} simge="flag">İzinlerim</Bag>
      </div>
    </Kart>
  );
}

function IzinlerKarti({ veri }: { veri: ProfilCevabi }) {
  const liste = veri.izinler;
  return (
    <Kart baslik="İzin geçmişim">
      {liste === null || liste.length === 0 ? <Bos>Son bir yılda izin kaydınız yok.</Bos> : (
        <ul className="tc-profil-liste">
          {liste.slice(0, 6).map((z) => (
            <li key={`${z.tur}-${z.baslangic}-${z.bitis}`} className="tc-profil-liste-oge">
              <div>
                <strong>{z.tur}</strong>
                <span className="tc-profil-soluk">{tarihMetni(z.baslangic)} – {tarihMetni(z.bitis)}{z.gun === null ? '' : `, ${sayiMetni(z.gun)} gün`}</span>
              </div>
              <Rozet ton={IZIN_TONU[z.durum] ?? 'bilgi'}>{z.durum}</Rozet>
            </li>
          ))}
        </ul>
      )}
    </Kart>
  );
}

function MesaiKarti({ veri }: { veri: ProfilCevabi }) {
  const m = veri.fazlaMesai;
  const terminalVar = useOturum().data?.islemler.includes('sayfa.uretim-terminali') ?? false;
  return (
    <Kart baslik="Ek mesailerim">
      {m === null ? <Bos>İK kaydınız bağlanınca ek mesaileriniz burada görünür.</Bos> : (
        <>
          <p className="tc-profil-buyuk">
            <strong className="mono">{sayiMetni(m.toplamSaat)}</strong> <span>saat bu yıl{m.yillikSinirSaat === null ? '' : ` / ${sayiMetni(m.yillikSinirSaat)} sınır`}</span>
          </p>
          {m.satirlar.length === 0 ? <Bos>Bu yıl ek mesai kaydınız yok.</Bos> : (
            <ul className="tc-profil-liste">
              {m.satirlar.slice(0, 5).map((s, i) => (
                <li key={`${s.tarih}-${s.tur}-${i}`} className="tc-profil-liste-oge">
                  <div>
                    <strong>{tarihMetni(s.tarih)}</strong>
                    <span className="tc-profil-soluk">{s.tur}{s.saat === null ? '' : `, ${sayiMetni(s.saat)} saat`}</span>
                  </div>
                  {s.onay !== null && <Rozet ton={s.onay === 'Onaylandı' ? 'tamam' : 'uyari'}>{s.onay}</Rozet>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="tc-profil-eylemler">
        <Bag to={IK_MESAILERIM} simge="clock">Mesai geçmişim</Bag>
        {terminalVar && <Bag to={URETIM_TERMINALI} simge="gauge">Özetim</Bag>}
      </div>
    </Kart>
  );
}

function BilgiKarti({ veri }: { veri: ProfilCevabi }) {
  const p = veri.personel;
  return (
    <Kart baslik="Kişisel bilgilerim" baslikEki={<span className="tc-profil-soluk">İK'nın girdiği</span>}>
      {p === null ? <Bos>Personel kaydınız henüz hesabınıza bağlı değil. İK'ya bildirin.</Bos> : (
        <Satirlar satirlar={[
          ['Ad soyad', p.ad],
          ['Sicil no', p.sicilNo],
          ['Görev', p.pozisyon ?? veri.kisi.gorev],
          ['Bölüm', p.departman],
          ['Yönetici', p.yonetici],
          ['İşe giriş', p.iseGiris === null ? null : tarihMetni(p.iseGiris)],
          ['Çalışma şekli', p.calismaSekli],
        ]} />
      )}
    </Kart>
  );
}

function IletisimKarti({ veri }: { veri: ProfilCevabi }) {
  const p = veri.personel;
  if (p === null) return null;
  const acil = [p.acilKisi, p.acilYakinlik ? `(${p.acilYakinlik})` : null, p.acilTelefon].filter(Boolean).join(' ');
  return (
    <Kart baslik="İletişim bilgilerim">
      <Satirlar satirlar={[['Telefon', p.telefon], ['E-posta', p.eposta], ['Adres', p.adres], ['Acil durumda', acil || null]]} />
      <div className="tc-profil-eylemler"><Bag to={IK_BENIM} simge="edit">Güncelle</Bag></div>
    </Kart>
  );
}

function HesapKarti() {
  const [pencere, pencereYaz] = useState<'parola' | 'pin' | 'saat' | null>(null);
  return (
    <Kart baslik="Hesap ve güvenlik">
      <Satirlar satirlar={[['Parola', '••••••••'], ['PIN', 'Terminal girişi için; ilk PIN\'i yöneticiniz verir, sonra kendiniz değiştirirsiniz']]} />
      <div className="tc-profil-eylemler">
        <Dugme simge="lock" onClick={() => pencereYaz('parola')}>Parolamı değiştir</Dugme>
        <Dugme simge="lock" onClick={() => pencereYaz('pin')}>PIN'imi değiştir</Dugme>
        <Dugme simge="clock" onClick={() => pencereYaz('saat')}>Akıllı saatimi eşleştir</Dugme>
        <Bag to="/profil/bildirimler" simge="bell">Bildirimlerim</Bag>
      </div>
      {pencere === 'parola' && <ParolaPenceresi kapat={() => pencereYaz(null)} />}
      {pencere === 'pin' && <PinPenceresi kapat={() => pencereYaz(null)} />}
      {pencere === 'saat' && <SaatPenceresi kapat={() => pencereYaz(null)} />}
    </Kart>
  );
}

function GeriBildirimKarti({ veri }: { veri: ProfilCevabi }) {
  const [acik, acikYaz] = useState(false);
  return (
    <Kart
      baslik="Şikayet, istek ve önerilerim"
      sag={<Dugme tur="birincil" simge="plus" onClick={() => acikYaz(true)}>Yeni yaz</Dugme>}
    >
      {veri.geriBildirimler.length === 0 ? <Bos>Henüz bir şey yazmadınız. Üst çubuktaki kalem düğmesinden de yazabilirsiniz.</Bos> : (
        <ul className="tc-profil-liste">
          {veri.geriBildirimler.map((g) => (
            <li key={g.id} className="tc-profil-liste-oge tc-profil-gb">
              <div className="tc-profil-gb-ust">
                <Rozet ton={TUR_TONU[g.tur] ?? 'bilgi'}>{TUR_ADI[g.tur]}</Rozet>
                <span className="tc-profil-soluk">{KONU_ADI[g.konu]} · {zamanMetni(g.gonderildi)}</span>
              </div>
              <p className="tc-profil-gb-metin">{g.metin}</p>
            </li>
          ))}
        </ul>
      )}
      {veri.geriBildirimOkur && (
        <div className="tc-profil-eylemler"><Bag to="/profil/gelenler" simge="eye">Gelen şikayet, istek ve öneriler</Bag></div>
      )}
      {acik && <GeriBildirimPenceresi kapat={() => acikYaz(false)} />}
    </Kart>
  );
}

// Kişinin kendi sayfası: herkese açık (menü sayfası değil, üst çubuktaki addan açılır); sunucu yalnız oturumdaki kişiyi okur.
export function Profil() {
  const sorgu = useQuery({ queryKey: anahtarlar.profil, queryFn: () => api.get<ProfilCevabi>('/profil') });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />;
  const veri = sorgu.data;
  return (
    <div className="tc-profil">
      <Ust veri={veri} />
      <div className="tc-profil-izgara">
        <IzinKarti veri={veri} />
        <MesaiKarti veri={veri} />
        <IzinlerKarti veri={veri} />
        <BilgiKarti veri={veri} />
        <IletisimKarti veri={veri} />
        <HesapKarti />
      </div>
      <GeriBildirimKarti veri={veri} />
    </div>
  );
}
