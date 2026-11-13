import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dugme, DurumKutusu, Pencere, type MenuOgesi } from '../../../../ortak/arayuz/index.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { RrSaglayici } from '../ReceteRotaYeni.tsx';
import { SEKMELER, type SekmeAnahtari } from '../sekmeler.ts';
import { anahtarlar, useRrVerisi, type RrVerisi } from '../veri.ts';
import { useRrYetkisi } from '../yetki.ts';
import { EmirAdimBolumu, EmirIslemDugmeleri, EmirMalzemeBolumu } from './EmirAyrintisi.tsx';
import { EmirExcelMenusu, ExcelMenusu, type ExcelPenceresiTuru } from './ExcelGirisi.tsx';
import { useEmirKomutu } from './komut.ts';
import { YeniEmirFormu } from './UretimEmirleri.tsx';
import './emirler.css';

// Üretim emrinin ana yeri Üretim Emirleri'dir (3003 a): emir orada açılır ve yönetilir. Form, plan ve işlemler bu modülün köprüsüyle
// çalışır (rota, plan ve komut sırası burada); Üretim Emirleri bunları disari.ts'ten çizer. Yetki aynıdır: emir açma rotalı üründe
// rota.emre-kopyala, rotasızda uretim-emirleri.rotasiz-ac; asıl denetim sahiplerin ucundadır.

// Başka bölüme geçiş (ör. "Rotasını kur") Reçete ve Rota'nın o sekmesini açar.
function useSekmeyeGit() {
  const yonlen = useNavigate();
  return (anahtar: SekmeAnahtari) => {
    const hedef = SEKMELER.find((s) => s.anahtar === anahtar);
    if (hedef) void yonlen(hedef.yol);
  };
}

// Sayfa başına tek köprü: düğme, Excel ve işlemler aynı kaynak sürümleriyle ve aynı komut sırasıyla çalışır.
// Köprü oturumdaki işlemlerle kurulur: oturum gelmeden çizilmez.
export function EmirAlani({ children }: { children: ReactNode }) {
  return useYetki().hazir ? <RrSaglayici>{() => children}</RrSaglayici> : null;
}

export interface EmirAcmaOzellikleri {
  // Pencere açık mı; kapat ve açılınca emrin kayıt numarası (Üretim Emirleri ayrıntısının adresi).
  acik: boolean;
  kapat: () => void;
  ilkUrun: string | null;
}

export function YeniEmirPenceresi({ acik, kapat, ilkUrun }: EmirAcmaOzellikleri) {
  const yetki = useRrYetkisi();
  const veri = useRrVerisi(acik && yetki.oku);
  const komut = useEmirKomutu();
  const istemci = useQueryClient();
  const yonlen = useNavigate();
  const sekmeyeGit = useSekmeyeGit();
  const d = veri.data?.durum;
  const acildi = (id: string) => {
    const kayitNo = istemci.getQueryData<RrVerisi>(anahtarlar.veri)?.durum.emirler?.orders.find((x) => x.id === id)?.kayitNo;
    kapat();
    void yonlen(kayitNo === undefined ? '/uretim-emirleri' : `/uretim-emirleri/${String(kayitNo)}`);
  };
  return (
    <Pencere acik={acik} kapat={kapat} baslik="Yeni üretim emri">
      {veri.isPending && <DurumKutusu durum="yukleniyor" />}
      {veri.isError && <DurumKutusu durum="hata" mesaj="Ürün ve rota listesi alınamadı." yenile={() => { void veri.refetch(); }} />}
      {d && !d.emirler && <DurumKutusu durum="bos" mesaj="Üretim emirlerini okuma yetkiniz yok; emir açılamaz." />}
      {d?.emirler && (
        <div className="tc-rr3" data-parca="R3">
          {komut.uyari && (
            <div className="tc-rr3-uyari-kutu" role="alert">
              <b>İşlem yapılamadı.</b>
              <span>{komut.uyari.metin}</span>
              <Dugme onClick={komut.uyariKapat}>Tamam</Dugme>
            </div>
          )}
          <YeniEmirFormu durum={d} yetki={yetki} komut={komut} git={(a) => { kapat(); sekmeyeGit(a); }} ilkUrun={ilkUrun} acildi={acildi} />
        </div>
      )}
    </Pencere>
  );
}

