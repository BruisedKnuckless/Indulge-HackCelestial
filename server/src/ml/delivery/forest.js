/**
 * A small random forest (CART trees, bagging, feature subsampling) for the
 * delivery model — classification by Gini impurity, regression by variance.
 *
 * Splits are searched over quantile bins (≤ `bins` cut points per feature)
 * rather than every distinct value, which keeps training to seconds on a few
 * thousand rows and the serialised model small. No dependencies, so it runs
 * wherever the API runs.
 *
 * Serialised trees are flat arrays of nodes:
 *   internal  [featureIndex, threshold, leftIndex, rightIndex]   (x[f] <= threshold → left)
 *   leaf      [-1, value]    value = class-probability array, or a number
 */

/** mulberry32 — seedable PRNG so a retrain is reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (v, dp = 4) => Math.round(v * 10 ** dp) / 10 ** dp;

/** Up to `bins` cut points per feature, at training-data quantiles. */
function computeCuts(X, bins) {
  const nFeatures = X[0].length;
  const cuts = [];
  for (let f = 0; f < nFeatures; f++) {
    const values = [...new Set(X.map((row) => row[f]))].sort((a, b) => a - b);
    if (values.length <= 1) {
      cuts.push([]);
      continue;
    }
    // Midpoints between distinct values, thinned to at most `bins`.
    const mids = [];
    for (let i = 0; i < values.length - 1; i++) mids.push((values[i] + values[i + 1]) / 2);
    const step = Math.max(1, Math.ceil(mids.length / bins));
    const picked = [];
    for (let i = 0; i < mids.length; i += step) picked.push(round(mids[i]));
    cuts.push([...new Set(picked)]);
  }
  return cuts;
}

