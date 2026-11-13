// The one palette every sprite is drawn in. Each ramp runs dark to light, and shifts its hue as it goes: shadows lean
// blue, lights lean yellow. That, and one direction of light (top left), is what makes the sheet look like one hand.
export const P = {
  // leaves
  g0: '#1D3B2A', g1: '#2B5E36', g2: '#3F8B3B', g3: '#6BB644', g4: '#A9DC5E',
  // pine: the same ramp, a step towards blue
  n0: '#17302B', n1: '#214B3A', n2: '#2F6E48', n3: '#4C9457', n4: '#7FBF6C',
  // wood
  w0: '#2E1C14', w1: '#4E3220', w2: '#74502F', w3: '#9C7240', w4: '#C79A59',
  // soil and earth
  s0: '#3A271C', s1: '#553926', s2: '#704E33', s3: '#8E6843',
  // meadow (the homestead's grass), forest floor, path
  m0: '#4E9440', m1: '#62AB49', m2: '#77BD55', m3: '#92D068',
  f0: '#3B7A39', f1: '#4A8C40', f2: '#5A9C48',
  p0: '#B9965E', p1: '#D2B27A', p2: '#E4CC97',
  // stone and slate
  k0: '#3F4651', k1: '#5E6876', k2: '#8793A0', k3: '#B4BEC8',
  // red paint
  r0: '#5E1F22', r1: '#8E2F2B', r2: '#B8443A', r3: '#DB6B50',
  // cream
  c0: '#BDAE8C', c1: '#E2D6B6', c2: '#F7EFD8',
  // water
  b0: '#2F6FB0', b1: '#6FB4E8', b2: '#C9E6FA',
  // gold
  y0: '#C98A1E', y1: '#F2C14E', y2: '#FFE08A',
  // skin, shirt
  h0: '#D49E78', h1: '#F0C29A', t0: '#2E5E8C', t1: '#3E7CB1', t2: '#6FA6D6',
  // a petal in the meadow; a cloud, from its shade to its top
  pink: '#F2A0C0', a0: '#CFE4F2', a1: '#EAF4FB', a2: '#FFFFFF',
  // straw: what leaves turn to when a crop wilts
  d0: '#33291A', d1: '#574527', d2: '#7F6630', d3: '#A68A45', d4: '#C6AE68',
  // the line round things
  ink: '#1B1512',
  // key colours: the game repaints these with a field's own colour (its light, itself, its shade)
  keyLight: '#FF99FF', key: '#FF00FF', keyDark: '#990099',
}

/** The shadow a thing casts on the ground: black, mostly see-through. */
export const SHADOW = [0, 0, 0, 56]
