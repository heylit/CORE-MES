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
const ne = (o: OnTalep) => (o.kaynak === 'plan' ? `${o.malzeme.kod} · ${o.malzeme.ad}` : `${o.emirNo} Op ${o.opNo}${o.adim ? ` ${o.adim}` : ''}`);
const anahtar = (o: OnTalep) => (o.kaynak === 'fason' ? `f${o.isEmriId}` : `p${o.malzeme.no}`);
// Tarihi olmayan sona gider: ne zaman gerektiği bilinmeyen iş, bilinenin önüne geçmez.
const sirala = (a: OnTalep, b: OnTalep) => (a.gerekenTarih ?? '9999').localeCompare(b.gerekenTarih ?? '9999');

function sutunlar(bugun: string): Sutun<OnTalep>[] {
  return [
    { anahtar: 'kaynak', baslik: 'Kaynak', kirilmaz: true, hucre: (o) => <Rozet ton={o.kaynak === 'plan' ? 'bilgi' : 'pasif'}>{o.kaynak === 'plan' ? 'Plan' : 'Fason'}</Rozet> },
    { anahtar: 'ne', baslik: 'Malzeme ya da adım', hucre: ne },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (o) => `${o.miktar.toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${o.birim}` },
    {
      anahtar: 'gereken', baslik: 'Gereken', kirilmaz: true,
      hucre: (o) => (o.gerekenTarih === null ? '' : o.gerekenTarih < bugun ? <Rozet ton="hata">{gunYaz(o.gerekenTarih)} geçti</Rozet> : gunYaz(o.gerekenTarih)),
    },
  ];
}

// İş kutusu kartı: planın stokla karşılanamayan malzemesi ve firmaya gidecek fason adımlar (898 a). Salt okunur; talebe çevirme
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
  const gecen = hepsi.filter((o) => o.gerekenTarih !== null && o.gerekenTarih < bugun).length;
  const ozet = liste.data === undefined ? undefined
    : `${plan.toLocaleString('tr-TR')} plan, ${(hepsi.length - plan).toLocaleString('tr-TR')} fason${gecen ? `; ${gecen.toLocaleString('tr-TR')} tanesinin günü geçti` : ''}`;
  return (
    <Kart
      baslik="Ön talepler"
      simge="rotate"
      {...(ozet === undefined ? {} : { baslikEki: ozet })}
      sag={<Dugme simge="next" onClick={() => void git('/taleplerim')}>Ön taleplere git</Dugme>}
    >
      {liste.isError ? <DurumKutusu durum="hata" yenile={() => void liste.refetch()} />
        : <Tablo etiket="Ön talepler" sutunlar={sutunlar(bugun)} satirlar={hepsi.slice(0, GOSTERILEN)} satirAnahtari={anahtar} mesgul={liste.isPending} bosMesaj="Bekleyen ön talep yok." />}
    </Kart>
  );
}
