// Testes do resolveProduct com fetch falso (sem API). Rodar: pnpm test:voice
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProduct, decide, singularVariants } from '../resolve.ts';

const P = (id, name) => ({ id, name, unit: null, location: 'Geladeira', onList: false });
const CATALOG = [
  P('1', 'Leite condensado'),
  P('2', 'Leite desnatado'),
  P('3', 'Leite de coco'),
  P('4', 'Leite integral'),
  P('5', 'Leite em pó'),
  P('6', 'Papel higiênico'),
  P('7', 'Pão de forma integral'),
  P('8', 'Pão francês'),
  P('9', 'Requeijão'),
  P('10', 'Tomate italiano'),
  P('11', 'Café'),
  P('12', 'Pão'),
];
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** API falsa: substring accent/case-insensitive (como a API atual). Registra as URLs chamadas. */
function fakeApi(catalog = CATALOG) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    const q = fold(new URL(url).searchParams.get('q') ?? '');
    const products = catalog.filter((p) => fold(p.name).includes(q));
    return new Response(JSON.stringify({ products }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

test('chama GET /products?q= na API padrão', async () => {
  const api = fakeApi();
  await resolveProduct('café', { fetch: api.fetch });
  assert.equal(api.calls[0], 'http://localhost:3101/products?q=caf%C3%A9');
});

test('respeita NEXT_PUBLIC_API_URL', async () => {
  process.env.NEXT_PUBLIC_API_URL = 'http://api.local:9000/';
  try {
    const api = fakeApi();
    await resolveProduct('café', { fetch: api.fetch });
    assert.ok(api.calls[0].startsWith('http://api.local:9000/products?q='));
  } finally {
    delete process.env.NEXT_PUBLIC_API_URL;
  }
});

test('"leite" ambíguo → many com no máximo 4 candidatos', async () => {
  const r = await resolveProduct('leite', { fetch: fakeApi().fetch });
  assert.equal(r.status, 'many');
  assert.equal(r.candidates.length, 4);
  assert.ok(r.candidates.every((p) => p.name.startsWith('Leite')));
});

test('match exato sem acento → one', async () => {
  const r = await resolveProduct('papel higienico', { fetch: fakeApi().fetch });
  assert.deepEqual(r, { status: 'one', product: CATALOG[5] });
});

test('match exato vence mesmo com vários resultados ("pão")', async () => {
  const r = await resolveProduct('pão', { fetch: fakeApi().fetch });
  assert.equal(r.status, 'one');
  assert.equal(r.product.id, '12');
});

test('um único resultado parecido → one ("requeijao")', async () => {
  const r = await resolveProduct('requeijao', { fetch: fakeApi().fetch });
  assert.equal(r.status, 'one');
  assert.equal(r.product.name, 'Requeijão');
});

test('palavras ditas contidas no nome → one ("pão de forma")', async () => {
  const r = await resolveProduct('pão de forma', { fetch: fakeApi().fetch });
  assert.equal(r.status, 'one');
  assert.equal(r.product.id, '7');
});

test('plural sem resultado tenta o singular ("pães" → "pão")', async () => {
  const api = fakeApi();
  const r = await resolveProduct('pães', { fetch: api.fetch });
  assert.equal(r.status, 'one');
  assert.equal(r.product.id, '12');
  assert.equal(api.calls.length, 2);
});

test('nada encontrado → none', async () => {
  const r = await resolveProduct('recligional', { fetch: fakeApi().fetch });
  assert.deepEqual(r, { status: 'none' });
});

test('nome vazio → none sem chamar a API', async () => {
  const api = fakeApi();
  assert.deepEqual(await resolveProduct('  ', { fetch: api.fetch }), { status: 'none' });
  assert.equal(api.calls.length, 0);
});

test('erro HTTP rejeita', async () => {
  const fetch = async () => new Response('x', { status: 500 });
  await assert.rejects(resolveProduct('leite', { fetch }));
});

test('fuzzy da API com um resultado pouco parecido → many (UI pergunta)', () => {
  const r = decide('mussarela', [P('20', 'Queijo muçarela fatiado')]);
  assert.equal(r.status, 'many');
  assert.equal(r.candidates.length, 1);
});

test('resultado claramente melhor que o resto → one', () => {
  const r = decide('tomate italiano', [P('10', 'Tomate italiano maduro'), P('21', 'Molho de tomate')]);
  assert.equal(r.status, 'one');
  assert.equal(r.product.id, '10');
});

test('singularVariants', () => {
  assert.ok(singularVariants('pães').includes('pão'));
  assert.ok(singularVariants('limões').includes('limão'));
  assert.ok(singularVariants('ovos').includes('ovo'));
  assert.ok(singularVariants('pães de queijo').includes('pão de queijo'));
});
