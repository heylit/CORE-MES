import { useRef, useState, type FormEvent } from 'react';
import type { Ayar } from '#paylasilan/sozlesme/ayarlar.ts';
import { satirHatalari, satirlariCoz, satirlariYaz, AZAMI_LSV2_MAKINESI, type Lsv2Alani, type Lsv2Satiri } from '#paylasilan/lsv2-makineleri.ts';
import { Dugme, Girdi } from '../../ortak/arayuz/index.ts';

type MetinAyari = Extract<Ayar, { tur: 'metin' }>;

// Kart 3757: Heidenhain makine listesi satır satır girilir; değer tek metin ayarıdır (KOD=IP;Dnnnn,...), sunucu aynı kuralla doğrular.
// Hata ilgili kutunun altında yazar; hatalı listede Kaydet kapalıdır. Boş satır (üç alanı da boş) yok sayılır.
export function Lsv2MakineListesi({ ayar, mesgul, degistir }: { ayar: MetinAyari; mesgul: boolean; degistir: (deger: string) => void }) {
  const ilk = (): Lsv2Satiri[] => satirlariCoz(ayar.deger ?? '') ?? [];
  const [satirlar, setSatirlar] = useState<Lsv2Satiri[]>(ilk);
  const [kayitli, setKayitli] = useState(ayar.deger);
  if (kayitli !== ayar.deger) { setKayitli(ayar.deger); setSatirlar(ilk()); }
  const dolu = satirlar.filter((s) => s.kod.trim() !== '' || s.adres.trim() !== '' || s.sayac.trim() !== '');
  const temiz = dolu.map((s) => ({ kod: s.kod.trim(), adres: s.adres.trim(), sayac: s.sayac.trim() }));
  const hatalar = satirHatalari(temiz);
  const hata = (satir: Lsv2Satiri, alan: Lsv2Alani): string | undefined => {
    const i = dolu.indexOf(satir);
    return i < 0 ? undefined : hatalar.find((h) => h.satir === i && h.alan === alan)?.ileti;
  };
  const genel = hatalar.find((h) => h.satir === null)?.ileti;
  const yeni = satirlariYaz(temiz);
  const degisti = hatalar.length === 0 && (yeni !== (ayar.deger ?? '') || ayar.gecersiz === true);
  const guncelle = (i: number, alan: keyof Lsv2Satiri, deger: string) => setSatirlar((l) => l.map((s, j) => (j === i ? { ...s, [alan]: deger } : s)));
  const form = useRef<HTMLFormElement>(null);
  const kayitliMetin = ayar.deger ?? '';
  const kaydedilmedi = satirlariYaz(temiz) !== kayitliMetin;
  const ilkHatayaGit = () => form.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
  const gonder = (olay: FormEvent) => {
    olay.preventDefault();
    if (degisti) degistir(yeni);
  };
  return (
    <li className="tc-ayar tc-ayar-lsv2">
      <div className="tc-ayar-metin">
        <p className="tc-ayar-baslik">{ayar.baslik}</p>
        <p className="tc-ayar-aciklama">{ayar.aciklama}</p>
      </div>
      <form className="tc-lsv2-form" onSubmit={gonder} aria-label={ayar.baslik} ref={form}>
        {satirlar.length === 0 && <p className="tc-ayar-aciklama">Liste boş: Heidenhain makinesine bağlanılmaz.</p>}
        {/* Geniş ekranda başlıklar bir kez yazılır, kutuların etiketi yalnız ekran okuyucuya kalır; dar ekranda her makine ayrı karttır. */}
        {satirlar.length > 0 && (
          <div className="tc-lsv2-baslik" aria-hidden="true">
            <span>Makine kodu</span><span>IP adresi</span><span>Sayaç adresi (PLC sayacı okuması açıkken)</span><span />
          </div>
        )}
        {satirlar.map((s, i) => (
          // Satırın kimliği yok; sırası değişmez (yalnız sonuna eklenir, silinen çıkar).
          <div className="tc-lsv2-satir" key={i}>
            <Girdi etiket="Makine kodu" value={s.kod} maxLength={100} onChange={(o) => guncelle(i, 'kod', o.target.value)} hata={hata(s, 'kod')} disabled={mesgul} />
            <Girdi etiket="IP adresi" value={s.adres} inputMode="decimal" onChange={(o) => guncelle(i, 'adres', o.target.value)} hata={hata(s, 'adres')} disabled={mesgul} />
            <Girdi etiket="Sayaç adresi" value={s.sayac} placeholder="Yok" onChange={(o) => guncelle(i, 'sayac', o.target.value.toUpperCase())} hata={hata(s, 'sayac')} disabled={mesgul} />
            <Dugme type="button" tur="ikincil" simge="trash" aria-label={`Sil: ${s.kod || `${String(i + 1)}. satır`}`} onClick={() => setSatirlar((l) => l.filter((_, j) => j !== i))} disabled={mesgul}>Sil</Dugme>
          </div>
        ))}
        {genel !== undefined && <p className="tc-lsv2-hata" role="alert">{genel}</p>}
        <div className="tc-lsv2-dugmeler">
          <Dugme type="button" tur="ikincil" simge="plus" onClick={() => setSatirlar((l) => [...l, { kod: '', adres: '', sayac: '' }])} disabled={mesgul || satirlar.length >= AZAMI_LSV2_MAKINESI}>Makine ekle</Dugme>
          {/* Sayfada en çok bir birincil düğme kuralı (2155-9): Kaydet çizgilidir. */}
          <Dugme type="submit" tur="ikincil" simge="check" disabled={mesgul || !degisti}>{hatalar.length > 0 ? `Kaydet (${String(hatalar.length)} hata)` : 'Kaydet'}</Dugme>
          {hatalar.some((h) => h.satir !== null) && <Dugme type="button" tur="ikincil" simge="alert" onClick={ilkHatayaGit}>İlk hataya git</Dugme>}
          {kaydedilmedi && <Dugme type="button" tur="ikincil" simge="x" onClick={() => setSatirlar(ilk())} disabled={mesgul}>Vazgeç</Dugme>}
        </div>
        {kaydedilmedi && <p className="tc-ayar-aciklama" role="status">Kaydedilmemiş değişiklik var.</p>}
      </form>
    </li>
  );
}
