import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { OnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { SURE, anahtarlar, cagri } from './talep/ortak.ts';

// İş kutusunda en yakın gerekenler; tamamı ve talebe çevirme Taleplerim'in "Ön talepler" bölümündedir.
const GOSTERILEN = 8;

const yerelGun = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const gunYaz = (g: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${g}T00:00:00Z`));
const ne = (o: OnTalep) => (o.kaynak === 'fason' ? `${o.emirNo} Op ${o.opNo}${o.adim ? ` ${o.adim}` : ''}` : o.kaynak === 'siparis' ? `${o.siparisNo} · ${o.malzeme.kod} · ${o.malzeme.ad}` : `${o.malzeme.kod} · ${o.malzeme.ad}`);
const anahtar = (o: OnTalep) => (o.kaynak === 'fason' ? `f${o.isEmriId}` : o.kaynak === 'plan' ? `p${o.malzeme.no}` : `s${o.siparisSatiriId}`);
const KAYNAK_ADI: Record<OnTalep['kaynak'], string> = { plan: 'Plan', fason: 'Fason', siparis: 'Sipariş' };
const miktarYaz = (m: number | string) => (typeof m === 'string' ? m.replace('.', ',') : m.toLocaleString('tr-TR', { maximumFractionDigits: 4 }));
// Tarihi olmayan sona gider: ne zaman gerektiği bilinmeyen iş, bilinenin önüne geçmez.
const sirala = (a: OnTalep, b: OnTalep) => (a.gerekenTarih ?? '9999').localeCompare(b.gerekenTarih ?? '9999');

function sutunlar(bugun: string): Sutun<OnTalep>[] {
  return [
    { anahtar: 'kaynak', baslik: 'Kaynak', kirilmaz: true, hucre: (o) => <Rozet ton={o.kaynak === 'plan' ? 'bilgi' : o.kaynak === 'siparis' ? 'uyari' : 'pasif'}>{KAYNAK_ADI[o.kaynak]}</Rozet> },
    { anahtar: 'ne', baslik: 'Malzeme ya da adım', hucre: ne },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (o) => `${miktarYaz(o.miktar)} ${o.birim}` },
    {
      anahtar: 'gereken', baslik: 'Gereken', kirilmaz: true,
      hucre: (o) => (o.gerekenTarih === null ? '' : o.gerekenTarih < bugun ? <Rozet ton="hata">{gunYaz(o.gerekenTarih)} geçti</Rozet> : gunYaz(o.gerekenTarih)),
    },
  ];
}

// İş kutusu kartı: planın stokla karşılanamayan malzemesi, firmaya gidecek fason adımlar (898 a) ve satış siparişinin "Satın al" kalemleri (3429-3 F3). Salt okunur; talebe çevirme
// ve yoksayma Taleplerim'de kalır. Uç talep açabilene açıktır; kart yalnız satın almayı yazana çizilir (iş kutusunun sahibi).
export function OnTalepKarti() {
  const islemler = useOturum().data?.islemler ?? [];
  const gorur = islemler.includes('satin-alma.yaz') && islemler.includes('satin-alma.talep-ac');
  const git = useNavigate();
  const liste = useQuery({ queryKey: anahtarlar.onTalepler, queryFn: () => cagri.get('/satin-alma-on-talepleri', SURE), enabled: gorur });
  if (!gorur) return null;
  const bugun = yerelGun(new Date());
  const hepsi = [...(liste.data?.onTalepler ?? [])].sort(sirala);
  const plan = hepsi.filter((o) => o.kaynak === 'plan').length;
  const satis = hepsi.filter((o) => o.kaynak === 'siparis').length;
  const gecen = hepsi.filter((o) => o.gerekenTarih !== null && o.gerekenTarih < bugun).length;
  const ozet = liste.data === undefined ? undefined
    : `${plan.toLocaleString('tr-TR')} plan, ${(hepsi.length - plan - satis).toLocaleString('tr-TR')} fason${satis ? `, ${satis.toLocaleString('tr-TR')} sipariş` : ''}${gecen ? `; ${gecen.toLocaleString('tr-TR')} tanesinin günü geçti` : ''}`;
  return (
    <Kart
      baslik="Ön talepler"
      simge="list"
      {...(ozet === undefined ? {} : { baslikEki: ozet })}
      sag={<Dugme simge="next" onClick={() => void git('/taleplerim')}>Ön taleplere git</Dugme>}
    >
      {liste.isError ? <DurumKutusu durum="hata" yenile={() => void liste.refetch()} />
        : <Tablo etiket="Ön talepler" sutunlar={sutunlar(bugun)} satirlar={hepsi.slice(0, GOSTERILEN)} satirAnahtari={anahtar} mesgul={liste.isPending} bosMesaj="Bekleyen ön talep yok." />}
    </Kart>
  );
}
