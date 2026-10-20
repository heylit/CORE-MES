import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import type { KaynakGirdisi, PlanCevabi, TaslakGirdisi } from '#paylasilan/sozlesme/plan.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { korumaliPost } from './komut.ts';
import { planSonucu, sonucMetni } from './planGorunumu.ts';

export const planAnahtari = (taslak: number | null) => ['rotalar', 'plan', taslak ?? 'canli'] as const;
export const STUDYO_ANAHTARI = ['rotalar', 'studyo'] as const;
export const kaynakAnahtari = (k: KaynakGirdisi): string => `${k.tur}:${k.id}`;
export const kisaZaman = (iso: string): string => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const kaynakEtiketi = (k: { tur: string; kod: string | null; ad: string }): string => (k.tur === 'makine' ? `${k.kod ?? ''} ${k.ad}`.trim() : k.ad);

// Görülen taslak adres satırındadır (?taslak=); Plan, Kanban ve stüdyonun "Aç ve düzenle"si aynı taslağı açar.
export function useTaslak(): [number | null, (id: number | null) => void] {
  const [p, yaz] = useSearchParams();
  const t = Number(p.get('taslak'));
  const id = Number.isInteger(t) && t > 0 ? t : null;
  const sec = (x: number | null) => yaz((o) => {
    const n = new URLSearchParams(o);
    if (x === null) n.delete('taslak'); else n.set('taslak', String(x));
    return n;
  }, { replace: true });
  return [id, sec];
}

export function usePlan() {
  const [taslak] = useTaslak();
  return useQuery({ queryKey: planAnahtari(taslak), queryFn: () => api.get<PlanCevabi>(`/plan${taslak ? `?taslak=${taslak}` : ''}`) });
}

// Yazmanın hedefi (P6): kendi taslağındaysan o taslak ve okunan sürümü; canlıdaysan (ya da başkasının taslağındaysan) null, sunucu yeni
// taslak açar.
export const yazmaHedefi = (p: PlanCevabi): TaslakGirdisi => (p.taslak?.benim ? { id: p.taslak.id, surum: p.taslak.surum } : null);

export const PLAN_KOMUT_ANAHTARI = ['rotalar', 'plan-komut'] as const;

const BASARI_ADI: readonly (readonly [string, string])[] = [
  ['/oner', 'Plan yeniden hesaplandı.'], ['/tasi', 'İş taşındı.'], ['/kilidi-ac', 'Kilit açıldı.'], ['/kilitle', 'İş kilitlendi.'], ['/kaldir', 'İş plandan kaldırıldı.'],
  ['/yerlestir', 'İş yerleştirildi.'], ['/kuyruk/sirala', 'Kuyruk sırası güncellendi.'], ['/plan-sirasina-don', 'Kuyruk plan sırasına döndü.'],
  ['/elle-siralari-sil', 'Elle sıralar silindi.'], ['/dondurmayi-kaldir', 'Dondurma kaldırıldı.'], ['/dondur', 'Dondurma uygulandı.'], ['/ayar', 'Plan ayarları kaydedildi.'],
];
const basariAdi = (yol: string): string => BASARI_ADI.find(([son]) => yol.endsWith(son))?.[1] ?? 'Plan güncellendi.';

// Plan komutları: her biri ayrı uç; cevap senaryonun güncel planıdır. Canlıdayken yapılan değişiklik senaryo açar ve bildirilir.
// Her komut sonunda ileti çıkar: ne yapıldığı ve planın önceki halinden farkı (kaç iş yer değiştirdi, kaç emir gecikiyor).
export function usePlanKomutu() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [taslak, taslakYaz] = useTaslak();
  return useMutation({
    mutationKey: PLAN_KOMUT_ANAHTARI,
    mutationFn: ({ yol, govde }: { yol: string; govde: Record<string, unknown>; basari?: string }) => korumaliPost<PlanCevabi>(yol, govde),
    onMutate: () => istemci.getQueryData<PlanCevabi>(planAnahtari(taslak)),
    onSuccess: (p, k, once) => {
      istemci.setQueryData(planAnahtari(p.taslak?.id ?? null), p);
      void istemci.invalidateQueries({ queryKey: STUDYO_ANAHTARI });
      const ileti = `${k.basari ?? basariAdi(k.yol)} ${sonucMetni(planSonucu(once, p), once !== undefined)}`;
      if (p.taslakAcildi && p.taslak) {
        taslakYaz(p.taslak.id);
        bildir('bilgi', `${ileti} Değişiklik "${p.taslak.ad}" senaryosuna alındı; canlı plan değişmedi.`);
      } else bildir('tamam', ileti);
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Plan değiştirilemedi.')),
  });
}
