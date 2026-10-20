/* Bakım çağrısı üstlenilince arıza kaydı açılır (Bakım sayfasında kapatılır). `send` öteki sekme ve cihazlara gider ama gönderen sekmeye dönmez
   (store.ts Bus), bu yüzden aynı sekmedeki açık Bakım listesi `yerel` ile yenilenir (borç Y6). */
export interface BakimCagrisi { machine: string; mc?: string | null; wc?: string | null; t0: number; by: string; note?: string | null; orderNo?: string | null }
export interface ArizaBagimliliklari {
  get(id: string): Promise<unknown>;
  put(doc: Record<string, unknown>): Promise<unknown>;
  send(m: { type: 'maint' }): void;
  yerel(m: { type: 'maint' }): void;
}

export async function cagridanArizaAc(m: BakimCagrisi, kisi: string, simdi: number, d: ArizaBagimliliklari): Promise<boolean> {
  const id = 'ar-' + m.t0;
  if (await d.get(id)) return false;
  await d.put({
    id, type: 'ariza', st: m.machine, mc: m.mc || null, wc: m.wc || null, title: m.note || 'Bakım çağrısı', openedAt: m.t0, openedBy: m.by,
    ackAt: simdi, ackBy: kisi, status: 'work', callId: String(m.t0), orderNo: m.orderNo || null,
  });
  d.send({ type: 'maint' });
  d.yerel({ type: 'maint' });
  return true;
}
