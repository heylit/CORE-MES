import { useEffect, useMemo } from 'react';
import { FormPenceresi } from '../../../../ortak/arayuz/FormPenceresi.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { useForm } from '../../../../ortak/veri/form.ts';
import { ikSabitleri, motorKur, type IkMotoru } from '../motor.ts';
import type { Personel } from '../tipler.ts';
import { useIkDeposu, useIkKomutu, yeniKimlik, type IkDeposu } from '../veri.ts';
import { bolumAlanlari, YENI_PERSONEL_BOLUMLERI, type PersonelBolumu } from './alanlar.ts';
import {
  adSoyadMetni, aktifMi, bugun, cikistanSonrakiIzinler, personelDogrula, personelKayitOncesi, sayi, siraliDepartman, siraliPersonel,
} from './kurallar.ts';
import { ayar } from './motor-yuzu.ts';
import { AlanGirdisi, type AlanBaglami } from './parcalar.tsx';

type Degerler = Record<string, unknown>;

interface Ozellikler {
  acik: boolean;
  depo: IkDeposu;
  motor: IkMotoru | null;
  // null: yeni personel (Kimlik, İletişim, İş, Ücret bölümleri birlikte).
  kayit: Personel | null;
  bolum: PersonelBolumu | null;
  onDolu?: Partial<Personel>;
  baslik?: string;
  kapat: () => void;
  kaydedildi?: (p: Personel) => void;
}

function ilkDegerler(kayit: Personel | null, bolumler: readonly PersonelBolumu[], onDolu: Partial<Personel>, depo: IkDeposu): Degerler {
  const alanlar = bolumAlanlari(bolumler);
  if (kayit) return Object.fromEntries(alanlar.map((f) => [f.k, kayit[f.k] ?? '']));
  const d: Degerler = Object.fromEntries(alanlar.map((f) => [f.k, f.varsayilan ?? '']));
  const ims = depo.ben.secenekler.isMerkezleri;
  if (ims.length === 1 && ims[0]) d.isMerkeziId = ims[0].id;
  return { ...d, ...onDolu };
}

