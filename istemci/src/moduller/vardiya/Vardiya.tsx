import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { IstasyonSecimiCevabi, MakinelerCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { CalismaTakvimiCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { DurumKutusu, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { anMetni, haftaGunuAdi, saat, tarihEkle, tarihMetni, yerelGun } from './gosterim.ts';
import { useVardiyaYaz } from './komut.ts';
import { TarihGirdisi } from './ZamanAlani.tsx';
import { VardiyaDuzeni } from './VardiyaDuzeni.tsx';
import { usePersonel, useTakvim, useYazabilir } from './veri.ts';
import './vardiya.css';

export { PersonelEkrani } from './Personel.tsx';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/vardiya.ts); her bölüm kendi adresindedir.

export function VardiyaEkrani() {
  const takvim = useTakvim();
  const yaz = useYazabilir();
  const y = useVardiyaYaz();
  if (takvim.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takvim.isError) return <DurumKutusu durum="hata" yenile={() => { void takvim.refetch(); }} />;
  return <VardiyaDuzeni t={takvim.data} yaz={yaz} y={y} />;
}

const GUN_SAYISI = 14;

export function TakvimEkrani() {
  const takvim = useTakvim();
  const personel = usePersonel();
  // Liste okunamazsa (yetki ya da hata) ilgili seçenekler eksik kalır; iş merkezi ve personel seçimi etkilenmez.
  // /makineler yalnız istasyon sayfasını görene ya da istasyon yazana açıktır; yetkisiz kişide istek atılmaz.
  const islemler = useOturum().data?.islemler;
  const makineOkur = islemler?.some((i) => i === 'sayfa.istasyonlar' || i === 'istasyonlar.yaz') ?? false;
  const istasyonlar = useQuery({ queryKey: anahtarlar.istasyonSecimi, queryFn: () => api.get<IstasyonSecimiCevabi>('/istasyonlar/secim'), retry: false });
  const makineler = useQuery({ queryKey: anahtarlar.makineler, queryFn: () => api.get<MakinelerCevabi>('/makineler'), retry: false, enabled: makineOkur });
  const [secilen, kaynakYaz] = useState('');
  const [baslangic, baslangicYaz] = useState('');
  const bugun = takvim.data?.bugun ?? '';
  // Seçim yapılmadan ilk aktif iş merkezinin takvimi açılır; boş sayfa ile karşılanılmaz.
  const ilkMerkez = takvim.data?.isMerkezleri.find((m) => m.aktif);
  const kaynak = secilen || (ilkMerkez ? `is-merkezi:${String(ilkMerkez.id)}` : '');
  const bas = baslangic || bugun;
  const [tur, id] = kaynak.split(':');
  const secili = tur !== undefined && id !== undefined && bas !== '';
  const bitis = bas ? tarihEkle(bas, GUN_SAYISI - 1) : '';
  const okuma = useQuery({
    queryKey: anahtarlar.kaynakTakvimi(tur ?? '', Number(id), bas, bitis),
    queryFn: () => api.get<CalismaTakvimiCevabi>(`/calisma-takvimi?tur=${tur ?? ''}&id=${id ?? ''}&baslangic=${bas}&bitis=${bitis}`),
    enabled: secili,
  });
  if (takvim.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takvim.isError) return <DurumKutusu durum="hata" yenile={() => { void takvim.refetch(); }} />;
  const secenekler = [
    ...takvim.data.isMerkezleri.map((m) => ({ deger: `is-merkezi:${String(m.id)}`, baslik: `İş merkezi: ${m.kod} ${m.ad}` })),
    ...(istasyonlar.data?.gruplar ?? []).flatMap((g) => g.istasyonlar.map((i) => ({ deger: `istasyon:${String(i.id)}`, baslik: `İstasyon: ${i.kod} ${i.ad}` }))),
    ...(makineler.data?.makineler ?? []).filter((m) => m.aktif).map((m) => ({ deger: `makine:${String(m.id)}`, baslik: `Makine: ${m.kod} ${m.ad}` })),
    ...(personel.data?.personel ?? []).map((p) => ({ deger: `kisi:${String(p.kisiId)}`, baslik: `Personel: ${p.ad}` })),
  ];
  const t = okuma.data?.takvim;
  return (
    <div className="tc-vr-sayfa">
      <section className="tc-vr-panel" aria-label="Çalışma takvimi">
        <h3>Çalışma takvimi</h3>
        <div className="tc-vr-satir">
          <Secim etiket="Kaynak" value={kaynak} secenekler={secenekler} bosSecenek={ilkMerkez ? undefined : 'Seçiniz'} onChange={(e) => kaynakYaz(e.target.value)} />
          <label className="tc-vr-etiket">Başlangıç
            <TarihGirdisi deger={bas} degistir={baslangicYaz} />
          </label>
        </div>
        {!secili ? <p className="tc-vr-ipucu">Takvimini görmek için bir iş merkezi, istasyon, makine ya da personel seç. Plan aynı takvimi makine ve kişi için okur.</p>
          : okuma.isPending ? <DurumKutusu durum="yukleniyor" />
            : okuma.isError ? <DurumKutusu durum="hata" yenile={() => { void okuma.refetch(); }} />
              : t === null || t === undefined ? <DurumKutusu durum="bos" mesaj="Bu kaynak bir iş merkezine bağlı değil; takvimi yok." />
                : (
                  <div className="tc-vr-matris-kap">
                  <table className="tc-vr-takvim">
                    <thead><tr><th>Tarih</th><th>Gün</th><th>Net</th><th>Çalışma aralıkları</th></tr></thead>
                    <tbody>
                      {t.gunler.map((g) => {
                        const araliklar = t.araliklar.filter((a) => yerelGun(a.baslangic) === g.tarih);
                        return (
                          <tr key={g.tarih} className={g.kapali ? 'tc-vr-gecmis' : undefined}>
                            <td>{tarihMetni(g.tarih)}</td><td>{haftaGunuAdi(g.tarih)}</td><td className="tc-vr-sayi">{g.dakika > 0 ? `${saat(g.dakika)} sa` : '–'}</td>
                            <td>{g.kapali ? (g.kapali.ad ?? (g.kapali.tur === 'tatil' ? 'Tatil' : 'Kapalı'))
                              : araliklar.map((a) => `${anMetni(a.baslangic, g.tarih)}–${anMetni(a.bitis, g.tarih)}`).join(', ') || 'Vardiya yok'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                )}
      </section>
    </div>
  );
}
