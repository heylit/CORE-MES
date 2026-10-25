import { useEffect } from 'react';
import { CokSatir, FormPenceresi, Secim, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { useMesaj, type FormOzellikleri } from '../durum.tsx';
import { kanalSecenekleri } from './ortak.ts';

interface Degerler { kanal: string; metin: string }

// Duyuru yap (openAnnForm): varsayılan kanal "duyurular", yoksa açık kanal, yoksa ilk kanal.
export function DuyuruFormu({ istek, kapat }: FormOzellikleri<'duyuru'>) {
  const { veri, duyuruGonder } = useMesaj();
  const { bildir } = useBildirim();
  const kanallar = veri.kanallar;
  const varsayilan = (kanallar.find((c) => c.id === 'duyurular') ?? kanallar.find((c) => c.id === istek.kanal) ?? kanallar[0])?.id ?? '';

  const form = useForm<Degerler, unknown>({
    ilk: { kanal: varsayilan, metin: '' },
    dogrula: (d): Record<string, string> => (d.metin.trim() ? {} : { metin: 'Duyuru metnini yaz.' }),
    kaydet: (d) => duyuruGonder({ kanal: d.kanal, metin: d.metin.trim() }),
    basarili: () => { bildir('tamam', 'Duyuru yapıldı.'); kapat(); },
    hataIletisi: 'Duyuru yapılamadı.',
  });

  useEffect(() => {
    if (kanallar.length === 0) { bildir('bilgi', 'Önce bir kanal oluştur.'); kapat(); }
  }, []);
  if (kanallar.length === 0) return null;

  return (
    <FormPenceresi acik kapat={kapat} baslik="Duyuru yap" form={form} kaydetMetni="Duyur">
      <p className="tc-ms-aciklama">Herkes “Okudum, anladım” der; kimin okumadığını görürsün.</p>
      <Secim etiket="Kanal" secenekler={kanalSecenekleri(kanallar)} {...form.alan('kanal')} />
      <CokSatir etiket="Duyuru" rows={4} required maxLength={3000} {...form.alan('metin')} />
    </FormPenceresi>
  );
}
