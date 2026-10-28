// Günlük sevkiyatta işin tetiği (960): Tüm işler kalemi taşıyan iş "Sevk et" (gidiş) ya da "Al" (geliş) ile depoya düşer; depo son
// çıkışı ya da kabulü yapar. Plan onayı beklenmez. Kalemsiz (elle açılmış) işte düğme yoktur.
import type { TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Rozet, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { gidisCiktiMi, tetiklenebilir } from './tum-isler.ts';
import { useKalemKomutu } from './veri.ts';

export function TetikDugmesi({ isId, kalemler, yazabilir }: { isId: number; kalemler: readonly TumIsSatiri[] | undefined; yazabilir: boolean }) {
  const komut = useKalemKomutu();
  const { bildir } = useBildirim();
  if (!kalemler?.length || kalemler.some((k) => k.tasima !== 'biz')) return null;
  const gelis = kalemler.every((k) => k.yon === 'gelis');
  const ad = gelis ? 'Al' : 'Sevk et';
  const tetiklendi = kalemler.some((k) => k.is?.tetiklendi);
  if (kalemler.every((k) => k.asama === 'tamamlandi')) return <Rozet ton="tamam">{gelis ? 'Kabul edildi' : 'Depodan çıktı'}</Rozet>;
  if (tetiklendi) {
    const depoYapti = kalemler.some((k) => k.depo !== null);
    return (
      <span className="tc-sevkiyat-sonuc-dugmeleri">
        <Rozet ton="tamam">Depoda</Rozet>
        {yazabilir && !depoYapti && (
          <Dugme simge="rotate" yukleniyor={komut.isPending} title="Depo çıkışı ya da kabulü yapılmadıysa tetik geri alınır"
            onClick={() => komut.mutate({ tur: 'tetigi-geri-al', isId }, { onSuccess: () => bildir('tamam', 'Tetik geri alındı.'), onError: (h) => bildir('hata', hataIletisi(h, 'Tetik geri alınamadı')) })}>Geri al</Dugme>
        )}
      </span>
    );
  }
  if (!yazabilir) return null;
  const hazirDegil = !kalemler.every(tetiklenebilir);
  const gidisCikmadi = !kalemler.every(gidisCiktiMi);
  return (
    <Dugme tur="birincil" simge={gelis ? 'download' : 'upload'} yukleniyor={komut.isPending} disabled={hazirDegil || gidisCikmadi}
      title={gidisCikmadi ? 'Gidiş henüz depodan çıkmadı; çıkınca açılır' : hazirDegil ? 'İşte hazır olmayan kalem var' : `Depoya ${gelis ? 'kabul' : 'son çıkış'} işi düşer`}
      onClick={() => komut.mutate({ tur: 'tetikle', isId }, {
        onSuccess: () => bildir('tamam', `${ad} · depoya ${gelis ? 'kabul' : 'son çıkış'} işi düştü.`, {
          eylem: { etiket: 'Geri al', yap: () => komut.mutate({ tur: 'tetigi-geri-al', isId }, { onError: (h) => bildir('hata', hataIletisi(h, 'Tetik geri alınamadı')) }) },
        }),
        onError: (h) => bildir('hata', hataIletisi(h, 'Tetiklenemedi')),
      })}>{ad}</Dugme>
  );
}

// İşe bağlı kalemler: gün planının işleri bu haritadan düğmesini bulur.
export function isKalemleri(satirlar: readonly TumIsSatiri[] | undefined): ReadonlyMap<number, TumIsSatiri[]> {
  const harita = new Map<number, TumIsSatiri[]>();
  for (const s of satirlar ?? []) if (s.is) harita.set(s.is.id, [...(harita.get(s.is.id) ?? []), s]);
  return harita;
}
