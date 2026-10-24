import { AdimliForm, type FormVerisi, type KmAlan } from '../AdimliForm.tsx';
import type { Emir } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { EMIR_TIP } from '../sabitler.ts';

type EmirDegeri = Partial<Emir>;
const emir = (d: FormVerisi): EmirDegeri => d as EmirDegeri;

function alanlar(veri: KmVerisi): KmAlan[] {
  return [
    { k: 'no', etiket: 'Numara', zorunlu: true },
    { k: 'tip', etiket: 'Tür', tur: 'secim', secenekler: EMIR_TIP },
    { k: 'durum', etiket: 'Durum', tur: 'secim', secenekler: ['Açık', 'Kapalı'] },
    { k: 'parcaNo', etiket: 'Parça no', zorunlu: true, liste: 'parca' },
    { k: 'parcaAdi', etiket: 'Parça adı', genis: 'tam' },
    { k: 'miktar', etiket: 'Miktar', tur: 'sayi' },
    { k: 'termin', etiket: 'Termin', tur: 'tarih' },
    {
      k: 'tedarikci', etiket: 'Tedarikçi (satınalma için)', tur: 'secim', genis: 'tam',
      secenekler: [['', '—'] as const, ...veri.sup.map((s) => [s._id, `${s.kod ?? ''} ${s.ad ?? ''}`.trim()] as const)],
    },
    { k: 'musteri', etiket: 'Müşteri' },
    { k: 'proje', etiket: 'Proje' },
    { k: 'not', etiket: 'Not', tur: 'cokSatir', genis: 'tam' },
  ];
}

const numaraVar = (veri: KmVerisi, d: EmirDegeri, kayit: Emir | null) => veri.emir.some((x) => x.no === d.no && (!kayit || x._id !== kayit._id));

export function EmirFormu({ veri, yetki, kayit, on, kapat }: { veri: KmVerisi; yetki: KmYetkisi; kayit: Emir | null; on?: Partial<Emir>; kapat: () => void }) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const A = alanlar(veri);
  return (
    <AdimliForm
      baslik={kayit ? `${kayit.no ?? ''} düzenle` : 'İş emri / sipariş ekle'}
      alanlar={A}
      ilk={kayit ?? { tip: 'İş emri', durum: 'Açık', ...on }}
      adimlar={[{ baslik: 'İş emri / sipariş', alanlar: A.map((a) => a.k) }]}
      denetle={(d) => (numaraVar(veri, emir(d), kayit) ? [{ metin: 'Bu numara zaten kayıtlı.', adim: 0, alan: 'no' }] : [])}
      gecmis={kayit ? { kol: 'emir', kimlik: kayit._id } : undefined}
      kaydet={async (d) => {
        if (numaraVar(veri, emir(d), kayit)) { bildir('hata', 'Bu numara zaten kayıtlı.'); return; }
        await komut.kaydet('emir', { ...(kayit ?? {}), ...d });
        bildir('tamam', 'Kaydedildi');
        kapat();
      }}
      kapat={kapat}
    />
  );
}
