import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { OzetCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { Dugme, DurumKutusu, IkiSeriKarti, Kart, Rozet, SayiKarti, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_ADI, DURUM_TONU, ONEM_ADI, SINYAL_ADI, kaynakMetni, saatMetni, zamanMetni } from './gorunum.ts';
import './guvenlik.css';

// Panoya bakan elle yenilemek zorunda kalmasın; tarama dakikada bir koşar.
export const YENILEME_MS = 30_000;

type Genel = 'iyi' | 'dikkat' | 'alarm';

// Yüksek ya da kritik açık alarm "alarm"dır; öbür açık ya da onaylanmış alarm, kilitli hesap ve duran tarama "dikkat".
export function genelDurum(o: OzetCevabi): Genel {
  if (o.acikAlarm.kritik + o.acikAlarm.yuksek > 0) return 'alarm';
  if (o.acikAlarm.orta + o.onaylanmisAlarm + o.kilitliHesap > 0 || o.taramaDurdu) return 'dikkat';
  return 'iyi';
}

const BASLIK: Record<Genel, (o: OzetCevabi) => string> = {
  alarm: (o) => `${o.acikAlarm.kritik + o.acikAlarm.yuksek + o.acikAlarm.orta} alarm bakılmayı bekliyor`,
  dikkat: () => 'Dikkat edilecek bir şey var',
  iyi: () => 'Her şey yolunda',
};

function altMetin(o: OzetCevabi): string {
  const parcalar: string[] = [];
  const acik = o.acikAlarm.kritik + o.acikAlarm.yuksek + o.acikAlarm.orta;
  if (acik > 0) parcalar.push(`${o.acikAlarm.kritik + o.acikAlarm.yuksek} yüksek önemli, ${o.acikAlarm.orta} orta önemli açık alarm.`);
  if (o.onaylanmisAlarm > 0) parcalar.push(`${o.onaylanmisAlarm} onaylanmış alarm kapatılmayı bekliyor.`);
  if (o.kilitliHesap > 0) parcalar.push(`${o.kilitliHesap} hesap kilitli.`);
  if (o.taramaDurdu) parcalar.push('Güvenlik taraması son 5 dakikada koşmadı.');
  return parcalar.length > 0 ? parcalar.join(' ') : 'Açık alarm yok; tarama çalışıyor.';
}

export function GuvenlikDurum() {
  const git = useNavigate();
  const sorgu = useQuery({
    queryKey: anahtarlar.ozet,
    queryFn: () => api.get<OzetCevabi>('/guvenlik/ozet'),
    refetchInterval: YENILEME_MS,
  });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />;
  const o = sorgu.data;
  const durum = genelDurum(o);
  const acik = o.acikAlarm.kritik + o.acikAlarm.yuksek + o.acikAlarm.orta;
  return (
    <div className="tc-guvenlik">
      <section className="tc-guvenlik-bant" data-durum={durum} aria-live="polite">
        <span className="tc-guvenlik-isik" aria-hidden="true"><Simge ad={durum === 'iyi' ? 'check' : 'alert'} /></span>
        <div className="tc-guvenlik-bant-metin">
          <h2>{BASLIK[durum](o)}</h2>
          <p>{altMetin(o)}</p>
        </div>
        {durum !== 'iyi' && <Dugme tur="birincil" simge="bell" onClick={() => { void git('/guvenlik/alarmlar'); }}>Alarmlara git</Dugme>}
      </section>

      <div className="tc-guvenlik-kartlar">
        <SayiKarti baslik="Açık alarm" simge="bell" sayi={acik} ton="hata" yol="/guvenlik/alarmlar"
          altMetin={`${o.acikAlarm.kritik + o.acikAlarm.yuksek} yüksek · ${o.acikAlarm.orta} orta`} />
        <SayiKarti baslik="Hatalı giriş, 24 saat" simge="user" sayi={o.girisler.hatali} ton="uyari" yol="/guvenlik/girisler"
          altMetin={`Başarılı ${o.girisler.basarili} · ${o.girisler.kullaniciAdi} ad, ${o.girisler.cihaz} cihaz`} />
        <SayiKarti baslik="Kilitli hesap" simge="lock" sayi={o.kilitliHesap} ton="uyari" yol="/guvenlik/oturumlar" altMetin="Etkin kilit" />
        <SayiKarti baslik="Açık oturum" simge="layers" sayi={o.acikOturum.oturum} yol="/guvenlik/oturumlar" altMetin={`${o.acikOturum.kisi} kişi`} />
        <SayiKarti baslik="Son tarama" simge="clock" metin={o.sonTarama === null ? 'Hiç' : saatMetni(o.sonTarama)} yol="/guvenlik/koruma"
          altMetin={o.taramaDurdu ? 'Tarama durmuş görünüyor' : 'Her dakika'} />
      </div>

      <div className="tc-guvenlik-iki">
        <IkiSeriKarti baslik="Girişler, son 24 saat" simge="chart" seriAdlari={['Başarılı', 'Hatalı']}
          noktalar={o.saatlik.map((s) => ({ etiket: saatMetni(s.saat), birinci: s.basarili, ikinci: s.hatali }))} />
        <Kart baslik="Son alarmlar">
          {o.sonAlarmlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Henüz alarm yok" /> : (
            <ul className="tc-guvenlik-olaylar">
              {o.sonAlarmlar.map((a) => (
                <li key={a.id}>
                  <time className="mono" dateTime={a.sonGoruldu}>{zamanMetni(a.sonGoruldu)}</time>
                  <span className="tc-guvenlik-olay-metin">
                    <b>{SINYAL_ADI[a.sinyal]}</b> · {kaynakMetni(a)} · {ONEM_ADI[a.onem]}
                  </span>
                  <Rozet ton={DURUM_TONU[a.durum]}>{DURUM_ADI[a.durum]}</Rozet>
                </li>
              ))}
            </ul>
          )}
        </Kart>
      </div>
    </div>
  );
}
