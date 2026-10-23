import { useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { DurumKutusu } from '../../../../ortak/arayuz/DurumKutusu.tsx';
import type { MenuOgesi } from '../../../../ortak/arayuz/Menu.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { Rozet } from '../../../../ortak/arayuz/Rozet.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import { Sekmeler, type Sekme } from '../../../../ortak/arayuz/Sekmeler.tsx';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { DurumCipi } from '../ortak/DurumCipi.tsx';
import type { Personel } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import type { PersonelBolumu } from './alanlar.ts';
import { IzinFormu } from './baska-parcalar.tsx';
import { BelgeMenusu } from './BelgeMenusu.tsx';
import { adSoyadMetni, aktifMi, bugun, DURUM_TONU, personelDurumu } from './kurallar.ts';
import { PersonelFormPenceresi } from './PersonelFormu.tsx';
import {
  AyrilisSekmesi, BelgeSekmesi, BolumSekmesi, CizelgeSekmesi, DevamSekmesi, GelisimSekmesi, IzinSekmesi, NotSekmesi, OzetSekmesi, UcretSekmesi,
  type SekmeOzellikleri,
} from './sekmeler.tsx';
import './personel.css';

export type CalisanSekmesi = 'ozet' | 'kimlik' | 'iletisim' | 'is' | 'ucret' | 'izin' | 'devam' | 'belge' | 'gelisim' | 'ayrilis' | 'gecmis' | 'not';

// Zimmet sekmesi yoktur: zimmetin sahibi İdari İşler'dir (karar 244 a).
const SEKMELER: readonly Sekme<CalisanSekmesi>[] = [
  { anahtar: 'ozet', baslik: 'Özet' }, { anahtar: 'kimlik', baslik: 'Kimlik' }, { anahtar: 'iletisim', baslik: 'İletişim' },
  { anahtar: 'is', baslik: 'İş bilgileri' }, { anahtar: 'ucret', baslik: 'Ücret' }, { anahtar: 'izin', baslik: 'İzinler' },
  { anahtar: 'devam', baslik: 'Devam ve mesai' }, { anahtar: 'belge', baslik: 'Özlük belgeleri' }, { anahtar: 'gelisim', baslik: 'Performans ve eğitim' },
  { anahtar: 'ayrilis', baslik: 'Ayrılış' }, { anahtar: 'gecmis', baslik: 'Zaman çizelgesi' }, { anahtar: 'not', baslik: 'Notlar' },
];

// Kişi sayfası (özlük dosyası): başlık, işlemler ve on iki sekme. Yazma düğmeleri yetkiye göre gizlenir; denetim uçtadır.
export function Calisan(o: IkEkranOzellikleri) {
  const { depo, yetki, kimlik, git } = o;
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [sekme, sekmeYaz] = useState<CalisanSekmesi>('ozet');
  const [sonKimlik, sonKimlikYaz] = useState(kimlik);
  const [bolum, bolumYaz] = useState<PersonelBolumu | null>(null);
  const [izinAcik, izinAcikYaz] = useState(false);
  const [belgeAcik, belgeAcikYaz] = useState(false);
  const [siliyor, siliyorYaz] = useState(false);
  const gun = bugun();

  // Başka kişiye geçilince Özet'ten başlanır (bugünkü davranış).
  if (kimlik !== sonKimlik) { sonKimlikYaz(kimlik); sekmeYaz('ozet'); }

  const kayit = depo.al(kimlik);
  const p = kayit && kayit.kind === 'emp' ? kayit as Personel : null;
  useSayfaKomutlari('ik-calisan', p ? SEKMELER.map((s) => ({
    anahtar: `sekme-${s.anahtar}`, baslik: `${adSoyadMetni(p)}: ${s.baslik}`, simge: 'user' as const, aciklama: null, sozcukler: [s.baslik], calistir: () => { sekmeYaz(s.anahtar); },
  })) : null);

  const geri = <Dugme simge="chev-left" onClick={() => { git('personel'); }}>Personel listesi</Dugme>;
  if (!p) return <div className="tc-ikp">{geri}<DurumKutusu durum="bos" mesaj="Kayıt bulunamadı. Bu personel silinmiş olabilir." /></div>;

  const departman = p.departmanId ? depo.tur('dept').find((d) => d.id === p.departmanId)?.ad : undefined;
  const bagli = () => [...depo.tur('leave'), ...depo.tur('att'), ...depo.tur('perf')].filter((r) => r.empId === p.id);

  // Personel ve bağlı izin, mesai ve performans kayıtları iptal edilir (sunucuda silme yok, IK-18); "Geri al" hepsini geri yazar.
  const sil = async () => {
    siliyorYaz(false);
    const kayitlar = [...bagli(), p];
    try {
      for (const r of kayitlar) await komut.iptal(r.id);
    } catch {
      bildir('hata', 'Personel silinemedi; silinen bağlı kayıtlar için sayfayı yenileyip kontrol edin.');
      return;
    }
    git('personel');
    bildir('tamam', `${adSoyadMetni(p)} silindi.`, {
      eylem: { etiket: 'Geri al', yap: () => { void komut.topluKaydet(kayitlar).then(() => { bildir('tamam', 'Personel ve bağlı kayıtları geri getirildi.'); }, () => { bildir('hata', 'Kayıtlar geri getirilemedi.'); }); } },
    });
  };

  // Bugünkü ekranda salt okunur kullanıcı bu işlemleri görmez.
  const eylemler: MenuOgesi[] = [
    ...(yetki.herhangiYazma ? [{ anahtar: 'belge', baslik: 'Belge oluştur', simge: 'file' as const, sec: () => { belgeAcikYaz(true); } }] : []),
    ...(yetki.personelYaz && aktifMi(p, gun) && !p.cikisTarihi ? [{ anahtar: 'cikis', baslik: 'İşten çıkış', simge: 'logout' as const, sec: () => { bolumYaz('Ayrılış'); } }] : []),
    ...(yetki.personelYaz ? [{ anahtar: 'sil', baslik: 'Sil', simge: 'trash' as const, ton: 'tehlike' as const, sec: () => { siliyorYaz(true); } }] : []),
  ];

  const so: SekmeOzellikleri = { ...o, p, duzenle: (b) => { bolumYaz(b); }, sekmeAc: sekmeYaz };
  return (
    <div className="tc-ikp">
      {geri}
      <SayfaBasligi
        baslik={adSoyadMetni(p)} simge="id-card" eylemler={eylemler}
        alt={(
          <span className="tc-ikp-kimlik">
            <span>{p.pozisyon || 'Pozisyon girilmedi'}</span>
            {departman && <Rozet ton="pasif">{departman}</Rozet>}
            <span className="tc-ikp-sicil">{`Sicil ${p.sicilNo || '—'}`}</span>
            <DurumCipi metin={personelDurumu(p, depo.tur('leave'), gun)} ton={DURUM_TONU[personelDurumu(p, depo.tur('leave'), gun)]} />
          </span>
        )}
        birincil={yetki.izinYaz || yetki.izinTalep ? { etiket: 'İzin talebi', simge: 'flag', yap: () => { izinAcikYaz(true); } } : undefined}
      />
      <Sekmeler etiket="Özlük dosyası bölümleri" sekmeler={SEKMELER} secili={sekme} sec={sekmeYaz} />
      <div className="tc-ikp-sayfa" role="tabpanel" aria-label={SEKMELER.find((s) => s.anahtar === sekme)?.baslik}>
        {sekme === 'ozet' && <OzetSekmesi {...so} />}
        {sekme === 'kimlik' && <BolumSekmesi {...so} bolum="Kimlik" baslik="Kimlik ve kişisel bilgiler" />}
        {sekme === 'iletisim' && <BolumSekmesi {...so} bolum="İletişim" baslik="İletişim ve acil durum" />}
        {sekme === 'is' && <BolumSekmesi {...so} bolum="İş" baslik="İş ve sözleşme bilgileri" />}
        {sekme === 'ucret' && <UcretSekmesi {...so} />}
        {sekme === 'izin' && <IzinSekmesi {...so} />}
        {sekme === 'devam' && <DevamSekmesi {...so} />}
        {sekme === 'belge' && <BelgeSekmesi {...so} />}
        {sekme === 'gelisim' && <GelisimSekmesi {...so} />}
        {sekme === 'ayrilis' && <AyrilisSekmesi {...so} />}
        {sekme === 'gecmis' && <CizelgeSekmesi {...so} />}
        {sekme === 'not' && <NotSekmesi {...so} />}
      </div>
      {yetki.personelYaz && (
        <PersonelFormPenceresi
          acik={bolum !== null} depo={depo} motor={o.motor} kayit={p} bolum={bolum} kapat={() => { bolumYaz(null); }}
          kaydedildi={() => { if (bolum === 'Ayrılış') sekmeYaz('ayrilis'); }}
        />
      )}
      {(yetki.izinYaz || yetki.izinTalep) && <IzinFormu o={o} acik={izinAcik} kayit={null} onDolu={{ empId: p.id }} kapat={() => { izinAcikYaz(false); }} />}
      <BelgeMenusu acik={belgeAcik} kapat={() => { belgeAcikYaz(false); }} p={p} o={o} />
      <OnayPenceresi
        acik={siliyor} baslik={`${adSoyadMetni(p)} silinsin mi?`} onayMetni="Personeli sil" tehlikeli yukleniyor={komut.calisiyor}
        onayla={() => { void sil(); }} vazgec={() => { siliyorYaz(false); }}
      >
        <p>{`Personel kartı ile birlikte ${bagli().length} bağlı kayıt (izin, mesai, performans) silinir. İşten ayrılan çalışanlar için silmek yerine Ayrılış bölümüne çıkış tarihi girmeniz önerilir.`}</p>
      </OnayPenceresi>
    </div>
  );
}
