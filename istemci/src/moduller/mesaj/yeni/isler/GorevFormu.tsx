import { CokSatir, FormPenceresi, Girdi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { gundenZaman, isoGun } from '../bicim.ts';
import { useMesaj, type FormIstegi } from '../durum.tsx';
import { iz } from '../kartlar/eylemler.ts';
import { KisiSecici } from '../ortak/index.ts';
import type { Gorev } from '../tipler.ts';
import { AlanGrubu, KanaldaPaylas, SiparisSecimi, TeslimSecimi, yereldenZaman } from './form-parcalari.tsx';
import './isler.css';

interface Degerler {
  baslik: string;
  kime: string | null;
  teslim: string;
  hatirlat: string;
  siparis: string;
  paylas: boolean;
  kanal: string;
}

// Prototipin openTaskForm'u: "Görev ver" ya da "Mesajı göreve çevir". E-posta bildirimi yok (208 a).
export function GorevFormu({ istek, kapat }: { istek: Extract<FormIstegi, { tur: 'gorev' }>; kapat: () => void }) {
  const { ben, ilkAd, veri, yaz, gonder } = useMesaj();
  const { bildir } = useBildirim();
  const ilk = istek.ilk ?? {};
  const form = useForm<Degerler, string>({
    ilk: {
      baslik: ilk.title ?? '', kime: ilk.to === undefined ? null : ilk.to, teslim: ilk.due ? isoGun(ilk.due) : '', hatirlat: '',
      siparis: ilk.orderId ?? '', paylas: Boolean(ilk.cid), kanal: ilk.cid ?? veri.kanallar[0]?.id ?? '',
    },
    dogrula: (d) => ({
      ...(d.baslik.trim() ? {} : { baslik: 'Ne yapılacağını yaz.' }),
      ...(d.kime ? {} : { kime: 'Görevi kime vereceğini seç.' }),
    }),
    hataIletisi: 'Görev verilemedi.',
    kaydet: async (d) => {
      const kime = d.kime as string;
      const kayit: Gorev = {
        title: d.baslik.trim(), to: kime, by: ben.id, status: ilk.status ?? 'todo', remind: yereldenZaman(d.hatirlat),
        due: gundenZaman(d.teslim), orderId: d.siparis || null, note: '', createdAt: Date.now(), cid: null, mid: null,
        last: iz(ben.id, 'görev verdi'),
      };
      const id = await yaz.ekle('tasks', kayit);
      if (d.paylas && d.kanal) {
        const mid = await gonder({
          kanal: d.kanal, metin: kime !== ben.id ? `<@${kime}>` : '',
          ek: { kind: 'task', ref: id, ...(ilk.mid && ilk.reply ? { replyTo: ilk.reply } : {}) },
        });
        await yaz.guncelle(`tasks/${id}`, { cid: d.kanal, mid });
      }
      return kime;
    },
    basarili: (kime) => {
      bildir('tamam', kime === ben.id ? 'Görev listene eklendi.' : `Görev verildi: ${ilkAd(kime)}`);
      kapat();
    },
  });
  const d = form.degerler;
  return (
    <FormPenceresi acik kapat={kapat} baslik={ilk.mid ? 'Mesajı göreve çevir' : 'Görev ver'} form={form} kaydetMetni="Görevi ver">
      <CokSatir etiket="Ne yapılacak?" required maxLength={200} rows={2} {...form.alan('baslik')} />
      <AlanGrubu etiket="Kime?" hata={form.hata('kime')}>
        <KisiSecici etiket="Kime?" deger={d.kime} degisti={(kime) => form.degistir({ kime })} kendim />
      </AlanGrubu>
      <TeslimSecimi deger={d.teslim} degisti={(teslim) => form.degistir({ teslim })} />
      <Girdi etiket="Hatırlat (isteğe bağlı)" type="datetime-local" {...form.alan('hatirlat')} />
      <SiparisSecimi deger={d.siparis} degisti={(siparis) => form.degistir({ siparis })} />
      <KanaldaPaylas etiket="Kanalda da paylaş" paylas={d.paylas} kanal={d.kanal} degisti={(y) => form.degistir(y)} />
    </FormPenceresi>
  );
}
