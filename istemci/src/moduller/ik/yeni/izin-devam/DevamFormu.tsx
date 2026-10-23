import { useMemo, useState } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { CokSatir, Dugme, DurumKutusu, FormPenceresi, Girdi, OnayPenceresi, Pencere, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { adSoyad } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import type { Devam } from '../tipler.ts';
import { useIkKomutu, yeniKimlik } from '../veri.ts';
import { listeler, type Listeler } from './hesap.ts';

interface Degerler { empId: string; tarih: string; tur: string; saat: string; onay: string; aciklama: string }
const ONAYLAR = ['Onaylandı', 'Beklemede'];

const degerler = (k: Devam | null, on: Partial<Devam>): Degerler => {
  const v: Partial<Devam> = { tarih: tesisGunu(Date.now()), tur: 'Fazla mesai', onay: 'Onaylandı', ...on, ...k };
  return { empId: v.empId ?? '', tarih: v.tarih ?? '', tur: v.tur ?? '', saat: v.saat === undefined ? '' : String(v.saat), onay: v.onay ?? '', aciklama: v.aciklama ?? '' };
};

export interface DevamFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Devam | null; onDolu: Partial<Devam>; kapat: () => void }

// Pencere her acilista bastan kurulur: form ilk degerini acilistaki kayittan alir. Kayit turleri motordan gelir.
export function DevamFormu(z: DevamFormuOzellikleri) {
  if (!z.acik) return null;
  const l = listeler();
  if (!l) return <Pencere acik kapat={z.kapat} baslik={baslik(z.kayit)} tur="yan"><DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} /></Pencere>;
  return <DevamFormuIcerigi {...z} listeler={l} />;
}
const baslik = (k: Devam | null) => (k ? 'Devam / mesai kaydı düzenle' : 'Yeni devam / mesai kaydı');

// Devam ve mesai kaydi. Onay alani oneridir: kaydi giren kendi onayini veremez, sunucu gerekirse "Beklemede" yazar (IK-77).
function DevamFormuIcerigi({ o, kayit, onDolu, kapat, listeler: l }: DevamFormuOzellikleri & { listeler: Listeler }) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [silSor, silSorYaz] = useState(false);
  const kisiler = useMemo(() => [...o.depo.tur('emp')].sort((a, b) => adSoyad(a).localeCompare(adSoyad(b), 'tr')).map((p) => ({ deger: p.id, baslik: adSoyad(p) })), [o.depo]);

  const form = useForm<Degerler>({
    ilk: degerler(kayit, onDolu),
    hataIletisi: 'Kayıt kaydedilemedi.',
    dogrula: (d) => {
      const h: Record<string, string> = {};
      for (const k of ['empId', 'tarih', 'tur'] as const) if (!d[k]) h[k] = 'Bu alan zorunlu.';
      return h;
    },
    kaydet: (d) => {
      // Bos sure alani kayitta yer almaz (sifir yazilmaz).
      const { saat: _saat, ...onceki } = kayit ?? { id: yeniKimlik('att'), kind: 'att' as const };
      return komut.kaydet({
        ...onceki, empId: d.empId, tarih: d.tarih, tur: d.tur, onay: d.onay, aciklama: d.aciklama,
        ...(d.saat === '' ? {} : { saat: Number(d.saat.replace(',', '.')) }),
      });
    },
    basarili: () => { bildir('tamam', kayit ? 'Değişiklikler kaydedildi.' : 'Kaydedildi.'); kapat(); },
  });

  const sil = async () => {
    if (!kayit) return;
    const snap = kayit;
    silSorYaz(false);
    try {
      await komut.iptal(kayit.id);
    } catch (h) { bildir('hata', hataIletisi(h, 'Kayıt silinemedi.')); return; }
    kapat();
    bildir('tamam', 'Silindi.', {
      eylem: {
        etiket: 'Geri al',
        yap: () => { komut.kaydet(snap).then(() => { bildir('tamam', 'Kayıt geri getirildi.'); }, (h: unknown) => { bildir('hata', hataIletisi(h, 'Kayıt geri getirilemedi.')); }); },
      },
    });
  };

  return (
    <>
      <FormPenceresi acik kapat={kapat} baslik={baslik(kayit)} form={form}>
        <Secim etiket="Çalışan" required bosSecenek="Seçin" secenekler={kisiler} {...form.alan('empId')} />
        <Girdi etiket="Tarih" type="date" required {...form.alan('tarih')} />
        <Secim etiket="Kayıt türü" required secenekler={l.devamTurleri.map((t) => ({ deger: t, baslik: t }))} {...form.alan('tur')} />
        <Girdi etiket="Süre (saat)" type="number" inputMode="decimal" min={0} step="0.5" ipucu="Devamsızlıkta gün için 7,5 saat girebilirsiniz." {...form.alan('saat')} />
        <Secim etiket="Onay" secenekler={ONAYLAR.map((t) => ({ deger: t, baslik: t }))} {...form.alan('onay')} />
        <CokSatir etiket="Açıklama" {...form.alan('aciklama')} />
        {kayit && <Dugme tur="tehlike" simge="trash" onClick={() => { silSorYaz(true); }}>Sil</Dugme>}
      </FormPenceresi>
      <OnayPenceresi acik={silSor} baslik="Devam / mesai kaydı silinsin mi?" onayMetni="Sil" tehlikeli yukleniyor={komut.calisiyor}
        onayla={() => { void sil(); }} vazgec={() => { silSorYaz(false); }}>
        <p>Kayıt silinecek. Hemen ardından çıkan “Geri al” düğmesiyle geri getirebilirsiniz.</p>
      </OnayPenceresi>
    </>
  );
}
