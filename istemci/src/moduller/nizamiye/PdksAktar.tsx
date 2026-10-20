import { useState, type FormEvent } from 'react';
import type { PdksAktarCevabi, PdksAktarGovdesi } from '#paylasilan/sozlesme/nizamiye.ts';
import { Dugme, Girdi, Simge } from '../../ortak/arayuz/index.ts';
import { useKomut } from './komut.ts';
import './nizamiye.css';

// PDKS dışa aktarımı çoğunlukla Windows Türkçe kodlamasıyla gelir: UTF-8 değilse windows-1254 olarak okunur.
async function metniOku(dosya: File): Promise<string> {
  const baytlar = await new Promise<ArrayBuffer>((coz, reddet) => {
    const okuyucu = new FileReader();
    okuyucu.onload = () => coz(okuyucu.result as ArrayBuffer);
    okuyucu.onerror = () => reddet(okuyucu.error ?? new Error('Dosya okunamadı.'));
    okuyucu.readAsArrayBuffer(dosya);
  });
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(baytlar);
  } catch {
    return new TextDecoder('windows-1254').decode(baytlar);
  }
}

// 243 a: PDKS'nin verdiği günlük dosya elle aktarılır; aynı dosya ikinci kez aktarılsa da hareket çoğalmaz.
function DosyaAktar({ kapat }: { kapat: () => void }) {
  const [dosya, dosyaYaz] = useState<File | null>(null);
  const [sonuc, sonucYaz] = useState<PdksAktarCevabi | null>(null);
  const aktar = useKomut<PdksAktarGovdesi, PdksAktarCevabi>('PDKS dosyası aktarılamadı.', { tekrarKorumali: true });

  const gonder = async (o: FormEvent) => {
    o.preventDefault();
    if (dosya === null) return;
    aktar.mutate({ yol: '/nizamiye/pdks/aktar', govde: { dosyaAdi: dosya.name, metin: await metniOku(dosya) } }, { onSuccess: sonucYaz });
  };

  return (
    <>
      {sonuc ? (
        <div className="tc-nz-panel-form" role="status">
          <p className="tc-nz-panel-baslik"><Simge ad="check" /> {`${String(sonuc.yeniHareket)} yeni hareket alındı.`}</p>
          <p className="tc-nz-soluk">{`${String(sonuc.satirSayisi)} satır · ${String(sonuc.zatenVardi)} zaten vardı`}</p>
          {sonuc.eslesmeyenSicil.length > 0 && (
            <p className="tc-nz-uyari"><Simge ad="alert" boyut="k" /> {`Sicil no eşleşmedi: ${sonuc.eslesmeyenSicil.join(', ')}`}</p>
          )}
          {sonuc.hatalar.length > 0 && (
            <p className="tc-nz-uyari"><Simge ad="alert" boyut="k" /> {`Okunamayan satır: ${sonuc.hatalar.map((h) => `${String(h.satirNo)} (${h.neden})`).join('; ')}`}</p>
          )}
          <div className="tc-nz-panel-alt"><Dugme tur="birincil" onClick={kapat}>Tamam</Dugme></div>
        </div>
      ) : (
        <form className="tc-nz-panel-form" onSubmit={(o) => { void gonder(o); }}>
          <Girdi etiket="PDKS dosyası" type="file" accept=".csv,.txt,text/csv,text/plain"
            onChange={(o) => dosyaYaz(o.target.files?.[0] ?? null)}
            ipucu="PDKS programının dışa verdiği günlük giriş-çıkış dosyası. Personel sicil numarasıyla eşleşir." />
          <div className="tc-nz-panel-alt">
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" type="submit" simge="upload" disabled={dosya === null} yukleniyor={aktar.isPending}>Aktar</Dugme>
          </div>
        </form>
      )}
    </>
  );
}

// Elle yükleme kalır (ADR 0016 karar 10): kart okuyucu ya da bağlantı düşerse İK dosyayı yine aktarır. Sonuç kapanınca form yeniden açılır.
export function PdksDosyaAktar() {
  const [tur, turYaz] = useState(0);
  return (
    <div className="tc-nz">
      <DosyaAktar key={tur} kapat={() => turYaz((t) => t + 1)} />
    </div>
  );
}
