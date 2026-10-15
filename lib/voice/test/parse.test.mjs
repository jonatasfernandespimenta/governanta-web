// Testes do parser de voz. Rodar: pnpm test:voice (node --test, sem Jest; Node ≥ 22.18 faz type stripping do .ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, cleanTranscript, normalize } from '../parse.ts';

const dep = (product) => ({ kind: 'depleted', product });
const add = (product, quantity, unit) => ({
  kind: 'add_to_list',
  product,
  ...(quantity !== undefined && { quantity }),
  ...(unit !== undefined && { unit }),
});
const rm = (product) => ({ kind: 'remove_from_list', product });
const used = (product, extra = {}) => ({ kind: 'used', product, ...extra });
const cancel = { kind: 'cancel' };

// 12 frases v1 do Benchmarks (experiments/exp-001-whisper-wasm/public/phrases.js)
const BENCHMARKS = [
  ['acabou o tomate', [dep('tomate')]],
  ['acabou o leite', [dep('leite')]],
  ['acabou o requeijão', [dep('requeijão')]],
  ['coloca café na lista', [add('café')]],
  ['acabou o papel higiênico', [dep('papel higiênico')]],
  ['acabou o detergente', [dep('detergente')]],
  ['coloca pão de forma na lista', [add('pão de forma')]],
  ['acabou o iogurte natural', [dep('iogurte natural')]],
  ['tira o arroz da lista', [rm('arroz')]],
  ['acabou a manteiga', [dep('manteiga')]],
  ['acabou o leite e o pão', [dep('leite'), dep('pão')]],
  ['coloca queijo muçarela na lista', [add('queijo muçarela')]],
];

