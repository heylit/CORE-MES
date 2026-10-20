import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AracGorevi, AracGorevleriCevabi, AraclarCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Pencere, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GorevKarti } from './GorevKarti.tsx';
import { ARAC_DURUMU, SINIR, aracAdi, gorevAcikMi, gorevTarihleri, kmMetni } from './gorunum.ts';
import { useGorevKomutu, useIslemVar, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

const GRUPLAR = [
  { baslik: 'Onay bekleyen', durumlar: ['bekliyor'] },
  { baslik: 'Onaylı, çıkış bekleyen', durumlar: ['onaylandi'] },
  { baslik: 'Yolda', durumlar: ['yolda'] },
  { baslik: 'Son 14 günde kapanan', durumlar: ['tamamlandi', 'reddedildi', 'geri_cekildi'] },
] as const;

// Araç görevleri (247 a): çalışanların araç talepleri. İdari işler araç verip onaylar ya da reddeder, çıkış ve dönüş km'sini yazar;
// müdür okur.
export function AracGorevleri() {
  const yazar = useIslemVar('idari-isler.filo-yaz');
  const [secili, seciliYaz] = useState<AracGorevi | null>(null);
  const liste = useQuery({ queryKey: anahtarlar.aracGorevleri, queryFn: () => api.get<AracGorevleriCevabi>('/idari-isler/arac-gorevleri') });

  return (
    <section className="tc-ii">
      <Kart baslik="Araç görevleri" sag={<Dugme simge="rotate" aria-label="Yenile" onClick={() => { void liste.refetch(); }} yukleniyor={liste.isFetching} />}>
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Araç görevleri alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : liste.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : liste.data.gorevler.length === 0 ? (
          <DurumKutusu durum="bos" mesaj="Açık araç talebi yok." />
        ) : (
          GRUPLAR.map((grup) => {
            const gorevler = liste.data.gorevler.filter((g) => (grup.durumlar as readonly string[]).includes(g.durum));
            if (gorevler.length === 0) return null;
            return (
              <section key={grup.baslik} className="tc-ii-yigin" aria-label={grup.baslik}>
                <h3 className="tc-ii-ara-baslik">{grup.baslik} ({gorevler.length})</h3>
                <ul className="tc-ii-liste">
                  {gorevler.map((g) => (
                    <li key={g.id} className="tc-ii-is">
                      <GorevKarti gorev={g} talepEdenGoster />
                      {yazar && gorevAcikMi(g.durum) && <Dugme simge="edit" onClick={() => seciliYaz(g)}>{KOMUT_ADI[g.durum]}</Dugme>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </Kart>
      {secili !== null && <GorevPenceresi gorev={secili} kapat={() => seciliYaz(null)} />}
    </section>
  );
}

const KOMUT_ADI: Partial<Record<AracGorevi['durum'], string>> = { bekliyor: 'Onayla', onaylandi: 'Çıkış', yolda: 'Dönüş' };
const KM = /^\d{1,7}$/;

function GorevPenceresi({ gorev, kapat }: { gorev: AracGorevi; kapat: () => void }) {
  const komut = useGorevKomutu();
  const { bildir } = useBildirim();
  const araclar = useQuery({ queryKey: anahtarlar.araclar, queryFn: () => api.get<AraclarCevabi>('/idari-isler/araclar') });
  const uygun = (araclar.data?.araclar ?? []).filter((a) => a.durum !== 'pasif' && a.durum !== 'serviste');
  const verilen = araclar.data?.araclar.find((a) => a.id === gorev.aracId) ?? null;
  const [aracId, aracIdYaz] = useState('');
  const [km, kmYaz] = useState('');
  const [red, redYaz] = useState(false);
  const [neden, nedenYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);

  const calistir = async (ad: 'onayla' | 'reddet' | 'cikis' | 'donus', ek: object, ileti: string) => {
    bekliyorYaz(true);
    hataYaz(null);
    try {
      await komut(gorev, ad, ek);
      bildir('tamam', ileti);
      kapat();
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Kaydedilemedi'));
    } finally {
      bekliyorYaz(false);
    }
  };

  const kmGecerli = KM.test(km.trim());
  const ana = red ? (
    <Dugme tur="tehlike" simge="x" disabled={neden.trim() === ''} yukleniyor={bekliyor}
      onClick={() => void calistir('reddet', { neden: neden.trim() }, 'Araç talebi reddedildi')}>Reddet</Dugme>
  ) : gorev.durum === 'bekliyor' ? (
    <Dugme tur="birincil" simge="check" disabled={aracId === ''} yukleniyor={bekliyor}
      onClick={() => void calistir('onayla', { aracId: Number(aracId) }, 'Araç görevi onaylandı')}>Onayla</Dugme>
  ) : (
    <Dugme tur="birincil" simge="check" disabled={!kmGecerli} yukleniyor={bekliyor}
      onClick={() => void calistir(gorev.durum === 'onaylandi' ? 'cikis' : 'donus', { km: Number(km.trim()) },
        gorev.durum === 'onaylandi' ? 'Çıkış yazıldı' : 'Dönüş yazıldı')}>
      {gorev.durum === 'onaylandi' ? 'Çıkışı yaz' : 'Dönüşü yaz'}
    </Dugme>
  );

  return (
    <Pencere acik kapat={kapat} baslik={gorev.varis} tur="yan"
      alt={(
        <span className="tc-ii-dugmeler">
          {gorev.durum !== 'yolda' && !red && <Dugme simge="x" onClick={() => redYaz(true)}>Reddet</Dugme>}
          <Dugme onClick={red ? () => redYaz(false) : kapat}>Vazgeç</Dugme>
          {ana}
        </span>
      )}
    >
      <div className="tc-ii-yigin">
        <GorevKarti gorev={gorev} talepEdenGoster />
        {gorev.aciklama !== null && <p>{gorev.aciklama}</p>}
        {red ? (
          <CokSatir etiket="Red nedeni" required maxLength={SINIR.not} value={neden} onChange={(o) => nedenYaz(o.target.value)} />
        ) : gorev.durum === 'bekliyor' ? (
          araclar.isError ? (
            <DurumKutusu durum="hata" mesaj={hataIletisi(araclar.error, 'Araçlar alınamadı')} yenile={() => { void araclar.refetch(); }} />
          ) : (
            <Secim etiket="Verilecek araç" value={aracId} onChange={(o) => aracIdYaz(o.target.value)}
              secenekler={[
                { deger: '', baslik: uygun.length === 0 ? 'Uygun araç yok' : 'Araç seç' },
                ...uygun.map((a) => ({ deger: String(a.id), baslik: `${a.plaka} · ${aracAdi(a)} · ${ARAC_DURUMU[a.durum].etiket}` })),
              ]} />
          )
        ) : (
          <Girdi etiket={gorev.durum === 'onaylandi' ? 'Çıkış km' : 'Dönüş km'} inputMode="numeric" value={km} onChange={(o) => kmYaz(o.target.value)}
            ipucu={gorev.durum === 'onaylandi'
              ? `Aracın kayıtlı km'si: ${kmMetni(verilen?.km ?? null)}`
              : `Çıkış km: ${kmMetni(gorev.cikisKm)}`} />
        )}
        <p className="tc-ii-soluk">{gorevTarihleri(gorev)} · Aynı araç kesişen tarihlerde iki göreve verilmez.</p>
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
      </div>
    </Pencere>
  );
}
