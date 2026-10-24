import { useState } from 'react';
import { Dugme, SayfaBasligi, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { AdimliForm, type FormVerisi, type KmAlan } from '../AdimliForm.tsx';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { Bayrak } from '../tipler.ts';
import { useKmKomutu, yeniKimlik } from '../veri.ts';
import { TEKNIK_KUTUPHANE } from './teklib.ts';
import './kutuphane.css';

// Uygulamadaki bayrak formu: alan adları ve seçenekler aynı (resim okunurken bayrak bu alanlarla uygulanır).
export const BAYRAK_ALANLARI: readonly KmAlan[] = [
  { k: 'metin', etiket: 'Bayrak yazısı', zorunlu: true, ipucu: 'Ör. B111, KC, CC' },
  { k: 'sekil', etiket: 'Şekil', tur: 'secim', secenekler: ['', 'altıgen', 'elmas', 'üçgen', 'daire', 'kare'], genis: 'yarim' },
  { k: 'anlam', etiket: 'Anlamı', genis: 'tam', ipucu: 'Resimdeki notun özeti' },
  { k: 'sinif', etiket: 'Sınıf', tur: 'secim', secenekler: ['Kritik', 'Majör', 'Minör'], genis: 'yarim' },
  { k: 'ozel', etiket: 'Karakteristik işareti', tur: 'secim', secenekler: ['', 'KC', 'CI', 'S', 'SC'], genis: 'yarim' },
  { k: 'kanal', etiket: 'Ölçüm kanalı', tur: 'secim', secenekler: ['', 'CMM', 'Manuel', 'Görsel'], genis: 'yarim', ipucu: 'Boş: otomatik karar' },
];

export const TeknikKutuphaneSayaci: KmSayaci = null;

export function TeknikKutuphane({ veri, yetki }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  // null: form kapalı; 'yeni': yeni bayrak; kayıt: düzenleme.
  const [form, formYaz] = useState<Bayrak | 'yeni' | null>(null);
  const [siliniyor, siliniyorYaz] = useState<string | null>(null);
  const bayraklar: readonly Bayrak[] = veri.bayrak;
  const silebilir = yetki.silebilir('bayrak');

  const kaydet = async (d: FormVerisi) => {
    const onceki = form !== null && form !== 'yeni' ? form : null;
    await komut.kaydet('bayrak', { ...(onceki ?? {}), ...d, _id: onceki?._id ?? yeniKimlik('bayrak') });
    formYaz(null);
    bildir('tamam', 'Bayrak kaydedildi');
  };
  const sil = async (b: Bayrak) => {
    siliniyorYaz(b._id);
    try {
      await komut.sil('bayrak', b._id);
      bildir('tamam', 'Kayıt silindi');
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Kayıt silinemedi.'));
    } finally {
      siliniyorYaz(null);
    }
  };

  const sutunlar: Sutun<Bayrak>[] = [
    { anahtar: 'metin', baslik: 'Bayrak', hucre: (b) => <b>{b.metin}</b>, kirilmaz: true },
    { anahtar: 'sekil', baslik: 'Şekil', hucre: (b) => b.sekil || 'herhangi' },
    { anahtar: 'anlam', baslik: 'Anlamı', hucre: (b) => b.anlam ?? '' },
    { anahtar: 'sinif', baslik: 'Sınıf', hucre: (b) => b.sinif ?? '' },
    { anahtar: 'ozel', baslik: 'İşaret', hucre: (b) => b.ozel ?? '' },
    { anahtar: 'kanal', baslik: 'Kanal', hucre: (b) => b.kanal || 'otomatik' },
  ];
  if (yetki.yaz || silebilir) {
    sutunlar.push({
      anahtar: 'islem', baslik: 'İşlem', csv: false,
      hucre: (b) => (
        <span className="tc-km1-islemler">
          {yetki.yaz && <Dugme simge="edit" onClick={() => { formYaz(b); }}>Düzenle</Dugme>}
          {silebilir && <Dugme tur="tehlike" simge="trash" yukleniyor={siliniyor === b._id} onClick={() => { void sil(b); }}>Sil</Dugme>}
        </span>
      ),
    });
  }

  return (
    <div className="tc-km1-kutuphane">
      <SayfaBasligi
        baslik="Teknik kütüphane" simge="layers"
        alt="Resimlerde geçen işaretler, anlamları ve nasıl ölçüldükleri. Firmanıza ve müşterilerinize özel bayrakları (ör. altıgen içinde B111) burada tanımlayın; resim okunurken otomatik uygulanır."
        birincil={yetki.yaz ? { etiket: 'Bayrak tanımla', simge: 'plus', yap: () => { formYaz('yeni'); } } : undefined}
      />
      <section className="tc-km1-bolum" aria-label="Firma ve müşteri bayrakları">
        <h3>Firma ve müşteri bayrakları</h3>
        {bayraklar.length > 0
          ? <Tablo etiket="Firma ve müşteri bayrakları" sutunlar={sutunlar} satirlar={bayraklar} satirAnahtari={(b) => b._id} />
          : (
            <p className="tc-km1-soluk">
              Henüz tanımlı bayrak yok. Resimde bir bayrak bulunduğunda anlamı burada yoksa karakteristik "Kritik" işaretlenir ve kontrol notu eklenir.
            </p>
          )}
      </section>
      {TEKNIK_KUTUPHANE.map((b) => (
        <section key={b.baslik} className="tc-km1-bolum" aria-label={b.baslik}>
          <h3>{b.baslik}</h3>
          <div className="tc-km1-isaretler">
            {b.satirlar.map(([isaret, ad, tur, anlam, olcum]) => (
              <div key={`${isaret}-${ad}`} className="tc-km1-isaret">
                <span className="tc-km1-isaret-simge" aria-hidden="true">{isaret}</span>
                <div>
                  <b>{ad}</b> <small className="tc-km1-soluk">{tur}</small>
                  {anlam && <p>{anlam}</p>}
                  {olcum && <p className="tc-km1-olcum">Ölçüm: {olcum}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="tc-km1-soluk tc-km1-kaynak">
        Kaynak: ASME Y14.5, ISO 1101/1660/286. Kritiklik bayraklarının evrensel bir anlamı yoktur; firma veya müşteri standardına göre tanımlanır.
      </p>
      {form !== null && (
        <AdimliForm
          baslik={form === 'yeni' ? 'Bayrak tanımla' : 'Bayrağı düzenle'}
          alanlar={BAYRAK_ALANLARI}
          adimlar={[{ baslik: form === 'yeni' ? 'Bayrak tanımla' : 'Bayrağı düzenle', alanlar: BAYRAK_ALANLARI.map((a) => a.k) }]}
          ilk={form === 'yeni' ? null : form}
          kaydet={kaydet}
          kapat={() => { formYaz(null); }}
        />
      )}
    </div>
  );
}
