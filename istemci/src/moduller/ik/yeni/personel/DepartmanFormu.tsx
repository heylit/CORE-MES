import { useEffect, useState } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { FormPenceresi } from '../../../../ortak/arayuz/FormPenceresi.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { useForm, type AlanHatalari } from '../../../../ortak/veri/form.ts';
import { ikSabitleri, type IkMotoru } from '../motor.ts';
import type { Departman } from '../tipler.ts';
import { useIkKomutu, yeniKimlik, type IkDeposu } from '../veri.ts';
import { DEPARTMAN_ALANLARI } from './alanlar.ts';
import { aktifMi, bugun, siraliPersonel } from './kurallar.ts';
import { AlanGirdisi } from './parcalar.tsx';

type Degerler = Record<string, unknown>;
const ilk = (d: Departman | null): Degerler => Object.fromEntries(DEPARTMAN_ALANLARI.map((f) => [f.k, d?.[f.k] ?? '']));

// Departman ekle ve düzenle; silme sunucuda iptaldir (IK-18) ve "Geri al" ile geri getirilir.
export function DepartmanFormu({ acik, kayit, depo, motor, kapat }: {
  acik: boolean; kayit: Departman | null; depo: IkDeposu; motor: IkMotoru | null; kapat(): void;
}) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [siliyor, siliyorYaz] = useState(false);
  const gun = bugun();
  const form = useForm<Degerler, Departman>({
    ilk: ilk(kayit),
    dogrula: (d): AlanHatalari => (String(d.ad ?? '').trim() ? {} : { ad: 'Bu alan zorunlu.' }),
    kaydet: async (d) => {
      const yeni = { ...(kayit ?? { id: yeniKimlik('dept'), kind: 'dept' as const }), ...d } as Departman;
      await komut.kaydet(yeni);
      return yeni;
    },
    basarili: () => { kapat(); bildir('tamam', kayit ? 'Değişiklikler kaydedildi.' : 'Kaydedildi.'); },
    hataIletisi: 'Departman kaydedilemedi.',
  });
  useEffect(() => { if (acik) form.sifirla(ilk(kayit)); }, [acik]);

  const sil = async () => {
    if (!kayit) return;
    const eski = { ...kayit };
    siliyorYaz(false);
    kapat();
    try {
      await komut.iptal(kayit.id);
    } catch {
      bildir('hata', 'Departman silinemedi.');
      return;
    }
    bildir('tamam', 'Silindi.', { eylem: { etiket: 'Geri al', yap: () => { void komut.kaydet(eski).then(() => { bildir('tamam', 'Kayıt geri getirildi.'); }, () => { bildir('hata', 'Kayıt geri getirilemedi.'); }); } } });
  };

  const baglam = {
    sabitler: ikSabitleri(), motor, personeller: siraliPersonel(depo.tur('emp'), gun), departmanlar: depo.tur('dept'),
    secenekler: depo.ben.secenekler, kayitKimligi: null, kayit: null, aktifMi: (p: Parameters<typeof aktifMi>[0]) => aktifMi(p, gun),
  };
  return (
    <>
      <FormPenceresi acik={acik && !siliyor} kapat={kapat} form={form} baslik={kayit ? 'Departman düzenle' : 'Yeni departman'}>
        <div className="tc-ikp-form-alanlar">
          {DEPARTMAN_ALANLARI.map((f) => (
            <AlanGirdisi key={f.k} f={f} deger={form.degerler[f.k]} degistir={(v) => { form.degistir({ [f.k]: v }); }} hata={form.hata(f.k)} b={baglam} />
          ))}
        </div>
        {kayit && (
          <div className="tc-ikp-form-sil">
            <Dugme tur="tehlike" simge="trash" onClick={() => { siliyorYaz(true); }}>Sil</Dugme>
          </div>
        )}
      </FormPenceresi>
      <OnayPenceresi
        acik={siliyor} baslik="Departman silinsin mi?" onayMetni="Sil" tehlikeli
        onayla={() => { void sil(); }} vazgec={() => { siliyorYaz(false); }}
      >
        <p>Kayıt silinecek. Hemen ardından çıkan “Geri al” düğmesiyle geri getirebilirsiniz.</p>
      </OnayPenceresi>
    </>
  );
}
