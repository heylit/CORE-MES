import { useRef, useState } from 'react';
import { Dugme, OnayPenceresi } from '../../../../../ortak/arayuz/index.ts';
import type { Duzen } from '../duzen.ts';
import { ekGizliMetni, iceAktar, kayitBicimi, ozetSayilari, tumunuSifirla } from '../islemler.ts';
import { BolumBasligi, Kutu, dosyaIndir } from '../parcalar.tsx';

export function Ozet({ d }: { d: Duzen }) {
  const [sifirlaSor, sifirlaSorYaz] = useState(false);
  const dosya = useRef<HTMLInputElement>(null);
  const { v } = d;
  const s = ozetSayilari(v, d.t);
  const kartlar = [
    { bolum: 'aile', ad: 'Hammadde ailesi', deger: s.aile, alt: ekGizliMetni(v.aileler.length, v.gizliAileler.length) },
    { bolum: 'kalite', ad: 'Kalite', deger: s.kalite, alt: ekGizliMetni(v.kaliteler.length, v.gizliKaliteler.length) },
    { bolum: 'ozellik', ad: 'Teknik özellik', deger: s.ozellik, alt: ekGizliMetni(v.ozellikler.length, v.gizliOzellikler.length) },
    { bolum: 'durum', ad: 'Değiştirilmiş liste', deger: s.liste, alt: 'durum, işlem, alan ve genel listeler' },
    { bolum: 'sarf', ad: 'Sarf kategorisi', deger: s.sarf, alt: '' },
    { bolum: 'db', ad: 'Demirbaş kategorisi', deger: s.demirbas, alt: '' },
  ];

  const iceAl = async (f: File | undefined) => {
    if (!f) return;
    const yeni = iceAktar(await f.text());
    if (dosya.current) dosya.current.value = '';
    if (!yeni) { d.bildir('hata', 'Dosya okunamadı; Malzeme ayarları dışa aktarımı olmalı.'); return; }
    d.degis(yeni, 'Ayarlar içe aktarıldı.');
  };

  return (
    <>
      <BolumBasligi
        baslik="Malzeme ayarları"
        aciklama="Kart oluştururken seçtiğin her listeyi buradan sadeleştirebilir ya da genişletebilirsin. Kullanmadığın değerleri kapat; seçim listelerinde görünmezler, eski kartlar etkilenmez. Yeni değerleri her listenin üstündeki kutudan ekle."
      />
      <div className="tc-ma-kartlar">
        {kartlar.map((k) => (
          <button key={k.ad} type="button" className="tc-ma-kart" onClick={() => d.o.git.ayarlar(k.bolum)}>
            <b>{k.deger}</b>
            <span>{k.ad}</span>
            {k.alt && <small>{k.alt}</small>}
          </button>
        ))}
      </div>
      {!d.ro && (
        <Kutu baslik="Yedekle ve paylaş">
          <p className="tc-ma-yardim">Ayarları JSON dosyası olarak indirip başka bir katalogda içe aktarabilir ya da ERP'ye verebilirsin.</p>
          <div className="tc-ma-eylemler">
            <Dugme simge="download" onClick={() => dosyaIndir('malzeme-ayarlari.json', JSON.stringify(kayitBicimi(v), null, 2), 'application/json')}>Dışa aktar</Dugme>
            <Dugme simge="upload" onClick={() => dosya.current?.click()}>İçe aktar</Dugme>
            <input
              ref={dosya} type="file" accept=".json,application/json" hidden aria-label="Ayar dosyası seç"
              onChange={(e) => { void iceAl(e.target.files?.[0]); }}
            />
            <Dugme tur="tehlike" simge="rotate" onClick={() => sifirlaSorYaz(true)}>Tüm ayarları sıfırla</Dugme>
          </div>
        </Kutu>
      )}
      <OnayPenceresi
        acik={sifirlaSor} baslik="Tüm ayarları sıfırla" tehlikeli onayMetni="Sıfırla"
        onayla={() => { sifirlaSorYaz(false); d.degis(tumunuSifirla(), 'Malzeme ayarları varsayılana döndü.'); }}
        vazgec={() => sifirlaSorYaz(false)}
      >
        <p>Emin misin? Tüm eklemeler ve gizlemeler silinir.</p>
      </OnayPenceresi>
    </>
  );
}
