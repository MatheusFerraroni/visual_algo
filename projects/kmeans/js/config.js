export const DEFAULT_CONFIG = {
  seed: 42,
  k: 3,
  maxIterations: 100,
  iterationDelay: 1000,
  elbowRunsPerK: 5,
  sampleSprayRadius: 50,
  sampleSprayIntervalMs: 50,
};

export const MODES = {
  SAMPLES: "samples",
  CENTROIDS: "centroids",
};

export const PRESETS = {
  WELL_DEFINED: "well-defined",
  CLOSE_CLUSTERS: "close-clusters",
  NO_CLEAR_CLUSTERS: "no-clear-clusters",
  UNEVEN_DENSITY: "uneven-density",
  WITH_OUTLIERS: "with-outliers",
  ELONGATED_CLUSTERS: "elongated-clusters",
  CONCENTRIC_CIRCLES: "concentric-circles",
  INTERLEAVED_MOONS: "interleaved-moons",
  U_SHAPES: "u-shapes",
  SIZE_IMBALANCE: "size-imbalance",
  HEAVY_OVERLAP: "heavy-overlap",
};

export const PRESET_OPTIONS = [
  {
    id: "preset-1-button",
    value: PRESETS.WELL_DEFINED,
    label: "Preset 1 - Clusters bem definidos",
    activeLabel: "Preset 1 ativo",
    k: 3,
  },
  {
    id: "preset-2-button",
    value: PRESETS.CLOSE_CLUSTERS,
    label: "Preset 2 - Clusters próximos",
    activeLabel: "Preset 2 ativo",
    k: 3,
  },
  {
    id: "preset-3-button",
    value: PRESETS.NO_CLEAR_CLUSTERS,
    label: "Preset 3 - Sem clusters identificáveis",
    activeLabel: "Preset 3 ativo",
    k: 3,
  },
  {
    id: "preset-4-button",
    value: PRESETS.UNEVEN_DENSITY,
    label: "Preset 4 - Densidades desiguais",
    activeLabel: "Preset 4 ativo",
    k: 3,
  },
  {
    id: "preset-5-button",
    value: PRESETS.WITH_OUTLIERS,
    label: "Preset 5 - Clusters com outliers",
    activeLabel: "Preset 5 ativo",
    k: 3,
  },
  {
    id: "preset-6-button",
    value: PRESETS.ELONGATED_CLUSTERS,
    label: "Preset 6 - Clusters alongados",
    activeLabel: "Preset 6 ativo",
    k: 3,
  },
  {
    id: "preset-7-button",
    value: PRESETS.CONCENTRIC_CIRCLES,
    label: "Preset 7 - Círculos concêntricos",
    activeLabel: "Preset 7 ativo",
    k: 2,
  },
  {
    id: "preset-8-button",
    value: PRESETS.INTERLEAVED_MOONS,
    label: "Preset 8 - Luas entrelaçadas",
    activeLabel: "Preset 8 ativo",
    k: 2,
  },
  {
    id: "preset-9-button",
    value: PRESETS.U_SHAPES,
    label: "Preset 9 - Formas em U",
    activeLabel: "Preset 9 ativo",
    k: 2,
  },
  {
    id: "preset-10-button",
    value: PRESETS.SIZE_IMBALANCE,
    label: "Preset 10 - Tamanhos muito desiguais",
    activeLabel: "Preset 10 ativo",
    k: 3,
  },
  {
    id: "preset-11-button",
    value: PRESETS.HEAVY_OVERLAP,
    label: "Preset 11 - Alta sobreposição",
    activeLabel: "Preset 11 ativo",
    k: 3,
  },
];
