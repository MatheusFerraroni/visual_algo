// Ponto de entrada da página: monta UI, carrega a pista e espera o TensorFlow.js.
async function initialize() {
  attachUI();
  state.editor.mode = state.ui.editorMode.value;
  setMapEditorEnabled(state.ui.mapEditorToggle.checked);
  loadBuiltInTrackPreset(DEFAULT_TRACK_PRESET_ID);
  distributeSensorAngles();
  await tf.ready();
  warmupInferenceWorkersInBackground();
  setRenderEnabled(state.ui.renderToggle.checked);
  renderHistory();
  updateStats();
  setStatus("Bibliotecas prontas. A pista padrão já está carregada; clique em Iniciar para criar a população.", "success");
}

initialize().catch(error => {
  console.error(error);
  setStatus(`Erro ao inicializar a página: ${error.message}`, "error");
});
