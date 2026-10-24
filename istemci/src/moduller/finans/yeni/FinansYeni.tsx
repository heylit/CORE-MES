import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import { DurumKutusu, SayfaBasligi, Sekmeler } from '../../../ortak/arayuz/index.ts';
import { YeniEkranKapisi } from '../../../ortak/rota/yeni-ekran.tsx';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';
import type { AkisDegerleri, OlayTuru } from './akislar.ts';
import { KayitCekmecesi } from './KayitFormu.tsx';
import { EKRANLAR, SEKMELER, sekmeBul, VERISIZ, type SekmeAnahtari } from './sekmeler.ts';
import { useFinansVerisi, useFinansYetkisi, useGunlukSkor } from './veri.ts';
import './finans-yeni.css';

interface Cekmece {
  acik: boolean;
  tur: OlayTuru | null;
  ilk?: Partial<AkisDegerleri> | undefined;
}

// Yeni yol alıma kadar yalnız yöneticiye açıktır (ortak kapı); kullanıcılar bugünkü çerçevede çalışır.
export function FinansYeni() {
  return (
    <div className="tc-fy">
      <YeniEkranKapisi><FinansYeniIci /></YeniEkranKapisi>
    </div>
  );
}

function FinansYeniIci() {
  const { bolum } = useParams();
  const git = useNavigate();
  const izin = useYetki();
  const yetki = useFinansYetkisi();
  const veri = useFinansVerisi(yetki.oku);
  const [cekmece, setCekmece] = useState<Cekmece>({ acik: false, tur: null });
  useGunlukSkor(veri.finans, yetki.yaz);

  const gorunen = SEKMELER.filter((s) => izin.var(s.islem as Islem));
  const sekme = sekmeBul(bolum);
  if (!sekme) return <DurumKutusu durum="bos" mesaj="Bu bölüm bulunamadı." />;
  const acik = izin.var(sekme.islem as Islem);
  // Yalnız firma yetkisi olan kök adreste Firmalar'a düşer (bugünkü çerçevedeki gibi).
  const ilkGorunen = gorunen[0];
  if (bolum === undefined && !acik && ilkGorunen) return <Navigate to={ilkGorunen.yol} replace />;
  if (!acik) return <DurumKutusu durum="bos" mesaj={`${sekme.baslik} için yetkiniz yok.`} />;

  const Ekran = EKRANLAR[sekme.anahtar].ekran;
  const kayitGir = (tur?: OlayTuru, ilk?: Partial<AkisDegerleri>) => setCekmece({ acik: true, tur: tur ?? null, ilk });
  const veriBekler = yetki.oku && !VERISIZ.has(sekme.anahtar);

  return (
    <>
      <SayfaBasligi
        baslik={sekme.baslik}
        simge={sekme.simge}
        {...(yetki.yaz ? { birincil: { etiket: 'Kayıt gir', simge: 'plus', yap: () => kayitGir(), pasif: !veri.finans } } : {})}
      />
      {gorunen.length > 1 && (
        <Sekmeler<SekmeAnahtari>
          etiket="Finans bölümleri"
          sekmeler={gorunen.map((s) => ({ anahtar: s.anahtar, baslik: s.baslik, simge: s.simge }))}
          secili={sekme.anahtar}
          sec={(a) => { const s = SEKMELER.find((x) => x.anahtar === a); if (s) void git(s.yol); }}
        />
      )}
      <section className="tc-fy-icerik" aria-label={sekme.baslik}>
        {veriBekler && veri.isPending && <DurumKutusu durum="yukleniyor" />}
        {veriBekler && veri.isError && (
          <DurumKutusu durum="hata" mesaj={hataIletisi(veri.error, 'Finans verisi alınamadı')} yenile={() => { void veri.refetch(); }} />
        )}
        {(!veriBekler || veri.finans) && <Ekran finans={veri.finans} yetki={yetki} kayitGir={kayitGir} />}
      </section>
      {veri.finans && yetki.yaz && (
        <KayitCekmecesi
          acik={cekmece.acik}
          tur={cekmece.tur}
          ilk={cekmece.ilk}
          finans={veri.finans}
          kapat={() => setCekmece({ acik: false, tur: null })}
          sec={(tur) => setCekmece((c) => ({ ...c, tur, ilk: tur === null ? undefined : c.ilk }))}
        />
      )}
    </>
  );
}
