import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Kart, KartBildirGovdesi, KartEkleGovdesi, KartlarCevabi, KartTuru } from '#paylasilan/sozlesme/nizamiye.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Pencere, Rozet, Secim, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { useKomut } from './komut.ts';
import { KART_DURUM_ADLARI, KART_DURUM_TONLARI, KART_TURLERI, KART_TURU_ADLARI, adi, saat } from './gorunum.ts';
import './nizamiye.css';

function KartEkle({ kapat }: { kapat: () => void }) {
  const [kartNo, kartNoYaz] = useState('');
  const [tur, turYaz] = useState<KartTuru>('ziyaretci');
  const [bolge, bolgeYaz] = useState('');
  const ekle = useKomut<KartEkleGovdesi, Kart>('Kart eklenemedi.');
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    ekle.mutate({ yol: '/nizamiye/kartlar', govde: { kartNo, tur, izinliBolge: bolge } }, { onSuccess: kapat });
  };
  return (
    <Pencere acik baslik="Kart ekle" kapat={kapat}>
      <form className="tc-nz-panel-form" onSubmit={gonder}>
        <Girdi etiket="Kart no" required maxLength={12} value={kartNo} onChange={(o) => kartNoYaz(o.target.value.toUpperCase())}
          ipucu="Kartın üstündeki yazı; büyük harf, rakam ve tire." />
        <Secim etiket="Tür" value={tur} onChange={(o) => turYaz(o.target.value as KartTuru)}
          secenekler={KART_TURLERI.map((t) => ({ deger: t, baslik: KART_TURU_ADLARI[t] }))} />
        <Girdi etiket="İzinli bölge (isteğe bağlı)" maxLength={120} value={bolge} onChange={(o) => bolgeYaz(o.target.value)} />
        <div className="tc-nz-panel-alt">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" simge="plus" disabled={kartNo.trim() === ''} yukleniyor={ekle.isPending}>Ekle</Dugme>
        </div>
      </form>
    </Pencere>
  );
}

function KartBildir({ kart, kapat }: { kart: Kart; kapat: () => void }) {
  const [durum, durumYaz] = useState<'kayip' | 'hasarli'>('kayip');
  const [not, notYaz] = useState('');
  const bildir = useKomut<KartBildirGovdesi, Kart>('Bildirilemedi.');
  const gonder = (o: FormEvent) => {
    o.preventDefault();
    bildir.mutate({ yol: `/nizamiye/kartlar/${kart.id}/bildir`, govde: { surum: kart.surum, durum, not } }, { onSuccess: kapat });
  };
  return (
    <Pencere acik baslik={`Kart ${kart.kartNo}: sorun bildir`} kapat={kapat}>
      <form className="tc-nz-panel-form" onSubmit={gonder}>
        <div className="tc-nz-secim-iki" role="radiogroup" aria-label="Sorun">
          {(['kayip', 'hasarli'] as const).map((d) => (
            <button key={d} type="button" role="radio" aria-checked={durum === d} className="tc-nz-secim" onClick={() => durumYaz(d)}>
              <Simge ad={d === 'kayip' ? 'search' : 'wrench'} />{KART_DURUM_ADLARI[d]}
            </button>
          ))}
        </div>
        <CokSatir etiket="Not (isteğe bağlı)" maxLength={300} value={not} onChange={(o) => notYaz(o.target.value)} />
        <div className="tc-nz-panel-alt">
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="tehlike" type="submit" simge="alert" yukleniyor={bildir.isPending}>Bildir</Dugme>
        </div>
      </form>
    </Pencere>
  );
}

export function KartRafi() {
  const oturum = useOturum();
  const islemler = oturum.data?.islemler ?? [];
  const yazabilir = islemler.includes('nizamiye.yaz');
  const yonetir = islemler.includes('nizamiye.kart-yonet');
  const veri = useQuery({ queryKey: anahtarlar.kartlar, queryFn: () => api.get<KartlarCevabi>('/nizamiye/kartlar') });
  const [ekleAcik, ekleAcikYaz] = useState(false);
  const [bildirilen, bildirilenYaz] = useState<Kart | null>(null);
  const rafa = useKomut<{ surum: number }, Kart>('Rafa alınamadı.');

  if (veri.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (veri.isError) return <DurumKutusu durum="hata" yenile={() => { void veri.refetch(); }} />;
  const { kartlar } = veri.data;
  const say = (d: Kart['durum']) => kartlar.filter((k) => k.durum === d).length;

  return (
    <div className="tc-nz">
      <div className="tc-nz-baslik-satiri">
        <h1 className="tc-nz-sayfa-baslik"><Simge ad="tag" /> Kart rafı</h1>
        <span className="tc-nz-soluk">
          {`${say('bos')} boş · ${say('kullanimda')} kullanımda · ${say('kayip')} kayıp · ${say('hasarli')} hasarlı`}
        </span>
        {yonetir && <Dugme tur="birincil" simge="plus" onClick={() => ekleAcikYaz(true)}>Kart ekle</Dugme>}
      </div>
      {kartlar.length === 0 && <p className="tc-nz-bos">Rafta kart yok.{yonetir ? ' "Kart ekle" ile başlayın.' : ''}</p>}
      <div className="tc-nz-raf">
        {kartlar.map((k) => (
          <article key={k.id} className={`tc-nz-raf-kart tc-nz-raf-${k.durum}`}>
            <div className="tc-nz-raf-ust">
              <strong className="tc-nz-kartno">{k.kartNo}</strong>
              <Rozet ton={KART_DURUM_TONLARI[k.durum]}>{KART_DURUM_ADLARI[k.durum]}</Rozet>
            </div>
            <span className="tc-nz-soluk">{[KART_TURU_ADLARI[k.tur], k.izinliBolge].filter(Boolean).join(' · ')}</span>
            {k.ziyaret && <span><Simge ad="user" boyut="k" /> {adi(k.ziyaret)} · {saat(k.ziyaret.giris)}</span>}
            {k.durumNotu && <span className="tc-nz-soluk">{k.durumNotu}</span>}
            {yazabilir && k.durum === 'bos' && <Dugme simge="alert" onClick={() => bildirilenYaz(k)}>Sorun bildir</Dugme>}
            {yonetir && (k.durum === 'kayip' || k.durum === 'hasarli') && (
              <Dugme simge="rotate" yukleniyor={rafa.isPending && rafa.variables.yol.includes(`/${k.id}/`)}
                onClick={() => rafa.mutate({ yol: `/nizamiye/kartlar/${k.id}/rafa-al`, govde: { surum: k.surum } })}>Rafa al</Dugme>
            )}
          </article>
        ))}
      </div>
      {ekleAcik && <KartEkle kapat={() => ekleAcikYaz(false)} />}
      {bildirilen && <KartBildir kart={bildirilen} kapat={() => bildirilenYaz(null)} />}
    </div>
  );
}
