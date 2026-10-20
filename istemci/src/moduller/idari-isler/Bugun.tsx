import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { BugunCevabi, BugunIsi, Kontrol, Talep } from '#paylasilan/sozlesme/idari-isler.ts';
import { Dugme, DurumKutusu, Kart, SayiKarti, Sekmeler, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KontrolKarti } from './KontrolKarti.tsx';
import { KontrolAyrinti, KontrolFormu, YapildiPenceresi } from './KontrolPencereleri.tsx';
import { uyariMetni } from './gorunum.ts';
import { TalepKarti } from './TalepKarti.tsx';
import { TalepPenceresi } from './TalepPenceresi.tsx';
import { Taleplerim } from './Taleplerim.tsx';
import { useIslemVar, useTalepKomutu, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

type Suzgec = 'hepsi' | 'acil' | 'yeni' | 'benim' | 'kontrol';
const SUZGECLER = [
  { anahtar: 'hepsi', baslik: 'Hepsi' },
  { anahtar: 'acil', baslik: 'Acil', simge: 'alert' },
  { anahtar: 'yeni', baslik: 'Bekleyen', simge: 'clock' },
  { anahtar: 'benim', baslik: 'Üstlendiklerim', simge: 'user' },
  { anahtar: 'kontrol', baslik: 'Periyodik ve filo', simge: 'check' },
] as const;

const uyar = (s: Suzgec, i: BugunIsi) => {
  if (s === 'hepsi') return true;
  if (i.tur === 'kontrol') return s === 'kontrol' || (s === 'acil' && i.kontrol.kalanGun < 0);
  if (i.tur === 'arac') return s === 'kontrol' || (s === 'acil' && i.arac.uyarilar.some((u) => u.gecti));
  const t = i.talep;
  return (s === 'acil' && t.aciliyet === 'acil') || (s === 'yeni' && t.durum === 'yeni') || (s === 'benim' && t.durum === 'yapiliyor');
};

// Kök ekran: idari işlerin bugün yapacakları. Bütün talepleri okumayan personel kökte kendi taleplerini görür; menü bağlantısı
// kendi adresinde açılır, yönlendirme yapılmaz.
export function Bugun() {
  const oturum = useOturum();
  const okur = useIslemVar('idari-isler.oku');
  if (oturum.data === undefined) return <DurumKutusu durum="yukleniyor" />;
  if (!okur) return <Taleplerim />;
  return <BugunEkrani />;
}

function BugunEkrani() {
  const gezin = useNavigate();
  const acabilir = useIslemVar('idari-isler.talep-ac');
  const yonetir = useIslemVar('idari-isler.talep-yonet');
  const kontrolYazar = useIslemVar('idari-isler.kontrol-yaz');
  const [kontrol, kontrolYaz] = useState<Kontrol | null>(null);
  const [yapilan, yapilanYaz] = useState<Kontrol | null>(null);
  const [duzenlenen, duzenlenenYaz] = useState<Kontrol | null>(null);
  const komut = useTalepKomutu();
  const { bildir } = useBildirim();
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [secili, seciliYaz] = useState<Talep | null>(null);
  const [bekleyen, bekleyenYaz] = useState<number | null>(null);
  // Son üstlenme geri alınabilir (bırak): yanlış dokunuş tek dokunuşla düzelir.
  const [geriAl, geriAlYaz] = useState<Talep | null>(null);
  const bugun = useQuery({ queryKey: anahtarlar.bugun, queryFn: () => api.get<BugunCevabi>('/idari-isler/bugun') });

  const hizli = async (t: Talep) => {
    bekleyenYaz(t.id);
    try {
      if (t.durum === 'yeni') {
        const sonuc = await komut(t, 'ustlen');
        geriAlYaz(sonuc);
      } else {
        await komut(t, 'kapat');
        geriAlYaz(null);
        bildir('tamam', `${t.no} kapandı`);
      }
    } catch (h) {
      bildir('hata', yazmaIletisi(h, 'İşlem yapılamadı'));
    } finally {
      bekleyenYaz(null);
    }
  };

  const birak = async (t: Talep) => {
    try {
      await komut(t, 'birak');
      bildir('bilgi', `${t.no} geri alındı`);
    } catch (h) {
      bildir('hata', yazmaIletisi(h, 'Geri alınamadı'));
    } finally {
      geriAlYaz(null);
    }
  };

  const s = bugun.data?.sayilar;
  const isler = (bugun.data?.isler ?? []).filter((i) => uyar(suzgec, i));

  return (
    <section className="tc-ii">
      <div className="tc-ii-hizli">
        {acabilir && (
          <button type="button" className="tc-ii-kisayol" onClick={() => { void gezin('/idari-isler/talep-ac'); }}>
            <Simge ad="plus" /><span>Talep aç</span>
          </button>
        )}
        <button type="button" className="tc-ii-kisayol" onClick={() => { void gezin('/idari-isler/talepler'); }}>
          <Simge ad="wrench" /><span>Tesis talepleri</span>
        </button>
        <button type="button" className="tc-ii-kisayol" onClick={() => { void gezin('/idari-isler/periyodik'); }}>
          <Simge ad="clock" /><span>Periyodik kontroller</span>
        </button>
        <button type="button" className="tc-ii-kisayol" onClick={() => { void gezin('/idari-isler/yemek'); }}>
          <Simge ad="coffee" /><span>Yemek sayısı</span>
        </button>
        <button type="button" className="tc-ii-kisayol" onClick={() => { void gezin('/idari-isler/filo'); }}>
          <Simge ad="truck" /><span>Filo</span>
        </button>
      </div>
      <div className="tc-ii-sayilar">
        <SayiKarti baslik="Açık talep" simge="wrench" sayi={s?.acikTalep} yol="/idari-isler/talepler" hata={bugun.isError} />
        <SayiKarti baslik="Acil" simge="alert" sayi={s?.acilTalep} ton="hata" hata={bugun.isError} />
        <SayiKarti baslik="Bugün açılan" simge="plus" sayi={s?.bugunAcilan} hata={bugun.isError} />
        <SayiKarti baslik="Bugün kapanan" simge="check" sayi={s?.bugunKapanan} hata={bugun.isError} />
        <SayiKarti baslik="Süresi geçen kontrol" simge="clock" sayi={s?.gecenKontrol} ton="hata" yol="/idari-isler/periyodik" hata={bugun.isError} />
        <SayiKarti baslik="30 gün içinde" simge="clock" sayi={s?.yakinKontrol} ton="uyari" yol="/idari-isler/periyodik" hata={bugun.isError} />
        <SayiKarti baslik="Araç uyarısı" simge="truck" sayi={s?.aracUyarisi} ton="uyari" yol="/idari-isler/filo" hata={bugun.isError} />
      </div>
      {geriAl !== null && (
        <p className="tc-ii-serit" role="status">
          <span>{geriAl.no} üstlendin.</span>
          <Dugme simge="back" onClick={() => void birak(geriAl)}>Geri al</Dugme>
        </p>
      )}
      <Kart baslik="Bugün yapılacaklar" sag={<Dugme simge="rotate" aria-label="Yenile" onClick={() => { void bugun.refetch(); }} yukleniyor={bugun.isFetching} />}>
        <Sekmeler etiket="Süzgeç" sekmeler={SUZGECLER} secili={suzgec} sec={suzgecYaz} />
        {bugun.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(bugun.error, 'İşler alınamadı')} yenile={() => { void bugun.refetch(); }} />
        ) : bugun.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : isler.length === 0 ? (
          <DurumKutusu durum="bos" mesaj="Bu süzgece uyan iş yok." />
        ) : (
          <ul className="tc-ii-liste">
            {isler.map((i) => {
              if (i.tur === 'arac') {
                const a = i.arac;
                return (
                  <li key={`a${a.id}`} className="tc-ii-is">
                    <button type="button" className="tc-ii-talep" data-acil={a.uyarilar.some((u) => u.gecti) ? '' : undefined}
                      onClick={() => { void gezin('/idari-isler/filo'); }}>
                      <span className="tc-ii-konu"><Simge ad="truck" /></span>
                      <span className="tc-ii-govde">
                        <strong className="mono">{a.plaka}</strong>
                        <span className="tc-ii-soluk">{a.uyarilar.map(uyariMetni).join(', ')}</span>
                      </span>
                    </button>
                  </li>
                );
              }
              if (i.tur === 'kontrol') {
                return (
                  <li key={`k${i.kontrol.id}`} className="tc-ii-is">
                    <KontrolKarti kontrol={i.kontrol} sec={() => kontrolYaz(i.kontrol)} {...(kontrolYazar ? { eylem: () => yapilanYaz(i.kontrol) } : {})} />
                  </li>
                );
              }
              const t = i.talep;
              return (
                <li key={t.id} className="tc-ii-is">
                  <TalepKarti talep={t} sec={() => seciliYaz(t)} durumGoster />
                  {yonetir && (
                    <Dugme tur={t.durum === 'yeni' ? 'birincil' : 'ikincil'} simge={t.durum === 'yeni' ? 'user' : 'check'}
                      yukleniyor={bekleyen === t.id} onClick={() => void hizli(t)}>
                      {t.durum === 'yeni' ? 'Üstlen' : 'Kapat'}
                    </Dugme>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Kart>
      <TalepPenceresi talep={secili} kapat={() => seciliYaz(null)} />
      <KontrolAyrinti kontrol={kontrol} kapat={() => kontrolYaz(null)} duzenle={(k) => { kontrolYaz(null); duzenlenenYaz(k); }} />
      <YapildiPenceresi kontrol={yapilan} kapat={() => yapilanYaz(null)} />
      <KontrolFormu acik={duzenlenen !== null} kontrol={duzenlenen} kapat={() => duzenlenenYaz(null)} />
    </section>
  );
}
