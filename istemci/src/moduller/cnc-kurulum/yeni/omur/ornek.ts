import {
  allMachines, byId, catParams, dirtyUsage, DEF_TP, lifeModel, material, num, state, toolLib, toolsOf, usage,
} from './cekirdek.ts';

// Örnek kullanım ve stok verisi yalnız kullanıcı "Örnek verileri yükle" deyince yazılır (210.1: kendiliğinden yazılmaz; "veri yoksa
// null"). Örnek kayıtlar `demo: 1` taşır: sunucuya takım olayı olarak gitmez, "temizle" yalnız onları siler.
export function seedDemo(simdi: number = Date.now()): void {
  const mat = material();
  allMachines().forEach((m, mi) => {
    const arr = toolsOf(m);
    arr.forEach((id, p) => {
      if (id === 'empty' || id === 'probe') return;
      const t = byId(toolLib(m), id);
      if (!t) return;
      const q = catParams(t, mat);
      q.rel = num(state.life.trel, 80);
      const M0 = lifeModel(t, mat, q);
      if (M0.err !== undefined) return;
      let f = ((p * 37 + mi * 53 + 17) % 100) / 100;
      f = Math.min(1.06, f * f * 1.1 + 0.02);
      const used = +(M0.TR * f).toFixed(1), tp = DEF_TP[t.kind] || 0.5;
      const W0 = state.wear[m.id] || (state.wear[m.id] = {});
      W0[p] = { id, used, parts: Math.round(used / tp), since: simdi - (2 + p % 9) * 864e5, demo: 1 };
    });
  });
  dirtyUsage();
  const u = usage();
  Object.keys(u).forEach((k, i) => {
    if (state.inv[k] && state.inv[k].qty != null) return;
    const spare = (i * 7 + k.length) % 5;
    state.inv[k] = { qty: u[k]!.total + spare, min: 1, loc: 'Takım dolabı ' + 'ABCD'.charAt(i % 4) + ' · çekmece ' + (1 + i % 6), demo: 1 };
  });
  if (!state.life.perDay) state.life.perDay = 40;
  state.lifeDemo = 'demo';
  dirtyUsage();
}

export function clearDemo(): void {
  Object.keys(state.wear).forEach((mid) => {
    const W0 = state.wear[mid]!;
    Object.keys(W0).forEach((p) => { if (W0[p]!.demo) delete W0[p]; });
  });
  Object.keys(state.inv).forEach((k) => { if (state.inv[k]!.demo) delete state.inv[k]; });
  state.lifeDemo = 'cleared';
  dirtyUsage();
}
