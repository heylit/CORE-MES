import { useEffect, useMemo, useState } from 'react';
import { CokSatir, Dugme, DurumKutusu, FormPenceresi, Girdi, OnayPenceresi, Pencere, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { adSoyad, kisaTarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import type { Izin } from '../tipler.ts';
import { useIkKomutu, useIzinGunu, yeniKimlik } from '../veri.ts';
import { bakiye, gunSay, listeler, type Listeler } from './hesap.ts';
import { bakiyeAsimi, izinDenetle, sayiYaz, YILLIK_IZIN } from './kurallar.ts';

interface Degerler { empId: string; tur: string; baslangic: string; bitis: string; gun: string; durum: string; vekil: string; aciklama: string }

const degerler = (k: Izin | null, on: Partial<Izin>): Degerler => {
  const v: Partial<Izin> = { tur: YILLIK_IZIN, durum: 'Beklemede', ...on, ...k };
  return {
    empId: v.empId ?? '', tur: v.tur ?? '', baslangic: v.baslangic ?? '', bitis: v.bitis ?? '', gun: v.gun === undefined ? '' : String(v.gun),
    durum: v.durum ?? '', vekil: v.vekil ?? '', aciklama: v.aciklama ?? '',
  };
};
const secenek = (l: readonly string[]) => l.map((t) => ({ deger: t, baslik: t }));

export interface IzinFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Izin | null; onDolu: Partial<Izin>; kapat: () => void }

// Pencere her acilista bastan kurulur: form ilk degerini acilistaki kayittan alir. Secenek listeleri motordan gelir.
export function IzinFormu(z: IzinFormuOzellikleri) {
  if (!z.acik) return null;
  const l = listeler();
  if (!l) return <Pencere acik kapat={z.kapat} baslik={z.kayit ? 'İzin düzenle' : 'Yeni izin'} tur="yan"><DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} /></Pencere>;
  return <IzinFormuIcerigi {...z} listeler={l} />;
}