// Personel kartının bölüm formu (düzenleme) ya da yeni personel formu. Kayıt öncesi düzen bugünkü formla aynıdır
// (kurallar.ts personelKayitOncesi); yazma ucu ve yetki denetimi sunucudadır.
export function PersonelFormPenceresi({ acik, depo, motor, kayit, bolum, onDolu = {}, baslik, kapat, kaydedildi }: Ozellikler) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const bolumler = bolum ? [bolum] : YENI_PERSONEL_BOLUMLERI;
  const alanlar = useMemo(() => bolumAlanlari(bolumler), [bolum]);
  const personeller = depo.tur('emp');
  const izinler = depo.tur('leave');
  const gun = bugun();
  const sabitler = ikSabitleri();

  const form = useForm<Degerler, Personel>({
    ilk: ilkDegerler(kayit, bolumler, onDolu, depo),
    dogrula: (d) => personelDogrula({ ...(kayit ?? { id: '', kind: 'emp' }), ...d } as Personel, alanlar.map((f) => ({ k: f.k, zorunlu: f.zorunlu, tur: f.tur === 'eposta' ? 'email' : f.tur })), personeller),
    kaydet: async (d) => {
      const veri = { ...(kayit ?? { id: yeniKimlik('emp'), kind: 'emp' as const }), ...d } as Personel;
      const yeni = personelKayitOncesi(kayit, veri, {
        gun, personeller, denemeAy: sayi(motor ? ayar(motor, 'denemeAy') : depo.ayarlar['denemeAy']) || 2, bolum,
        departmanAdi: (id) => depo.tur('dept').find((x) => x.id === id)?.ad ?? '—',
        personelAdi: (id) => adSoyadMetni(personeller.find((x) => x.id === id)),
        yakaTahmini: sabitler?.inferCollar, kademeTahmini: sabitler?.inferLevel,
      });
      // Sunucunun uyarısını (IK-74) komut kendisi gösterir.
      await komut.kaydet(yeni);
      return yeni;
    },
    basarili: (p) => {
      kapat();
      if (bolum === 'Ayrılış' && kayit && !kayit.cikisTarihi && p.cikisTarihi) {
        const sonra = cikistanSonrakiIzinler(p, izinler);
        bildir(sonra ? 'hata' : 'tamam', `Çıkış kaydedildi. Kontrol listesini tamamlayın${sonra ? `: çıkış tarihinden sonra ${sonra} izin kaydı var.` : '.'}`);
      } else bildir('tamam', kayit ? 'Değişiklikler kaydedildi.' : 'Kaydedildi.');
      kaydedildi?.(p);
    },
    hataIletisi: 'Personel kaydedilemedi.',
  });

  // Pencere her açılışta kaydın güncel haliyle başlar.
  useEffect(() => { if (acik) form.sifirla(ilkDegerler(kayit, bolumler, onDolu, depo)); }, [acik]);

  const baglam: AlanBaglami = {
    sabitler, motor, personeller: siraliPersonel(personeller, gun), departmanlar: siraliDepartman(depo.tur('dept')),
    secenekler: depo.ben.secenekler, kayitKimligi: kayit?.id ?? null, kayit: { ...(kayit ?? { id: '', kind: 'emp' }), ...form.degerler } as Personel,
    aktifMi: (p) => aktifMi(p, gun),
  };

  // Pozisyon girilince boş yaka ve kademe tahmin edilir; işe giriş girilince boş deneme bitişi önerilir (bugünkü form).
  const degistir = (k: string, v: unknown) => {
    const yama: Degerler = { [k]: v };
    if (k === 'pozisyon' && sabitler && typeof v === 'string') {
      if ('yakaTipi' in form.degerler && !form.degerler.yakaTipi) yama.yakaTipi = sabitler.inferCollar(v);
      if ('kademe' in form.degerler && !form.degerler.kademe) yama.kademe = sabitler.inferLevel(v);
    }
    form.degistir(yama);
  };

  const gruplar = bolumler.map((b) => ({ b, alanlar: alanlar.filter((f) => f.bolum === b) }));
  const ad = kayit ? adSoyadMetni(kayit) : '';
  return (
    <FormPenceresi
      acik={acik} kapat={kapat} form={form}
      baslik={baslik ?? (kayit ? `${ad}: ${bolum === 'Ayrılış' && !kayit.cikisTarihi ? 'işten çıkış' : bolum ?? 'düzenle'}` : 'Yeni personel')}
    >
      {gruplar.map((g) => (
        <fieldset key={g.b} className="tc-ikp-form-bolum">
          {gruplar.length > 1 && <legend>{g.b}</legend>}
          <div className="tc-ikp-form-alanlar">
            {g.alanlar.map((f) => (
              <AlanGirdisi key={f.k} f={f} deger={form.degerler[f.k]} degistir={(v) => { degistir(f.k, v); }} hata={form.hata(f.k)} b={baglam} />
            ))}
          </div>
        </fieldset>
      ))}
    </FormPenceresi>
  );
}

// Parçalar arası bileşen (sözleşme): İşe alım "İşe al" ön dolu açar; kayıttan sonrası çağıranındır.
export interface PersonelFormuOzellikleri { acik: boolean; onDolu: Partial<Personel>; kapat: () => void; kaydedildi: (p: Personel) => void }
export function PersonelFormu({ acik, onDolu, kapat, kaydedildi }: PersonelFormuOzellikleri) {
  const { data: depo } = useIkDeposu();
  const motor = useMemo(() => (depo ? motorKur([...depo.kayitlar.values()], depo.ayarlar) : null), [depo]);
  if (!depo) return null;
  return <PersonelFormPenceresi acik={acik} depo={depo} motor={motor} kayit={null} bolum={null} onDolu={onDolu} kapat={kapat} kaydedildi={kaydedildi} />;
}
