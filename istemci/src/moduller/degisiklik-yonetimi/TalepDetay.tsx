import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ACILIYET_ADLARI, IMZA_ANLAMLARI, TALEP_DURUM_ADLARI, type GecmisOlayi, type TalepDurumu } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { CcbGovdesi, EmirCevabi, GecmisSatiri, MusteriOnayiGovdesi, TalepCevabi, TalepMalzemesi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, SayfaBasligi, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { tarihMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useKomut } from './komut.ts';
import { KOK, emirYolu, malzemeMetni, sinifMetni } from './gosterim.tsx';
import { AsamaSeridi } from './ortak/AsamaSeridi.tsx';
import { GecmisListesi } from './ortak/GecmisListesi.tsx';
import { ImzaKutusu } from './ortak/ImzaKutusu.tsx';
import { Kunye } from './ortak/Kunye.tsx';
import { SiradakiAdim } from './ortak/SiradakiAdim.tsx';
import { EtkiAnalizi } from './talep/EtkiAnalizi.tsx';
import { Siniflandirma } from './talep/Siniflandirma.tsx';
import './degisiklik-yonetimi.css';

const ASAMALAR = ['Sınıflandırma', 'Etki analizi', 'CCB kararı', 'Müşteri onayı', 'ECO açılışı'] as const;
// Ret CCB aşamasında durur.
const ASAMA_SIRASI: Readonly<Record<TalepDurumu, number>> = {
  gonderildi: 0, analizde: 1, ccb_bekliyor: 2, musteri_onayi_bekliyor: 3, onaylandi: 4, emir_acildi: 5, reddedildi: 2,
};
const ASAMA_OLAYLARI: readonly (readonly GecmisOlayi[])[] = [['siniflandirildi'], ['etki_analizi'], ['ccb_onay', 'ccb_ret'], ['musteri_onayi'], ['emir_acildi']];

const PARCA_SUTUNLARI: readonly Sutun<TalepMalzemesi>[] = [
  { anahtar: 'kod', baslik: 'Parça', hucre: (m) => malzemeMetni(m), mono: true, kirilmaz: true },
  { anahtar: 'ad', baslik: 'Ad', hucre: (m) => m.ad ?? '—' },
  { anahtar: 'revizyon', baslik: 'Yürürlükteki revizyon', hucre: (m) => m.cizimRevizyonu ?? '—', mono: true },
  {
    anahtar: 'otorite', baslik: 'Tasarım otoritesi',
    hucre: (m) => (
      <span className="tc-dy-satir-ic">
        {m.tasarimOtoritesi === null ? '—' : m.tasarimOtoritesi === 'musteri' ? <Rozet ton="bilgi">Müşteri</Rozet> : 'İç tasarım'}
        {m.sozlesmeKonfigurasyonu === true && <Rozet ton="pasif">Sözleşme konfigürasyonu</Rozet>}
      </span>
    ),
    csv: (m) => m.tasarimOtoritesi ?? '',
  },
  { anahtar: 'kullanim', baslik: 'Kullanım yeri', hucre: (m) => (m.kullanimYeri === null || m.kullanimYeri.length === 0 ? '—' : m.kullanimYeri.map(malzemeMetni).join(', ')), mono: true },
];

function asamaBilgisi(gecmis: readonly GecmisSatiri[]): (string | null)[] {
  return ASAMA_OLAYLARI.map((olaylar) => {
    const s = gecmis.find((g) => olaylar.includes(g.olay));
    return s ? `${s.kisiAdi ?? '—'}, ${zamanMetni(s.zaman)}` : null;
  });
}

type Imza = 'ccb_onay' | 'ccb_ret' | 'musteri_onayi';

function ImzaPenceresi({ talep, tur, referans, kapat }: { talep: TalepCevabi; tur: Imza; referans: string; kapat: () => void }) {
  const { bildir } = useBildirim();
  const [aciklama, aciklamaYaz] = useState('');
  const [yerelHata, yerelHataYaz] = useState<string | undefined>(undefined);
  const ccb = tur !== 'musteri_onayi';
  const komut = useKomut(
    `${KOK}/talepler/${talep.id}/${ccb ? 'ccb' : 'musteri-onayi'}`,
    () => { bildir('tamam', tur === 'ccb_onay' ? 'CCB onayı verildi.' : tur === 'ccb_ret' ? 'Talep reddedildi.' : 'Müşteri onayı kaydedildi.'); kapat(); },
    'Kaydedilemedi',
  );
  const gonder = () => {
    if (tur === 'ccb_ret' && aciklama.trim() === '') { yerelHataYaz('Ret gerekçesini yazın.'); return; }
    yerelHataYaz(undefined);
    const govde: CcbGovdesi | MusteriOnayiGovdesi = ccb
      ? { karar: tur === 'ccb_onay' ? 'onay' : 'ret', aciklama, surum: talep.surum }
      : { referans, aciklama, surum: talep.surum };
    komut.gonder(govde);
  };
  const baslik = tur === 'ccb_onay' ? `CCB onayı: ${talep.no}` : tur === 'ccb_ret' ? `CCB reddi: ${talep.no}` : `Müşteri onayı: ${talep.no}`;
  return (
    <Pencere
      acik kapat={kapat} baslik={baslik}
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur={tur === 'ccb_ret' ? 'tehlike' : 'birincil'} yukleniyor={komut.yukleniyor} onClick={gonder}>
            {tur === 'ccb_ret' ? 'İmzala ve reddet' : tur === 'musteri_onayi' ? 'İmzala ve kaydet' : 'İmzala ve onayla'}
          </Dugme>
        </>
      )}
    >
      <div className="tc-dy-form">
        {tur === 'ccb_ret' && <p className="tc-dy-kucuk tc-dy-soluk">Gerekçeyi açıklama alanına yazın.</p>}
        {tur === 'musteri_onayi' && <p>Onay numarası: <strong className="tc-dy-mono">{referans}</strong></p>}
        <ImzaKutusu anlam={IMZA_ANLAMLARI[tur]} aciklama={aciklama} degistir={aciklamaYaz} hata={yerelHata} zorunlu={tur === 'ccb_ret'} />
        {komut.hata && <p className="tc-dy-hata" role="alert">{komut.hata}</p>}
      </div>
    </Pencere>
  );
}

