const CreatureLoader = {
  cache: {},

  async load(creatureId) {
    if (this.cache[creatureId]) return this.cache[creatureId];

    const basePath = `assets/sprites/creatures/${creatureId}/`;
    const response = await fetch(`src/data/creatures/${creatureId}.json`);
    if (!response.ok) throw new Error(`No se encontró src/data/creatures/${creatureId}.json (${response.status})`);
    const data = await response.json();

    const loadedData = { meta: data, canvases: {} };

    const loadSprite = (key, fileName, cols = 2, rows = 6) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          const cx = cv.getContext('2d');
          cx.drawImage(img, 0, 0);

          // quita el fondo blanco, solo si la imagen no trae transparencia propia
          // (si ya es transparente, borrar los blancos se come las caras, panzas, etc. del dibujo)
          const imgData = cx.getImageData(0, 0, cv.width, cv.height);
          const d = imgData.data;
          let hasAlpha = false;
          for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { hasAlpha = true; break; }
          if (!hasAlpha) {
            for (let i = 0; i < d.length; i += 4) {
              if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) d[i + 3] = 0;
            }
            cx.putImageData(imgData, 0, 0);
          }
          loadedData.canvases[key] = { canvas: cv, cols, rows };
          resolve();
        };
        // si falta un archivo (o el nombre no coincide en mayúsculas/minúsculas), no se cuelga todo
        img.onerror = () => {
          console.error('No se pudo cargar el sprite:', basePath + fileName);
          resolve();
        };
        img.src = basePath + fileName;
      });
    };

    const promises = [];
    data.stages.forEach(s => promises.push(loadSprite(`stage_${s.stage}`, s.file, s.cols, s.rows)));
    data.branches.forEach(b => promises.push(loadSprite(`branch_${b.id}`, b.file, b.cols, b.rows)));
    // evolución oscura propia (si no tiene, game.js genera una teñida a partir de su primera forma final)
    if (data.dark) promises.push(loadSprite('dark', data.dark.file, data.dark.cols, data.dark.rows));
    // formas X-Antibody: x = { stage_3: {name, file}, branch_6_1: {...} } -> canvases x_stage_3, x_branch_6_1
    for (const k in (data.x || {})) promises.push(loadSprite('x_' + k, data.x[k].file));

    await Promise.all(promises);
    this.cache[creatureId] = loadedData;
    return loadedData;
  }
};
