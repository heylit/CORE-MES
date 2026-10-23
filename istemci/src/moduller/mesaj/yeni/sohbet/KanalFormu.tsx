import { FormPenceresi, Girdi } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { useMesaj, type FormOzellikleri } from '../durum.tsx';
import { KANAL_SIMGELERI, kanalAdiDuzelt, kanalKimligi } from '../kurallar.ts';

interface Degerler { simge: string; ad: string; konu: string }

// Yeni kanal (openNewChannel): ad küçük harf ve tireli, tekil; kimlik ASCII ve tekil.
export function KanalFormu({ kapat }: FormOzellikleri<'kanal'>) {
  const { ben, veri, yaz, git } = useMesaj();
  const kanallar = veri.kanallar;

  const form = useForm<Degerler, string>({
    ilk: { simge: KANAL_SIMGELERI[0] ?? '💬', ad: '', konu: '' },
    dogrula: (d): Record<string, string> => {
      const ad = kanalAdiDuzelt(d.ad);
      if (!ad) return { ad: 'Kanal adı harf ya da rakam içermeli.' };
      if (kanallar.some((c) => c.name === ad)) return { ad: 'Bu adda bir kanal var.' };
      return {};
    },
    kaydet: async (d) => {
      const ad = kanalAdiDuzelt(d.ad);
      const id = kanalKimligi(ad, kanallar.map((c) => c.id));
      const ts = Date.now();
      await yaz.yaz(`channels/${id}`, { name: ad, topic: d.konu.trim(), emoji: d.simge, createdAt: ts, createdBy: ben.id, lastAt: ts, lastBy: ben.id });
      return id;
    },
    basarili: (id) => { kapat(); git({ kanal: id }); },
    hataIletisi: 'Kanal oluşturulamadı.',
  });

  return (
    <FormPenceresi acik kapat={kapat} baslik="Yeni kanal" form={form} kaydetMetni="Oluştur">
      <fieldset className="tc-ms-simge-secimi">
        <legend className="tc-ms-alan-etiket">Simge</legend>
        {KANAL_SIMGELERI.map((e) => (
          <label key={e} className="tc-ms-simge-secenek">
            <input type="radio" name="simge" value={e} checked={form.degerler.simge === e} onChange={() => { form.degistir({ simge: e }); }} />
            <span>{e}</span>
          </label>
        ))}
      </fieldset>
      <Girdi etiket="Kanal adı" required maxLength={40} placeholder="ör. sevkiyat" {...form.alan('ad')} />
      <Girdi etiket="Konu" ipucu="İsteğe bağlı" maxLength={120} {...form.alan('konu')} />
    </FormPenceresi>
  );
}