function Adim({ talep, islemler, kisiId }: { talep: TalepCevabi; islemler: readonly string[]; kisiId: number | undefined }) {
  const gezin = useNavigate();
  const { bildir } = useBildirim();
  const [imza, imzaYaz] = useState<Imza | null>(null);
  const [referans, referansYaz] = useState('');
  const yapabilir = (islem: string) => islemler.includes(`degisiklik-yonetimi.${islem}`);
  const etki = useKomut(`${KOK}/talepler/${talep.id}/etki-analizi`, () => { bildir('tamam', 'Etki analizi tamamlandı.'); }, 'Etki analizi çalıştırılamadı');
  const emirAc = useKomut<EmirCevabi>(`${KOK}/talepler/${talep.id}/emir-ac`, (e) => {
    bildir('tamam', `${e.no} açıldı.`);
    void gezin(emirYolu(e.id));
  }, 'ECO açılamadı');
  // Görevler ayrılığı sunucuda denetlenir; burada pencere açılmadan aynı iletiyle durdurulur (prototip).
  const ccbAc = (tur: 'ccb_onay' | 'ccb_ret') => {
    if (kisiId !== undefined && talep.acan.kisiId === kisiId) {
      bildir('hata', 'Görevler ayrılığı: talebi açan kişi kendi talebine CCB kararı veremez.');
      return;
    }
    imzaYaz(tur);
  };
  const musteriAc = () => {
    if (referans.trim() === '') { bildir('hata', 'Müşteri onay numarasını yazın.'); return; }
    imzaYaz('musteri_onayi');
  };

  let adim: ReactNode = null;
  const hata = etki.hata ?? emirAc.hata;
  switch (talep.durum) {
    case 'gonderildi':
      adim = <SiradakiAdim baslik="Sıradaki adım: talebi sınıflandırın" aciklama="Proses mühendisi. Aşağıdaki ayrım testini yanıtlayın." />;
      break;
    case 'analizde':
      adim = (
        <SiradakiAdim baslik="Sıradaki adım: etki analizini çalıştırın" aciklama="Açık emirler, stok, saha ve kullanım yeri otomatik taranır.">
          {yapabilir('siniflandir') && <Dugme tur="birincil" simge="search" yukleniyor={etki.yukleniyor} onClick={() => { etki.gonder({ surum: talep.surum }); }}>Etki analizini çalıştır</Dugme>}
        </SiradakiAdim>
      );
      break;
    case 'ccb_bekliyor':
      adim = (
        <SiradakiAdim
          baslik="Sıradaki adım: CCB kararı"
          aciklama={`Kalite. ${talep.sinif === 'D1' ? 'Class I değişiklik haftalık CCB toplantısında görüşülür.' : 'Asenkron e-onay.'} Talebi açan kişi onaylayamaz.`}
        >
          {yapabilir('ccb-karar') && (
            <>
              <Dugme tur="tehlike" simge="x" onClick={() => { ccbAc('ccb_ret'); }}>Reddet</Dugme>
              <Dugme tur="birincil" simge="check" onClick={() => { ccbAc('ccb_onay'); }}>Onayla</Dugme>
            </>
          )}
        </SiradakiAdim>
      );
      break;
    case 'musteri_onayi_bekliyor':
      adim = (
        <SiradakiAdim
          tur="bekliyor" baslik="Sıradaki adım: müşteri onayını kaydedin"
          aciklama="Class I değişiklik sözleşme konfigürasyonunu etkiliyor; ana yüklenicinin yazılı onayı gerekir."
        >
          {yapabilir('musteri-onayi') && (
            <>
              <Girdi etiket="Onay numarası" value={referans} onChange={(e) => { referansYaz(e.target.value); }} maxLength={80} />
              <Dugme tur="birincil" simge="check" onClick={musteriAc}>Onayı kaydet</Dugme>
            </>
          )}
        </SiradakiAdim>
      );
      break;
    case 'onaylandi':
      adim = (
        <SiradakiAdim
          baslik="Sıradaki adım: değişiklik emrini (ECO) açın"
          aciklama="Taslak revizyonlar ECO içinde hazırlanır; yayınlanana kadar hiçbir emir etkilenmez."
        >
          {yapabilir('emir-ac') && <Dugme tur="birincil" simge="plus" yukleniyor={emirAc.yukleniyor} onClick={() => { emirAc.gonder({ surum: talep.surum }); }}>ECO aç</Dugme>}
        </SiradakiAdim>
      );
      break;
    case 'emir_acildi':
      adim = (
        <SiradakiAdim tur="bitti" baslik="Talep değişiklik emrine dönüştü">
          {talep.emirId !== null && <Link className="tc-dy-bag-dugme" to={emirYolu(talep.emirId)}>Değişiklik emrini aç</Link>}
        </SiradakiAdim>
      );
      break;
    case 'reddedildi':
      adim = <SiradakiAdim tur="bitti" baslik="Talep reddedildi" aciklama="Gerekçe kayıt bölümünde." />;
      break;
  }
  return (
    <>
      {adim}
      {hata && <p className="tc-dy-hata" role="alert">{hata}</p>}
      {imza && <ImzaPenceresi talep={talep} tur={imza} referans={referans.trim()} kapat={() => { imzaYaz(null); }} />}
    </>
  );
}