const CASES = [
  // exemplos do design (tela 02)
  ['acabou o leite', [dep('leite')]],
  ['coloca 2 kg de tomate', [add('tomate', 2, 'kg')]],
  ['usei dois pães', [used('pães', { quantity: 2 })]],
  // pontuação / caixa / transcrição do Whisper
  ['Acabou o requeijão.', [dep('requeijão')]],
  ['ACABOU O LEITE!', [dep('leite')]],
  ['Coloca café, na lista.', [add('café')]],
  ['Coloca pano de forma analista.', [add('pano de forma')]],
  ['coloca café enalista', [add('café')]],
  ['coloca açúcar nalista por favor', [add('açúcar')]],
  ['acabou o leite, por favor', [dep('leite')]],
  ['Acabou o leite por favor.', [dep('leite')]],
  ['acabou o requeijao', [dep('requeijao')]],
  // depleted
  ['terminou o café', [dep('café')]],
  ['acabaram os ovos', [dep('ovos')]],
  ['não tem mais leite', [dep('leite')]],
  ['nao temos mais papel toalha', [dep('papel toalha')]],
  ['o leite acabou', [dep('leite')]],
  ['acabou o leite, o pão e o café', [dep('leite'), dep('pão'), dep('café')]],
  ['acabou a manteiga também', [dep('manteiga')]],
  // add_to_list
  ['põe o açúcar na lista de compras', [add('açúcar')]],
  ['adiciona dois litros de leite na lista', [add('leite', 2, 'l')]],
  ['coloca meia dúzia de ovos', [add('ovos', 6, 'un')]],
  ['coloca uma dúzia de ovos na lista', [add('ovos', 1, 'dz')]],
  ['coloca 500 gramas de presunto', [add('presunto', 500, 'g')]],
  ['coloca 500g de presunto', [add('presunto', 500, 'g')]],
  ['coloca um pacote de café na lista', [add('café', 1, 'pct')]],
  ['coloca três pacotes de macarrão', [add('macarrão', 3, 'pct')]],
  ['coloca 1,5 litro de leite', [add('leite', 1.5, 'l')]],
  ['coloca meio quilo de carne moída', [add('carne moída', 0.5, 'kg')]],
  ['coloca dois quilos e meio de batata', [add('batata', 2.5, 'kg')]],
  ['coloca 3 unidades de abacate', [add('abacate', 3, 'un')]],
  ['coloca um sabonete na lista', [add('sabonete')]],
  ['coloca 4 tomates', [add('tomates', 4)]],
  ['coloca na lista o detergente', [add('detergente')]],
  ['coloca café e açúcar na lista', [add('café'), add('açúcar')]],
  ['coloca dois litros de leite e meia dúzia de ovos na lista', [add('leite', 2, 'l'), add('ovos', 6, 'un')]],
  ['bota sabão em pó na lista', [add('sabão em pó')]],
  // remove_from_list
  ['tira o feijão da lista', [rm('feijão')]],
  ['remove o arroz da minha lista', [rm('arroz')]],
  ['tira o arroz', [rm('arroz')]],
  ['tira o arroz dalista', [rm('arroz')]],
  // used
  ['usei metade do leite', [used('leite', { fraction: 0.5 })]],
  ['usei a metade do leite', [used('leite', { fraction: 0.5 })]],
  ['usei um quarto do requeijão', [used('requeijão', { fraction: 0.25 })]],
  ['usei ¼ do pote de requeijão', [used('requeijão', { fraction: 0.25 })]],
  ['usei 1/4 do requeijão', [used('requeijão', { fraction: 0.25 })]],
  ['usei meio pacote de arroz', [used('arroz', { fraction: 0.5 })]],
  ['usei três quartos do queijo', [used('queijo', { fraction: 0.75 })]],
  ['usei um ovo', [used('ovo', { quantity: 1 })]],
  ['usei 3 ovos', [used('ovos', { quantity: 3 })]],
  ['usei o leite', [used('leite')]],
  ['usei 200 g de queijo', [used('queijo', { quantity: 200, unit: 'g' })]],
  ['comi dois iogurtes', [used('iogurtes', { quantity: 2 })]],
  ['usei dois ovos e um tomate', [used('ovos', { quantity: 2 }), used('tomate', { quantity: 1 })]],
  // cancel
  ['cancela', [cancel]],
  ['Cancela.', [cancel]],
  ['não', [cancel]],
  ['Não, cancela!', [cancel]],
  ['desfaz', [cancel]],
  ['desfaz isso', [cancel]],
  ['deixa pra lá', [cancel]],
  // várias cláusulas
  ['acabou o leite e coloca café na lista', [dep('leite'), add('café')]],
  ['ok governanta, acabou o leite', [dep('leite')]],
  // unknown
  ['que horas são', [{ kind: 'unknown', text: 'que horas são' }]],
  ['acabou', [{ kind: 'unknown', text: 'acabou' }]],
  ['usei metade', [{ kind: 'unknown', text: 'usei metade' }]],
  ['', [{ kind: 'unknown', text: '' }]],
  ['Legendas pela comunidade Amara.org', [{ kind: 'unknown', text: 'Legendas pela comunidade Amara.org' }]],
];

for (const [text, expected] of BENCHMARKS) {
  test(`benchmark: ${text}`, () => assert.deepEqual(parseCommand(text), expected));
}
for (const [text, expected] of CASES) {
  test(`parse: ${JSON.stringify(text)}`, () => assert.deepEqual(parseCommand(text), expected));
}

test('cleanTranscript remove alucinações do Whisper', () => {
  assert.equal(cleanTranscript(' Legendas pela comunidade Amara.org '), '');
  assert.equal(cleanTranscript('[Música]'), '');
  assert.equal(cleanTranscript('Obrigado.'), '');
  assert.equal(cleanTranscript(' Acabou o leite. '), 'Acabou o leite.');
});

test('normalize tira acento, caixa e pontuação e corrige "analista"', () => {
  assert.equal(normalize('Coloca Pão de Forma, analista!'), 'coloca pao de forma e na lista');
});
