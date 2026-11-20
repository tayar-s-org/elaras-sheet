import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceStoredFile } from './replaceStoredFile.js';

function setup({ persist = async () => {}, remove } = {}) {
  const log = [];
  return {
    log,
    run: previousPath => replaceStoredFile({
      previousPath,
      upload: async () => { log.push('upload'); return 'novo.mp3'; },
      persist: async path => { log.push(`persist:${path}`); await persist(path); },
      remove: remove ?? (async path => { log.push(`remove:${path}`); }),
    }),
  };
}

test('apaga o arquivo antigo só depois de gravar a referência', async () => {
  const { log, run } = setup();
  assert.equal(await run('antigo.mp3'), 'novo.mp3');
  assert.deepEqual(log, ['upload', 'persist:novo.mp3', 'remove:antigo.mp3']);
});

test('sem arquivo anterior não apaga nada', async () => {
  const { log, run } = setup();
  await run('');
  assert.deepEqual(log, ['upload', 'persist:novo.mp3']);
});

test('se gravar a referência falha, apaga o novo e mantém o antigo', async () => {
  const { log, run } = setup({ persist: async () => { throw new Error('sem rede'); } });
  await assert.rejects(run('antigo.mp3'), /sem rede/);
  assert.deepEqual(log, ['upload', 'persist:novo.mp3', 'remove:novo.mp3']);
});

test('se o envio falha, nada é gravado nem apagado', async () => {
  const log = [];
  await assert.rejects(replaceStoredFile({
    previousPath: 'antigo.mp3',
    upload: async () => { throw new Error('arquivo grande'); },
    persist: async () => log.push('persist'),
    remove: async () => log.push('remove'),
  }), /arquivo grande/);
  assert.deepEqual(log, []);
});

test('falha ao limpar não esconde o erro original nem desfaz a troca', async () => {
  const failing = async () => { throw new Error('limpeza'); };
  const ok = setup({ remove: failing });
  assert.equal(await ok.run('antigo.mp3'), 'novo.mp3');
  const bad = setup({ remove: failing, persist: async () => { throw new Error('original'); } });
  await assert.rejects(bad.run('antigo.mp3'), /original/);
});