export function TalepDetay() {
  const { id } = useParams();
  const talepId = Number(id);
  const gecerli = Number.isInteger(talepId) && talepId > 0;
  const oturum = useOturum();
  const islemler = oturum.data?.islemler ?? [];
  const s = useQuery({
    queryKey: anahtarlar.talep(talepId),
    queryFn: () => api.get<TalepCevabi>(`${KOK}/talepler/${talepId}`),
    enabled: gecerli,
  });
  if (!gecerli) return <DurumKutusu durum="bos" mesaj="Kayıt bulunamadı." />;
  if (s.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(s.error, 'Talep alınamadı')} yenile={() => { void s.refetch(); }} />;
  if (s.isPending) return <DurumKutusu durum="yukleniyor" />;
  const t = s.data;
  const sira = ASAMA_SIRASI[t.durum];
  // Müşteri onayı istenmediyse aşama "Gerekmedi" görünür.
  const musteriAtlandi = (sira > 3 && t.musteriReferansi === null) || (t.etki?.musteriOnayiGerekir === false && sira >= 2);
  return (
    <section className="tc-dy">
      <SayfaBasligi
        baslik={t.baslik}
        alt={<nav aria-label="Konum" className="tc-dy-iz"><Link to={`${KOK}/degisiklikler?bolum=talep`}>Değişiklikler</Link> / Talepler / {t.no}</nav>}
      />
      <Kunye
        etiket="Talep künyesi"
        alanlar={[
          ['Kayıt no', <span className="tc-dy-mono">{t.no}</span>],
          ['Sınıf', sinifMetni(t.sinif)],
          ['Aciliyet', ACILIYET_ADLARI[t.aciliyet]],
          ['Açan', t.acan.kisiAdi ?? '—'],
          ['Tarih', tarihMetni(t.acan.zaman.slice(0, 10))],
          ['Durum', TALEP_DURUM_ADLARI[t.durum]],
        ]}
      />
      <AsamaSeridi etiket="Talep aşamaları" asamalar={ASAMALAR} sira={Math.min(sira, ASAMALAR.length)} bilgi={asamaBilgisi(t.gecmis)} atlanan={musteriAtlandi ? [3] : []} />
      <Adim talep={t} islemler={islemler} kisiId={oturum.data?.id} />
      <div className="tc-dy-iki-bir">
        <div className="tc-dy-yan">
          <Kart baslik="Talep">
            <div className="tc-dy-form">
              <p className="tc-dy-metin">{t.aciklama ?? <span className="tc-dy-soluk">Açıklama yok.</span>}</p>
              {t.musteriReferansi && <p>Müşteri onayı: <span className="tc-dy-mono">{t.musteriReferansi}</span></p>}
            </div>
          </Kart>
          {t.durum === 'gonderildi' && islemler.includes('degisiklik-yonetimi.siniflandir') && <Siniflandirma talep={t} />}
          <Kart baslik="Etkilenen parçalar">
            <Tablo etiket="Etkilenen parçalar" sutunlar={PARCA_SUTUNLARI} satirlar={t.malzemeler} satirAnahtari={(m) => m.malzemeId} bosMesaj="Parça yok." />
          </Kart>
          {t.etki && <EtkiAnalizi etki={t.etki} />}
        </div>
        <Kart baslik="Kayıt">
          <GecmisListesi satirlar={t.gecmis} />
        </Kart>
      </div>
    </section>
  );
}