/** Bin index of v: the number of cuts strictly below it. */
function binOf(cutsF, v) {
  let lo = 0;
  let hi = cutsF.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cutsF[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function buildTree(ctx, sampleIdx, r) {
  const { binned, y, cuts, isClassifier, nClasses, maxDepth, minLeaf, nSampleFeatures, nFeatures } = ctx;
  const nodes = [];

  const leafValue = (idx) => {
    if (isClassifier) {
      const counts = new Array(nClasses).fill(0);
      for (const i of idx) counts[y[i]]++;
      return counts.map((c) => round(c / idx.length, 3));
    }
    let s = 0;
    for (const i of idx) s += y[i];
    return round(s / idx.length);
  };

  const impurityParts = (idx) => {
    if (isClassifier) {
      const counts = new Array(nClasses).fill(0);
      for (const i of idx) counts[y[i]]++;
      return counts;
    }
    let s = 0;
    let s2 = 0;
    for (const i of idx) {
      s += y[i];
      s2 += y[i] * y[i];
    }
    return [s, s2];
  };

  const gini = (counts, n) => {
    if (!n) return 0;
    let sum = 0;
    for (const c of counts) sum += (c / n) ** 2;
    return n * (1 - sum); // weighted by n
  };
  const sse = (s, s2, n) => (n ? s2 - (s * s) / n : 0);

  const grow = (idx, depth) => {
    const nodeIndex = nodes.length;
    nodes.push(null);
    const n = idx.length;
    const parts = impurityParts(idx);
    const parentImpurity = isClassifier ? gini(parts, n) : sse(parts[0], parts[1], n);

    if (depth >= maxDepth || n < 2 * minLeaf || parentImpurity <= 1e-9) {
      nodes[nodeIndex] = [-1, leafValue(idx)];
      return nodeIndex;
    }

    // Random feature subset for this split.
    const features = [];
    const pool = Array.from({ length: nFeatures }, (_, i) => i);
    for (let k = 0; k < nSampleFeatures && pool.length; k++) {
      const j = Math.floor(r() * pool.length);
      features.push(pool[j]);
      pool[j] = pool[pool.length - 1];
      pool.pop();
    }

    let best = null;
    for (const f of features) {
      const nb = cuts[f].length + 1;
      if (nb < 2) continue;
      if (isClassifier) {
        const hist = Array.from({ length: nb }, () => new Array(nClasses).fill(0));
        const cnt = new Array(nb).fill(0);
        for (const i of idx) {
          const b = binned[i][f];
          hist[b][y[i]]++;
          cnt[b]++;
        }
        const left = new Array(nClasses).fill(0);
        let nl = 0;
        for (let b = 0; b < nb - 1; b++) {
          for (let c = 0; c < nClasses; c++) left[c] += hist[b][c];
          nl += cnt[b];
          const nr = n - nl;
          if (nl < minLeaf || nr < minLeaf) continue;
          const right = parts.map((t, c) => t - left[c]);
          const score = gini(left, nl) + gini(right, nr);
          if (!best || score < best.score) best = { f, b, score };
        }
      } else {
        const hs = new Array(nb).fill(0);
        const hs2 = new Array(nb).fill(0);
        const cnt = new Array(nb).fill(0);
        for (const i of idx) {
          const b = binned[i][f];
          hs[b] += y[i];
          hs2[b] += y[i] * y[i];
          cnt[b]++;
        }
        let sl = 0;
        let sl2 = 0;
        let nl = 0;
        for (let b = 0; b < nb - 1; b++) {
          sl += hs[b];
          sl2 += hs2[b];
          nl += cnt[b];
          const nr = n - nl;
          if (nl < minLeaf || nr < minLeaf) continue;
          const score = sse(sl, sl2, nl) + sse(parts[0] - sl, parts[1] - sl2, nr);
          if (!best || score < best.score) best = { f, b, score };
        }
      }
    }

    if (!best || best.score >= parentImpurity - 1e-9) {
      nodes[nodeIndex] = [-1, leafValue(idx)];
      return nodeIndex;
    }

    const leftIdx = [];
    const rightIdx = [];
    for (const i of idx) (binned[i][best.f] <= best.b ? leftIdx : rightIdx).push(i);
    const l = grow(leftIdx, depth + 1);
    const rr = grow(rightIdx, depth + 1);
    nodes[nodeIndex] = [best.f, cuts[best.f][best.b], l, rr];
    return nodeIndex;
  };

  grow(sampleIdx, 0);
  return nodes;
}

/**
 * Train a forest.
 * @param {number[][]} X
 * @param {number[]} y  class indices (classification) or numbers (regression)
 */
export function trainForest(X, y, {
  task = 'classification',
  nClasses = 0,
  nTrees = 40,
  maxDepth = 12,
  minLeaf = 3,
  featureFraction = 0.5,
  bins = 32,
  seed = 42,
} = {}) {
  const r = rng(seed);
  const cuts = computeCuts(X, bins);
  const binned = X.map((row) => row.map((v, f) => binOf(cuts[f], v)));
  const nFeatures = X[0].length;
  const ctx = {
    binned,
    y,
    cuts,
    isClassifier: task === 'classification',
    nClasses,
    maxDepth,
    minLeaf,
    nFeatures,
    nSampleFeatures: Math.max(1, Math.round(nFeatures * featureFraction)),
  };

  const trees = [];
  for (let t = 0; t < nTrees; t++) {
    // Bootstrap sample.
    const sample = Array.from({ length: X.length }, () => Math.floor(r() * X.length));
    trees.push(buildTree(ctx, sample, r));
  }
  return { task, nClasses, trees };
}

function walk(tree, x) {
  let node = tree[0];
  while (node[0] !== -1) node = tree[x[node[0]] <= node[1] ? node[2] : node[3]];
  return node[1];
}

/** Class probabilities averaged over the trees. */
export function predictProba(forest, x) {
  const acc = new Array(forest.nClasses).fill(0);
  for (const tree of forest.trees) {
    const p = walk(tree, x);
    for (let c = 0; c < acc.length; c++) acc[c] += p[c];
  }
  return acc.map((v) => v / forest.trees.length);
}

export function predictClass(forest, x) {
  const p = predictProba(forest, x);
  let best = 0;
  for (let c = 1; c < p.length; c++) if (p[c] > p[best]) best = c;
  return { index: best, confidence: p[best] };
}

export function predictValue(forest, x) {
  let s = 0;
  for (const tree of forest.trees) s += walk(tree, x);
  return s / forest.trees.length;
}