// Gun sayisi tarih ve ture gore onerilir; is gunuyle sayilan izinde oneri sunucunun hesabindandir (Soru 74). Kayit cakisma ve
// ise giris denetiminden gecer; yillik izinde kalan asilirsa uyari verir, kaydi durdurmaz.
function IzinFormuIcerigi({ o, kayit, onDolu, kapat, listeler: l }: IzinFormuOzellikleri & { listeler: Listeler }) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const personeller = useMemo(() => [...o.depo.tur('emp')].sort((a, b) => adSoyad(a).localeCompare(adSoyad(b), 'tr')), [o.depo]);
  const kisiSecenekleri = personeller.map((p) => ({ deger: p.id, baslik: adSoyad(p) }));
  const kisi = (id: string) => personeller.find((p) => p.id === id) ?? null;
  const [oneriIste, oneriIsteYaz] = useState(false);
  const [silSor, silSorYaz] = useState(false);
  const isGunuIle = (tur: string) => l.isGunuIzinleri.includes(tur);

  const kayitKur = (d: Degerler): Izin => {
    const gun = d.gun === '' ? (o.motor && d.baslangic && d.bitis ? gunSay(o.motor, d.baslangic, d.bitis, isGunuIle(d.tur)) : undefined) : Number(d.gun.replace(',', '.'));
    const { vekil: _vekil, gun: _gun, ...onceki } = kayit ?? { id: yeniKimlik('leave'), kind: 'leave' as const };
    return {
      ...onceki, empId: d.empId, tur: d.tur, baslangic: d.baslangic, bitis: d.bitis, durum: d.durum, aciklama: d.aciklama,
      ...(gun === undefined ? {} : { gun }), ...(d.vekil ? { vekil: d.vekil } : {}),
    };
  };

  const form = useForm<Degerler>({
    ilk: degerler(kayit, onDolu),
    hataIletisi: 'İzin kaydedilemedi.',
    dogrula: (d) => {
      const h: Record<string, string> = {};
      for (const x of izinDenetle(kayitKur(d), o.depo.tur('leave'), kisi(d.empId), kisaTarih)) h[x.alan] ??= x.ileti;
      return h;
    },
    kaydet: async (d) => {
      const yeni = kayitKur(d);
      const p = kisi(d.empId);
      if (o.motor && p) {
        const kalan = bakiyeAsimi(yeni, kayit, bakiye(o.motor, p).kalan);
        if (kalan !== null) bildir('hata', `Uyarı: ${adSoyad(p)} için kalan yıllık izin ${sayiYaz(kalan)} gün.`);
      }
      await komut.kaydet(yeni);
    },
    basarili: () => { bildir('tamam', kayit ? 'Değişiklikler kaydedildi.' : 'Kaydedildi.'); kapat(); },
  });
  const d = form.degerler;

  // Sunucunun is gunu onerisi yalniz kullanici tarih ya da tur degistirince formu gunceller (acilista kayitli gun korunur).
  const tarihlerTamam = d.empId !== '' && d.baslangic !== '' && d.bitis !== '' && d.bitis >= d.baslangic;
  const sunucu = useIzinGunu(oneriIste && isGunuIle(d.tur) && tarihlerTamam ? d.empId : null, d.baslangic || null, d.bitis || null);
  const sunucuGunu = sunucu.data?.isGunu ?? null;
  useEffect(() => { if (oneriIste && sunucuGunu !== null) form.degistir({ gun: String(sunucuGunu) }); }, [sunucuGunu]);

  const tarihDegistir = (yama: Partial<Degerler>) => {
    const y = { ...d, ...yama };
    const gun = o.motor && y.baslangic && y.bitis && y.bitis >= y.baslangic ? String(gunSay(o.motor, y.baslangic, y.bitis, isGunuIle(y.tur))) : y.gun;
    oneriIsteYaz(true);
    form.degistir({ ...yama, gun });
  };

  const secili = kisi(d.empId);
  const kalanIpucu = o.motor && secili ? `Kalan yıllık izin: ${sayiYaz(bakiye(o.motor, secili).kalan)} gün` : undefined;

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
      <FormPenceresi acik kapat={kapat} baslik={kayit ? 'İzin düzenle' : 'Yeni izin'} form={form}>
        <Secim etiket="Çalışan" required bosSecenek="Seçin" secenekler={kisiSecenekleri} ipucu={kalanIpucu} {...form.alan('empId')} />
        <Secim etiket="İzin türü" required secenekler={secenek(l.izinTurleri)}
          name="tur" value={d.tur} hata={form.hata('tur')} onChange={(e) => { tarihDegistir({ tur: e.target.value }); }} />
        <Girdi etiket="Başlangıç" type="date" required name="baslangic" value={d.baslangic} hata={form.hata('baslangic')} onChange={(e) => { tarihDegistir({ baslangic: e.target.value }); }} />
        <Girdi etiket="Bitiş" type="date" required name="bitis" value={d.bitis} hata={form.hata('bitis')} onChange={(e) => { tarihDegistir({ bitis: e.target.value }); }} />
        <Girdi etiket="Gün sayısı" type="number" inputMode="decimal" min={0} step="0.5" {...form.alan('gun')}
          ipucu="Yıllık ve mazeret izninde iş günü, diğerlerinde takvim günü olarak hesaplanır; değiştirebilirsiniz." />
        <Secim etiket="Durum" secenekler={secenek(l.izinDurumlari)} {...form.alan('durum')} />
        <Secim etiket="Yerine bakacak kişi" bosSecenek="Seçin" secenekler={kisiSecenekleri} {...form.alan('vekil')} />
        <CokSatir etiket="Açıklama" {...form.alan('aciklama')} />
        {kayit && <Dugme tur="tehlike" simge="trash" onClick={() => { silSorYaz(true); }}>Sil</Dugme>}
      </FormPenceresi>
      <OnayPenceresi acik={silSor} baslik="İzin silinsin mi?" onayMetni="Sil" tehlikeli yukleniyor={komut.calisiyor}
        onayla={() => { void sil(); }} vazgec={() => { silSorYaz(false); }}>
        <p>Kayıt silinecek. Hemen ardından çıkan “Geri al” düğmesiyle geri getirebilirsiniz.</p>
      </OnayPenceresi>
    </>
  );
}
