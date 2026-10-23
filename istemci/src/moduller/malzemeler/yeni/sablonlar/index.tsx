import { useState } from 'react';
import { DurumKutusu, OnayPenceresi, SayfaBasligi, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { KatalogSimgesi } from '../ortak/KatalogSimgesi.tsx';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { Sablon } from '../tipler.ts';
import { kayitHatasi, useSablonKaldir, useSablonlar } from '../veri.ts';
import { useM4Baglami } from './baglam.ts';
import { sablonGorunumu, silinirMi, type SablonGorunumu } from './kurallar.ts';
import './sablonlar.css';

// Prototipin Şablonlar görünümü (renderTplView): kayıtlı şablonlar üstte, hazır şablonlar altta; karta basınca sihirbaz şablonla açılır.
export function Sablonlar(o: EkranOzellikleri) {
  const sorgu = useSablonlar();
  return (
    <div className="tc-ms">
      <SayfaBasligi baslik="Şablonlar" simge="grid" />
      <p className="tc-ms-yardim">
        Bir şablon seçince kalite, standart, durum, işlem ve sertifika seçimleri dolu olarak yeni malzeme akışı başlar. Kendi şablonunu yeni malzemenin son
        adımında "Şablon olarak kaydet" ile oluşturabilirsin.
      </p>
      {sorgu.isError ? (
        <DurumKutusu durum="hata" mesaj={kayitHatasi(sorgu.error).ileti} yenile={() => { void sorgu.refetch(); }} />
      ) : sorgu.isPending ? (
        <DurumKutusu durum="yukleniyor" />
      ) : (
        <Liste o={o} sablonlar={sorgu.data.sablonlar} kaldirabilir={sorgu.data.kaldirabilir} />
      )}
    </div>
  );
}

function Liste({ o, sablonlar, kaldirabilir }: { o: EkranOzellikleri; sablonlar: readonly Sablon[]; kaldirabilir: ReadonlySet<string> }) {
  const b = useM4Baglami(o, sablonlar);
  const kaldir = useSablonKaldir();
  const { bildir } = useBildirim();
  const [silinecek, setSilinecek] = useState<SablonGorunumu | null>(null);
  const hazir = b.t.SYS_TPL;

  const kart = (t: Sablon) => {
    const g = sablonGorunumu(t, b);
    // Kaldırma uçta `malzemeler.yaz` ister; sunucunun listesi zaten yazanı sayar, ekran yine de yazamayana düğme çizmez.
    const silinir = o.yetki.yaz && silinirMi(t, kaldirabilir);
    return (
      <li key={g.id} className="tc-ms-kart" data-tur={'tur' in g.renk ? g.renk.tur : undefined} data-aile={'aile' in g.renk ? g.renk.aile : undefined}>
        <button type="button" className="tc-ms-ana" onClick={() => { o.git.yeniKart({ sablon: g.id }); }}>
          <span className="tc-ms-simge"><KatalogSimgesi yol={g.simge} /></span>
          <span className="tc-ms-metin">
            <b>{g.ad}</b>
            <small>{g.ozet}</small>
          </span>
        </button>
        {silinir && (
          <button type="button" className="tc-ms-sil" aria-label={`${g.ad} şablonunu sil`} title="Şablonu sil" onClick={() => { setSilinecek(g); }}>
            <Simge ad="x" boyut="k" />
          </button>
        )}
      </li>
    );
  };

  const silOnayla = () => {
    if (silinecek === null) return;
    kaldir.mutate(silinecek.id, {
      onSuccess: () => { setSilinecek(null); bildir('tamam', 'Şablon silindi.'); },
      onError: (e) => { setSilinecek(null); bildir('hata', kayitHatasi(e).ileti); },
    });
  };

  return (
    <>
      {sablonlar.length > 0 && (
        <section className="tc-ms-grup" aria-labelledby="tc-ms-kayitli">
          <h3 id="tc-ms-kayitli" className="tc-ms-baslik">Kayıtlı şablonlar</h3>
          <ul className="tc-ms-liste">{sablonlar.map(kart)}</ul>
        </section>
      )}
      <section className="tc-ms-grup" aria-labelledby="tc-ms-hazir">
        <h3 id="tc-ms-hazir" className="tc-ms-baslik">Hazır şablonlar</h3>
        <ul className="tc-ms-liste">{hazir.map(kart)}</ul>
      </section>
      <OnayPenceresi
        acik={silinecek !== null}
        baslik="Şablonu sil"
        onayMetni="Sil"
        tehlikeli
        yukleniyor={kaldir.isPending}
        onayla={silOnayla}
        vazgec={() => { setSilinecek(null); }}
      >
        <p>"{silinecek?.ad}" şablonu silinsin mi?</p>
      </OnayPenceresi>
    </>
  );
}
