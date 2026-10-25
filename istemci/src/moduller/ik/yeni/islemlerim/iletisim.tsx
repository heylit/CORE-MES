import { Girdi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { FormPenceresi } from '../../../../ortak/arayuz/FormPenceresi.tsx';
import { useForm } from '../../../../ortak/veri/form.ts';
import type { Personel } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { Not } from './parcalar.tsx';

// Çalışanın kendi değiştirebildiği altı alan (IK-14); sunucu yalnız bunları yazar (ikIletisimGovdesi).
const ALANLAR = [
  ['telefon', 'Telefon', 'tel'], ['eposta', 'E-posta', 'email'], ['adres', 'Adres', 'text'],
  ['acilKisi', 'Acil durumda aranacak kişi', 'text'], ['acilYakinlik', 'Yakınlık derecesi', 'text'], ['acilTelefon', 'Acil durum telefonu', 'tel'],
] as const;

type Deger = Record<(typeof ALANLAR)[number][0], string>;

export function IletisimPenceresi({ acik, kapat, personel }: { acik: boolean; kapat: () => void; personel: Personel }) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const form = useForm<Deger>({
    ilk: Object.fromEntries(ALANLAR.map(([k]) => [k, personel[k] ?? ''])) as Deger,
    hataIletisi: 'Bilgileriniz kaydedilemedi.',
    kaydet: async (d) => {
      const yeni: Personel = { ...personel };
      for (const [k] of ALANLAR) yeni[k] = d[k].trim();
      await komut.kaydet(yeni);
    },
    basarili: () => { bildir('tamam', 'Bilgileriniz güncellendi.'); kapat(); },
  });
  return (
    <FormPenceresi acik={acik} kapat={kapat} baslik="İletişim bilgilerim" form={form}>
      {ALANLAR.map(([k, etiket, tur]) => <Girdi key={k} etiket={etiket} type={tur} {...form.alan(k)} />)}
      <Not>Diğer bilgilerinizdeki değişiklikler için insan kaynaklarına başvurun.</Not>
    </FormPenceresi>
  );
}
