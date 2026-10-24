import { useCallback, useState, type ReactNode } from 'react';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import { OnayPenceresi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { PersonelFormu } from '../personel/index.tsx';
import type { Aday, Gorusme, Kayit, KayitTurleri, Personel, Pozisyon } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { KayitFormu, type KayitFormuOzellikleri } from './formlar.tsx';
import { adayAdi, adayGorusmeleri, gorusmeSonrasiAsama, gunEkle, komsuAsama, satirlar } from './kurallar.ts';
import { bugun, type Hazirlik } from './ortak.tsx';

// İşe alım sayfası, aday ve pozisyon sayfalarının ortak işlemleri (çerçevedeki cand-*, intv-*, job-* eylemleri).

type FormTuru = 'job' | 'cand' | 'intv';
type FormIstegi = {
  [T in FormTuru]: Pick<KayitFormuOzellikleri<T>, 'tur' | 'kayit' | 'baslik'> &
    Partial<Pick<KayitFormuOzellikleri<T>, 'onDolu' | 'bolumler' | 'ust' | 'oncesi' | 'sonra' | 'silindi' | 'silMetni' | 'kaydetMetni'>>
}[FormTuru];

interface Onay { baslik: string; ileti: string; onayMetni: string; yap: () => Promise<void> }

export interface IseAlimIslemleri {
  yazabilir: boolean;
  gorusmePlanla(adayId?: string): void;
  gorusmeDegerlendir(g: Gorusme): void;
  gorusmeDuzenle(g: Gorusme): void;
  adayEkle(onDolu?: Partial<Aday>, bolumler?: readonly string[]): void;
  adayDuzenle(c: Aday, bolum: string): void;
  adayAsama(c: Aday, asama: string): void;
  adayTasi(c: Aday, yon: -1 | 1): void;
  adayReddet(c: Aday): void;
  adaySil(c: Aday): void;
  iseAl(c: Aday): void;
  pozisyonAc(onDolu?: Partial<Pozisyon>): void;
  pozisyonDuzenle(j: Pozisyon): void;
  kaydet(k: Kayit, ileti?: string): Promise<boolean>;
  onayIste(o: Onay): void;
  ciz: ReactNode;
}

export function useIseAlimIslemleri(o: IkEkranOzellikleri, h: Hazirlik): IseAlimIslemleri {
  const { depo, yetki, git } = o;
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [form, formYaz] = useState<FormIstegi | null>(null);
  const [onay, onayYaz] = useState<Onay | null>(null);
  const [iseAlinan, iseAlinanYaz] = useState<Aday | null>(null);

  const hata = useCallback((e: unknown) => {
    // Eski sürüm iletisini komut kendisi verir; öbür hatalar burada.
    if (e instanceof ApiHatasi && eskiSurumMu(e.govde)) return;
    bildir('hata', hataIletisi(e, 'İşlem yapılamadı.'));
  }, [bildir]);

  const kaydet = useCallback(async (k: Kayit, ileti?: string): Promise<boolean> => {
    try {
      await komut.kaydet(k);
      if (ileti) bildir('tamam', ileti);
      return true;
    } catch (e) { hata(e); return false; }
  }, [komut, bildir, hata]);

  const planliGorusmeleriIptal = async (adayId: string): Promise<number> => {
    const planli = adayGorusmeleri(depo.tur('intv'), adayId).filter((i) => i.durum === 'Planlandı');
    for (const i of planli) await komut.kaydet({ ...i, durum: 'İptal' });
    return planli.length;
  };

  const ac = (f: FormIstegi) => { formYaz(f); };

  const islemler: Omit<IseAlimIslemleri, 'ciz'> = {
    yazabilir: yetki.iseAlimYaz,
    gorusmePlanla: (adayId) => {
      ac({
        tur: 'intv', kayit: null, baslik: 'Görüşme planla', bolumler: ['Planlama'], onDolu: adayId ? { candId: adayId } : {},
        sonra: async (g) => {
          const c = depo.al(g.candId);
          if (c?.kind !== 'cand') return;
          const hedef = gorusmeSonrasiAsama(c as Aday, g.tur, h.s.STAGES);
          if (hedef) await kaydet({ ...c, asama: hedef }, `${adayAdi(c as Aday)} “${hedef}” aşamasına taşındı.`);
        },
      });
    },
    gorusmeDegerlendir: (g) => {
      const c = depo.al(g.candId) as Aday | null;
      const j = depo.al(c?.jobId) as Pozisyon | null;
      const sorular = satirlar(j?.mulakatSorulari);
      const kisiler = (g.gorusmeciler ?? []).map((id) => h.m.adi(id));
      ac({
        tur: 'intv', kayit: g, bolumler: ['Değerlendirme'], baslik: `Değerlendirme: ${adayAdi(c)}, ${g.tur ?? 'Görüşme'}`,
        ust: (
          <div className="tc-ika-form-ust">
            <p className="tc-ika-not">{[g.tarih, g.saat].filter(Boolean).join(', ')}{kisiler.length ? `. Görüşmeci: ${kisiler.join(', ')}` : ''}</p>
            {sorular.length > 0 && (
              <details className="tc-ika-sorular">
                <summary>{j?.baslik ?? 'Pozisyon'} için mülakat soru seti ({sorular.length})</summary>
                <ol>{sorular.map((s) => <li key={s}>{s}</li>)}</ol>
              </details>
            )}
          </div>
        ),
        oncesi: (d) => ({ ...d, durum: !d.durum || d.durum === 'Planlandı' ? 'Tamamlandı' : d.durum, degerlendirmeTarihi: bugun() }),
      });
    },
    gorusmeDuzenle: (g) => { ac({ tur: 'intv', kayit: g, baslik: 'Görüşmeyi düzenle' }); },
    adayEkle: (onDolu = {}, bolumler) => {
      ac({
        tur: 'cand', kayit: null, baslik: bolumler ? 'Başvuru ekle' : 'Aday ekle', onDolu, ...(bolumler ? { bolumler } : {}),
        sonra: (c) => { git('aday', c.id); },
      });
    },
    adayDuzenle: (c, bolum) => { ac({ tur: 'cand', kayit: c, bolumler: [bolum], baslik: `${adayAdi(c)}: ${bolum}` }); },
    adayAsama: (c, asama) => {
      if (asama === (c.asama || 'Başvuru')) return;
      if (asama === 'İşe alındı') { iseAlinanYaz(c); return; }
      void kaydet({ ...c, asama }, `${adayAdi(c)}: ${asama}`);
    },
    adayTasi: (c, yon) => { void kaydet({ ...c, asama: komsuAsama(c, yon, h.s.STAGES) }); },
    adayReddet: (c) => {
      ac({
        tur: 'cand', kayit: c, bolumler: ['Karar'], baslik: `${adayAdi(c)}: adayı reddet`,
        oncesi: (d) => ({ ...d, asama: 'Reddedildi', redTarihi: bugun() }),
        sonra: async () => {
          try {
            const n = await planliGorusmeleriIptal(c.id);
            if (n) bildir('bilgi', `${n} planlı görüşme iptal edildi.`);
          } catch (e) { hata(e); }
        },
      });
    },
    adaySil: (c) => {
      const gs = adayGorusmeleri(depo.tur('intv'), c.id);
      onayYaz({
        baslik: `${adayAdi(c)} silinsin mi?`, ileti: `Aday kaydı ve ${gs.length} görüşme kaydı silinir.`, onayMetni: 'Adayı sil',
        yap: async () => {
          const once: Kayit[] = [{ ...c }, ...gs.map((g) => ({ ...g }))];
          for (const g of gs) await komut.iptal(g.id);
          await komut.iptal(c.id);
          git('isealim');
          bildir('tamam', 'Aday silindi.', {
            eylem: { etiket: 'Geri al', yap: () => { void komut.topluKaydet(once).then(() => { bildir('tamam', 'Aday geri getirildi.'); }, hata); } },
          });
        },
      });
    },
    iseAl: (c) => { iseAlinanYaz(c); },
    pozisyonAc: (onDolu = {}) => {
      ac({
        tur: 'job', kayit: null, baslik: 'Pozisyon aç', onDolu: { sonBasvuru: gunEkle(bugun(), 30), ...onDolu },
        sonra: (j) => { git('pozisyon', j.id); bildir('tamam', 'Pozisyon oluşturuldu. İlan metnini kontrol edip kanallara yayınlayın.'); },
      });
    },
    pozisyonDuzenle: (j) => {
      const n = depo.tur('cand').filter((c) => c.jobId === j.id).length;
      ac({
        tur: 'job', kayit: j, baslik: `${j.baslik ?? 'Pozisyon'}: düzenle`, silindi: () => { git('isealim'); },
        silMetni: { baslik: `${j.baslik ?? 'Pozisyon'} silinsin mi?`, ileti: `Pozisyon ve ilan bilgileri silinir.${n ? ` ${n} aday kaydı silinmez ancak pozisyon bağlantısı kalkar.` : ''}` },
      });
    },
    kaydet,
    onayIste: (x) => { onayYaz(x); },
  };

  const iseAlinanPozisyon = iseAlinan ? (depo.al(iseAlinan.jobId) as Pozisyon | null) : null;
  const gun = bugun();
  const ciz = (
    <>
      {form && (
        <KayitFormu
          {...(form as KayitFormuOzellikleri<FormTuru>)} acik kapat={() => { formYaz(null); }} depo={depo} m={h.m} s={h.s}
        />
      )}
      <OnayPenceresi
        acik={onay !== null} baslik={onay?.baslik ?? ''} onayMetni={onay?.onayMetni ?? 'Onayla'} tehlikeli yukleniyor={komut.calisiyor}
        onayla={() => { if (onay) void onay.yap().then(() => { onayYaz(null); }, (e: unknown) => { onayYaz(null); hata(e); }); }}
        vazgec={() => { onayYaz(null); }}
      >
        <p>{onay?.ileti}</p>
      </OnayPenceresi>
      {iseAlinan && (
        <PersonelFormu
          acik kapat={() => { iseAlinanYaz(null); }}
          onDolu={{
            ad: iseAlinan.ad ?? '', soyad: iseAlinan.soyad ?? '', telefon: iseAlinan.telefon ?? '', kisiselEposta: iseAlinan.eposta ?? '',
            il: iseAlinan.il ?? '', pozisyon: iseAlinanPozisyon?.baslik ?? '', departmanId: iseAlinanPozisyon?.departmanId ?? '',
            iseGiris: iseAlinan.baslayabilir && iseAlinan.baslayabilir > gun ? iseAlinan.baslayabilir : gun,
            ...(iseAlinan.teklifUcret ?? iseAlinan.maasBeklentisi ? { brutMaas: iseAlinan.teklifUcret ?? iseAlinan.maasBeklentisi } : {}),
            egitim: iseAlinan.egitim ?? '', okul: iseAlinan.okul ?? '', yabanciDil: iseAlinan.yabanciDil ?? '',
          }}
          kaydedildi={(p: Personel) => {
            const c = iseAlinan;
            iseAlinanYaz(null);
            void (async () => {
              try {
                const guncel = (depo.al(c.id) as Aday | null) ?? c;
                await komut.kaydet({ ...guncel, asama: 'İşe alındı', empId: p.id, iseAlimTarihi: p.iseGiris ?? gun, teklifYanit: 'Kabul etti' } satisfies KayitTurleri['cand']);
                await planliGorusmeleriIptal(c.id);
                bildir('tamam', 'Aday personele dönüştürüldü.');
                git('calisan', p.id);
              } catch (e) { hata(e); }
            })();
          }}
        />
      )}
    </>
  );
  return { ...islemler, ciz };
}