// Bu dosyanın bileşenleri EmirAlani içinde çizilir.

// Excel'den toplu emir açma ve güncelleme de emrin ana yerindedir.
export function EmirExcelDugmesi() {
  const yetki = useRrYetkisi();
  const [pencere, setPencere] = useState<ExcelPenceresiTuru | null>(null);
  const veri = useRrVerisi(pencere !== null && yetki.oku);
  const d = veri.data?.durum;
  if (!(yetki.rotaEmreKopyala || yetki.emirDuzenle)) return null;
  return (
    <>
      <ExcelMenusu acabilir={yetki.rotaEmreKopyala} guncelleyebilir={yetki.emirDuzenle} sec={setPencere} />
      {pencere !== null && d?.emirler && (
        <EmirExcelMenusu durum={d} acabilir={yetki.rotaEmreKopyala} guncelleyebilir={yetki.emirDuzenle} acilis={pencere} kapandi={() => { setPencere(null); }} />
      )}
    </>
  );
}

// Emir sayfasının (Üretim Emirleri) parçaları (3039): başlıktaki işlemler, "Adımlar" ve "Malzeme" sekmeleri. Hepsi aynı köprüyle çalışır.
export type EmirParcasiTuru = 'islemler' | 'adimlar' | 'malzeme';
// Adım satırının sağı Üretim Emirleri'nden gelir (statü, iç/fason); verilmezse satır kendi durum rozetini gösterir.
export type SatirEki = (opNo: number, yedek: ReactNode) => ReactNode;

// ekOgeler: Üretim Emirleri'nin kendi işlemleri (3050 a "Beklet"); "İşlemler" menüsüne girer.
export function EmirParcasi({ kayitNo, parca, satirEki, ekOgeler }: { kayitNo: number; parca: EmirParcasiTuru; satirEki?: SatirEki; ekOgeler?: readonly MenuOgesi[] }) {
  const yetki = useRrYetkisi();
  const veri = useRrVerisi(yetki.oku);
  const komut = useEmirKomutu();
  const yonlen = useNavigate();
  const sekmeyeGit = useSekmeyeGit();
  const d = veri.data?.durum;
  if (!yetki.oku) return null;
  if (veri.isPending) return parca === 'islemler' ? null : <DurumKutusu durum="yukleniyor" />;
  if (veri.isError) return parca === 'islemler' ? null : <DurumKutusu durum="hata" mesaj="Emrin adımları alınamadı." yenile={() => { void veri.refetch(); }} />;
  const emir = d?.emirler?.orders.find((x) => x.kayitNo === kayitNo) ?? null;
  if (!d || !emir) return null;
  const kayitNoBul = (id: string) => d.emirler?.orders.find((x) => x.id === id)?.kayitNo;
  const ortak = {
    durum: d, emir, yetki, komut, git: sekmeyeGit,
    emirAc: (id: string) => { const k = kayitNoBul(id); if (k !== undefined) void yonlen(`/uretim-emirleri/${String(k)}`); },
  };
  const uyari = komut.uyari && (
    <div className="tc-rr3-uyari-kutu" role="alert">
      <b>{komut.uyari.eskiSurum ? 'Emir başka yerde değişti.' : 'İşlem yapılamadı.'}</b>
      <span>{komut.uyari.metin}{komut.uyari.eskiSurum ? ' Ekran güncel emirle yenilendi; işlemi yeniden yapın.' : ''}</span>
      <Dugme onClick={komut.uyariKapat}>Tamam</Dugme>
    </div>
  );
  if (parca === 'islemler') return <>{uyari}<EmirIslemDugmeleri {...ortak} ekOgeler={ekOgeler} /></>;
  return (
    <div className="tc-rr3" data-parca="R3">
      {uyari}
      {parca === 'adimlar' ? <EmirAdimBolumu {...ortak} satirEki={satirEki} /> : <EmirMalzemeBolumu {...ortak} />}
    </div>
  );
}
