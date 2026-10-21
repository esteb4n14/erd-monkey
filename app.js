/**
 * ERD
 * Diseñado para PostgreSQL DDL
 */

// ESTADO GLOBAL DE LA APLICACIÓN
const state = {
  tables: new Map(), // name -> { id, name, columns: [], x, y, color }
  links: [],         // [ { id, fromTable, fromCol, toTable, toCol, color, width, style, points: [{x, y}] } ]
  zoom: 1,
  panX: 40,
  panY: 40,
  selectedTable: null,
  selectedLink: null,
  isDraggingTable: false,
  draggedTableId: null,
  dragOffset: { x: 0, y: 0 },
  isPanning: false,
  panStart: { x: 0, y: 0 },
  isDraggingHandle: false,
  draggedLink: null,
  draggedPointIndex: 0,
  dragHandleOffset: { x: 0, y: 0 },
  showCardinalities: true,
};

// ELEMENTOS DOM
const dom = {
  viewport: document.getElementById('viewport'),
  canvas: document.getElementById('canvas'),
  svgLayer: document.getElementById('svg-layer'),
  tablesLayer: document.getElementById('tables-layer'),
  zoomLevel: document.getElementById('zoom-level'),
  modalSql: document.getElementById('modal-sql'),
  sqlInput: document.getElementById('sql-input'),
  linkPopover: document.getElementById('link-popover'),
  linkColorInput: document.getElementById('link-color-input'),
  linkWidthInput: document.getElementById('link-width-input'),
  linkWidthVal: document.getElementById('link-width-val'),
  linkStyleInput: document.getElementById('link-style-input'),
  linkCardinalityInput: document.getElementById('link-cardinality-input'),
  btnAddPoint: document.getElementById('btn-add-point'),
  btnResetLine: document.getElementById('btn-reset-line'),
  btnToggleCardinality: document.getElementById('btn-toggle-cardinality'),
  statusStats: document.getElementById('status-stats'),
  fileImportSql: document.getElementById('file-import-sql'),
  fileLoadProject: document.getElementById('file-load-project'),
};

// Conversión exacta entre coordenadas de pantalla y canvas
function getCanvasCoords(clientX, clientY) {
  return {
    x: (clientX - state.panX) / state.zoom,
    y: (clientY - state.panY) / state.zoom
  };
}

/* ========================================================================== 
   2. RENDERIZADO DEL DIAGRAMA
   ========================================================================== */

function renderDiagram() {
  renderTables();
  updateTransform();
  renderLinks();
  updateStats();
}

function renderTables() {
  dom.tablesLayer.innerHTML = '';

  state.tables.forEach((table) => {
    const tableEl = document.createElement('div');
    tableEl.className = 'table-node';
    tableEl.id = `node-${table.id}`;
    tableEl.style.left = `${table.x}px`;
    tableEl.style.top = `${table.y}px`;

    // Cabecera con selector de color
    const headerEl = document.createElement('div');
    headerEl.className = 'table-header';
    headerEl.style.backgroundColor = table.color || '#1e3a8a';

    const titleArea = document.createElement('div');
    titleArea.className = 'table-title-area';
    const icon = document.createElement('span');
    icon.className = 'table-icon';
    icon.textContent = '📑';
    const title = document.createElement('span');
    title.className = 'table-name';
    title.textContent = table.name;
    title.title = table.name;
    titleArea.append(icon, title);

    const headerTools = document.createElement('div');
    headerTools.className = 'table-header-tools';
    const colorLabel = document.createElement('label');
    colorLabel.className = 'table-color-btn';
    colorLabel.title = 'Clic para cambiar color de la tabla';
    const tableColorInput = document.createElement('input');
    tableColorInput.type = 'color';
    tableColorInput.className = 'table-color-input';
    tableColorInput.value = table.color || '#1e3a8a';
    colorLabel.appendChild(tableColorInput);
    headerTools.appendChild(colorLabel);
    headerEl.append(titleArea, headerTools);

    // Cambio de color de la tabla
    const colorInput = tableColorInput;
    colorInput.addEventListener('input', (e) => {
      table.color = e.target.value;
      headerEl.style.backgroundColor = table.color;
      saveToLocalStorage();
    });
    colorInput.addEventListener('mousedown', (e) => e.stopPropagation());

    // Arrastre al pulsar cabecera
    headerEl.addEventListener('mousedown', (e) => onTableMouseDown(e, table.id));
    tableEl.addEventListener('mousedown', () => selectTable(table.id));

    // Cuerpo con columnas
    const bodyEl = document.createElement('div');
    bodyEl.className = 'table-body';

    table.columns.forEach((col) => {
      const colEl = document.createElement('div');
      colEl.className = 'table-col';
      colEl.id = getPortElementId(table.id, col.name);

      const colLeft = document.createElement('div');
      colLeft.className = 'col-left';
      if (col.isPk) {
        const badge = document.createElement('span');
        badge.className = 'col-badge badge-pk';
        badge.title = 'Primary Key';
        badge.textContent = 'PK';
        colLeft.appendChild(badge);
      }
      if (col.isFk) {
        const badge = document.createElement('span');
        badge.className = 'col-badge badge-fk';
        badge.title = 'Foreign Key';
        badge.textContent = 'FK';
        colLeft.appendChild(badge);
      }
      const colName = document.createElement('span');
      colName.className = 'col-name';
      colName.textContent = col.name;
      colName.title = col.name;
      colLeft.appendChild(colName);
      const colType = document.createElement('span');
      colType.className = 'col-type';
      colType.textContent = col.type;
      colEl.append(colLeft, colType);
      bodyEl.appendChild(colEl);
    });

    tableEl.appendChild(headerEl);
    tableEl.appendChild(bodyEl);
    dom.tablesLayer.appendChild(tableEl);
  });
}

function getPortElementId(tableId, columnName) {
  return `port-${encodeURIComponent(JSON.stringify([tableId, columnName]))}`;
}

function selectTable(tableId) {
  state.selectedTable = tableId;
  document.querySelectorAll('.table-node').forEach(n => n.classList.remove('selected'));
  const el = document.getElementById(`node-${tableId}`);
  if (el) el.classList.add('selected');
}

/* ==========================================================================
   3. CÁLCULO Y DIBUJO DE ENLACES (LÍNEAS SVG CON PUNTOS VECTORIALES)
   ========================================================================== */

function computeLinkPath(pts, points) {
  if (!points || points.length === 0) {
    const dx = Math.abs(pts.x2 - pts.x1) * 0.5;
    const offset = Math.max(dx, 40);
    const cx1 = pts.isFromRight ? pts.x1 + offset : pts.x1 - offset;
    const cx2 = pts.isToRight ? pts.x2 + offset : pts.x2 - offset;
    return {
      pathD: `M ${pts.x1} ${pts.y1} C ${cx1} ${pts.y1}, ${cx2} ${pts.y2}, ${pts.x2} ${pts.y2}`,
      handles: [{
        x: Math.round(0.125 * pts.x1 + 0.375 * cx1 + 0.375 * cx2 + 0.125 * pts.x2),
        y: Math.round(0.5 * pts.y1 + 0.5 * pts.y2),
        isDefault: true
      }]
    };
  }

  const pFirst = points[0];
  const pLast = points[points.length - 1];

  const dx1 = Math.max(Math.abs(pFirst.x - pts.x1) * 0.5, 30);
  const dx2 = Math.max(Math.abs(pts.x2 - pLast.x) * 0.5, 30);
  const cx1 = pts.isFromRight ? pts.x1 + dx1 : pts.x1 - dx1;
  const cx2 = pts.isToRight ? pts.x2 + dx2 : pts.x2 - dx2;

  let d = `M ${pts.x1} ${pts.y1} Q ${cx1} ${pts.y1} ${pFirst.x} ${pFirst.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const mx = (curr.x + next.x) / 2;
    const my = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y} ${mx} ${my} Q ${next.x} ${next.y} ${next.x} ${next.y}`;
  }
  d += ` Q ${cx2} ${pts.y2} ${pts.x2} ${pts.y2}`;

  return {
    pathD: d,
    handles: points.map(pt => ({ x: pt.x, y: pt.y, isDefault: false }))
  };
}

function renderLinks() {
  dom.svgLayer.innerHTML = `
    <defs>
      <filter id="line-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity="0.3" />
      </filter>
    </defs>
  `;

  state.links.forEach((link) => {
    const fromTable = state.tables.get(link.fromTable);
    const toTable = state.tables.get(link.toTable);
    if (!fromTable || !toTable) return;

    const fromEl = document.getElementById(`node-${fromTable.id}`);
    const toEl = document.getElementById(`node-${toTable.id}`);
    if (!fromEl || !toEl) return;

    const pts = calculateLinkPoints(fromTable, link.fromCol, toTable, link.toCol, fromEl, toEl);
    const { pathD, handles } = computeLinkPath(pts, link.points);

    // 1. Hitbox transparente ancha para facilitar el clic
    const hitbox = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitbox.setAttribute('d', pathD);
    hitbox.setAttribute('class', 'rel-hitbox');
    hitbox.dataset.linkId = link.id;

    // 2. Línea visible con el color personalizado
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('class', 'rel-line' + (state.selectedLink === link.id ? ' rel-selected' : ''));
    path.setAttribute('stroke', link.color || '#38bdf8');
    path.setAttribute('stroke-width', link.width || 2);
    if (link.style === 'dashed') {
      path.setAttribute('stroke-dasharray', '5,5');
    }
    path.id = `svg-${link.id}`;

    // Marcadores circulares en los extremos
    const startDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    startDot.setAttribute('cx', pts.x1);
    startDot.setAttribute('cy', pts.y1);
    startDot.setAttribute('r', '3.5');
    startDot.setAttribute('fill', link.color || '#38bdf8');

    const endDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    endDot.setAttribute('cx', pts.x2);
    endDot.setAttribute('cy', pts.y2);
    endDot.setAttribute('r', '3.5');
    endDot.setAttribute('fill', link.color || '#38bdf8');

    // Eventos de selección y edición del enlace
    const handleLinkClick = (e) => {
      e.stopPropagation();
      openLinkPopover(link, e.clientX, e.clientY);
    };

    hitbox.addEventListener('click', handleLinkClick);
    path.addEventListener('click', handleLinkClick);

    dom.svgLayer.appendChild(hitbox);
    dom.svgLayer.appendChild(path);
    dom.svgLayer.appendChild(startDot);
    dom.svgLayer.appendChild(endDot);

    // 3. Puntos vectoriales interactivos para mover la línea manualmente
    handles.forEach((h, idx) => {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      handle.setAttribute('cx', h.x);
      handle.setAttribute('cy', h.y);
      handle.setAttribute('r', h.isDefault ? '5.5' : '6.5');
      handle.setAttribute('class', `rel-vector-point ${h.isDefault ? 'default-point' : 'custom-point'}`);
      handle.setAttribute('stroke', link.color || '#38bdf8');
      handle.setAttribute('fill', h.isDefault ? '#ffffff' : (link.color || '#38bdf8'));
      handle.setAttribute('stroke-width', '2');

      const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      titleEl.textContent = h.isDefault
        ? 'Arrastra este punto para mover la línea de modo manual'
        : 'Punto vector: Arrastra para mover | Doble clic para restablecer';
      handle.appendChild(titleEl);

      handle.addEventListener('mousedown', (e) => onHandleMouseDown(e, link, idx, h));
      handle.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        resetLinkPoint(link, idx);
      });

      dom.svgLayer.appendChild(handle);
    });

    // 4. Micro-badges de cardinalidad tipográficos (1 y N)
    const card = link.cardinality || '1:N';
    let fromLabel = 'N';
    let toLabel = '1';
    if (card === '1:1') {
      fromLabel = '1';
      toLabel = '1';
    } else if (card === 'N:N') {
      fromLabel = 'N';
      toLabel = 'N';
    }

    const b1x = pts.isFromRight ? pts.x1 + 13 : pts.x1 - 13;
    const b1y = pts.y1;
    const b2x = pts.isToRight ? pts.x2 + 13 : pts.x2 - 13;
    const b2y = pts.y2;

    const badge1 = createCardinalityBadge(b1x, b1y, fromLabel, link.color || '#38bdf8');
    const badge2 = createCardinalityBadge(b2x, b2y, toLabel, link.color || '#38bdf8');

    dom.svgLayer.appendChild(badge1);
    dom.svgLayer.appendChild(badge2);
  });
}

function createCardinalityBadge(x, y, label, color) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'card-badge');

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', x - 7);
  rect.setAttribute('y', y - 6.5);
  rect.setAttribute('width', 14);
  rect.setAttribute('height', 13);
  rect.setAttribute('stroke', color);

  const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  txt.setAttribute('x', x);
  txt.setAttribute('y', y);
  txt.setAttribute('fill', color);
  txt.textContent = label;

  g.appendChild(rect);
  g.appendChild(txt);
  return g;
}

function drawCanvasBadge(ctx, x, y, label, color) {
  ctx.save();
  ctx.fillStyle = '#0b1120';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x - 7, y - 6.5, 14, 13, 3);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x - 7, y - 6.5, 14, 13);
    ctx.strokeRect(x - 7, y - 6.5, 14, 13);
  }
  ctx.fillStyle = color;
  ctx.font = 'bold 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
  ctx.restore();
}

function calculateLinkPoints(fromTable, fromCol, toTable, toCol, fromEl, toEl) {
  const w1 = fromEl.offsetWidth || 250;
  const w2 = toEl.offsetWidth || 250;

  const fromPortEl = document.getElementById(getPortElementId(fromTable.id, fromCol));
  const toPortEl = document.getElementById(getPortElementId(toTable.id, toCol));

  const portOffset1 = fromPortEl ? fromPortEl.offsetTop + fromPortEl.offsetHeight / 2 : 20;
  const portOffset2 = toPortEl ? toPortEl.offsetTop + toPortEl.offsetHeight / 2 : 20;

  const y1 = fromTable.y + portOffset1;
  const y2 = toTable.y + portOffset2;

  const isFromRight = fromTable.x + w1 / 2 < toTable.x + w2 / 2;
  const x1 = isFromRight ? fromTable.x + w1 : fromTable.x;
  const x2 = isFromRight ? toTable.x : toTable.x + w2;

  return { x1, y1, x2, y2, isFromRight, isToRight: !isFromRight };
}

// ARRASTRE DE PUNTOS VECTORIALES (MANIPULACIÓN MANUAL DE LÍNEAS)
function onHandleMouseDown(e, link, index, handleData) {
  if (e.button !== 0) return;
  e.stopPropagation();

  state.isDraggingHandle = true;
  state.draggedLink = link;
  state.selectedLink = link.id;

  // Si aún no tiene puntos personalizados, inicializamos con la posición actual del handle
  if (!link.points || link.points.length === 0) {
    link.points = [{ x: handleData.x, y: handleData.y }];
    state.draggedPointIndex = 0;
  } else {
    state.draggedPointIndex = index;
  }

  const currentPt = link.points[state.draggedPointIndex];
  const mouseCanvas = getCanvasCoords(e.clientX, e.clientY);
  state.dragHandleOffset = {
    x: mouseCanvas.x - currentPt.x,
    y: mouseCanvas.y - currentPt.y
  };

  window.addEventListener('mousemove', onHandleMouseMove);
  window.addEventListener('mouseup', onHandleMouseUp);
}

function onHandleMouseMove(e) {
  if (!state.isDraggingHandle || !state.draggedLink) return;

  const link = state.draggedLink;
  const pt = link.points[state.draggedPointIndex];
  if (!pt) return;

  const mouseCanvas = getCanvasCoords(e.clientX, e.clientY);
  pt.x = Math.round(mouseCanvas.x - state.dragHandleOffset.x);
  pt.y = Math.round(mouseCanvas.y - state.dragHandleOffset.y);

  renderLinks();
}

function onHandleMouseUp() {
  if (state.isDraggingHandle) {
    state.isDraggingHandle = false;
    state.draggedLink = null;
    window.removeEventListener('mousemove', onHandleMouseMove);
    window.removeEventListener('mouseup', onHandleMouseUp);
    saveToLocalStorage();
  }
}

function resetLinkPoint(link, index) {
  if (link.points && link.points.length > 0) {
    link.points.splice(index, 1);
    renderLinks();
    saveToLocalStorage();
  }
}

/* ==========================================================================
   4. INTERACTIVIDAD: ARRASTRE DE TABLAS Y PANEO / ZOOM
   ========================================================================== */

function onTableMouseDown(e, tableId) {
  if (e.button !== 0) return; // Solo clic izquierdo
  e.stopPropagation();

  state.isDraggingTable = true;
  state.draggedTableId = tableId;
  selectTable(tableId);

  const table = state.tables.get(tableId);
  const mouseCanvas = getCanvasCoords(e.clientX, e.clientY);

  state.dragOffset = {
    x: mouseCanvas.x - table.x,
    y: mouseCanvas.y - table.y
  };

  window.addEventListener('mousemove', onTableMouseMove);
  window.addEventListener('mouseup', onTableMouseUp);
}

function onTableMouseMove(e) {
  if (!state.isDraggingTable) return;

  const table = state.tables.get(state.draggedTableId);
  if (!table) return;

  const mouseCanvas = getCanvasCoords(e.clientX, e.clientY);
  table.x = Math.round(mouseCanvas.x - state.dragOffset.x);
  table.y = Math.round(mouseCanvas.y - state.dragOffset.y);

  // Actualizar nodo DOM directamente sin recrear elementos
  const tableEl = document.getElementById(`node-${table.id}`);
  if (tableEl) {
    tableEl.style.left = `${table.x}px`;
    tableEl.style.top = `${table.y}px`;
  }

  // Recalcular las líneas en tiempo real
  renderLinks();
}

function onTableMouseUp() {
  if (state.isDraggingTable) {
    state.isDraggingTable = false;
    state.draggedTableId = null;
    window.removeEventListener('mousemove', onTableMouseMove);
    window.removeEventListener('mouseup', onTableMouseUp);
    saveToLocalStorage();
  }
}

// PANEO DEL CANVAS (Click derecho, rueda o click en fondo)
dom.viewport.addEventListener('mousedown', (e) => {
  if (e.target === dom.viewport || e.target === dom.canvas || e.button === 2 || e.button === 1) {
    state.isPanning = true;
    state.panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
    dom.viewport.classList.add('is-panning');
    closeLinkPopover();
  }
});

window.addEventListener('mousemove', (e) => {
  if (!state.isPanning) return;
  state.panX = e.clientX - state.panStart.x;
  state.panY = e.clientY - state.panStart.y;
  updateTransform();
});

window.addEventListener('mouseup', () => {
  if (state.isPanning) {
    state.isPanning = false;
    dom.viewport.classList.remove('is-panning');
  }
});

dom.viewport.addEventListener('contextmenu', (e) => e.preventDefault());

// ZOOM CON RUEDA DEL MOUSE
dom.viewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
  const newZoom = Math.min(Math.max(state.zoom * zoomFactor, 0.2), 3);

  // Centrar zoom en la posición exacta del cursor
  const mouseX = e.clientX;
  const mouseY = e.clientY;
  state.panX = mouseX - (mouseX - state.panX) * (newZoom / state.zoom);
  state.panY = mouseY - (mouseY - state.panY) * (newZoom / state.zoom);
  state.zoom = newZoom;

  updateTransform();
}, { passive: false });

function updateTransform() {
  dom.canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  dom.zoomLevel.textContent = `${Math.round(state.zoom * 100)}%`;
}

/* ==========================================================================
   5. POPOVER PARA PERSONALIZAR COLOR Y ESTILO DE RELACIONES
   ========================================================================== */

function openLinkPopover(link, clientX, clientY) {
  state.selectedLink = link.id;
  renderLinks();

  dom.linkPopover.style.display = 'flex';
  dom.linkPopover.style.left = `${Math.min(clientX + 10, window.innerWidth - 270)}px`;
  dom.linkPopover.style.top = `${Math.min(clientY + 10, window.innerHeight - 200)}px`;

  dom.linkColorInput.value = link.color || '#38bdf8';
  dom.linkWidthInput.value = link.width || 2;
  dom.linkWidthVal.textContent = `${link.width || 2}px`;
  dom.linkStyleInput.value = link.style || 'solid';
  if (dom.linkCardinalityInput) {
    dom.linkCardinalityInput.value = link.cardinality || '1:N';
    dom.linkCardinalityInput.onchange = (e) => {
      link.cardinality = e.target.value;
      updateLinkVisual(link);
      saveToLocalStorage();
    };
  }

  dom.linkColorInput.oninput = (e) => {
    link.color = e.target.value;
    updateLinkVisual(link);
    saveToLocalStorage();
  };

  dom.linkWidthInput.oninput = (e) => {
    link.width = parseFloat(e.target.value);
    dom.linkWidthVal.textContent = `${link.width}px`;
    updateLinkVisual(link);
    saveToLocalStorage();
  };

  dom.linkStyleInput.onchange = (e) => {
    link.style = e.target.value;
    updateLinkVisual(link);
    saveToLocalStorage();
  };
}

function updateLinkVisual(link) {
  renderLinks();
}

// Alternar visibilidad de cardinalidades (1:N)
if (dom.btnToggleCardinality) {
  dom.btnToggleCardinality.addEventListener('click', () => {
    state.showCardinalities = !state.showCardinalities;
    dom.btnToggleCardinality.classList.toggle('active', state.showCardinalities);
    dom.svgLayer.classList.toggle('hide-cardinalities', !state.showCardinalities);
    saveToLocalStorage();
  });
}

function closeLinkPopover() {
  dom.linkPopover.style.display = 'none';
  state.selectedLink = null;
  document.querySelectorAll('.rel-line').forEach(p => p.classList.remove('rel-selected'));
}

document.querySelectorAll('.color-dot').forEach(dot => {
  dot.addEventListener('click', (e) => {
    const color = e.target.dataset.color;
    if (state.selectedLink) {
      const link = state.links.find(l => l.id === state.selectedLink);
      if (link) {
        link.color = color;
        dom.linkColorInput.value = color;
        updateLinkVisual(link);
        saveToLocalStorage();
      }
    }
  });
});

document.getElementById('btn-close-popover').addEventListener('click', closeLinkPopover);

// Añadir punto vector manual desde el popover
if (dom.btnAddPoint) {
  dom.btnAddPoint.addEventListener('click', () => {
    if (state.selectedLink) {
      const link = state.links.find(l => l.id === state.selectedLink);
      if (link) {
        const fromTable = state.tables.get(link.fromTable);
        const toTable = state.tables.get(link.toTable);
        const fromEl = document.getElementById(`node-${fromTable.id}`);
        const toEl = document.getElementById(`node-${toTable.id}`);
        const pts = calculateLinkPoints(fromTable, link.fromCol, toTable, link.toCol, fromEl, toEl);

        if (!link.points || link.points.length === 0) {
          link.points = [
            { x: Math.round((pts.x1 + pts.x2) / 2), y: Math.round((pts.y1 + pts.y2) / 2) }
          ];
        } else {
          const last = link.points[link.points.length - 1];
          link.points.push({
            x: Math.round((last.x + pts.x2) / 2),
            y: Math.round((last.y + pts.y2) / 2)
          });
        }
        renderLinks();
        saveToLocalStorage();
      }
    }
  });
}

// Restablecer a curvatura automática
if (dom.btnResetLine) {
  dom.btnResetLine.addEventListener('click', () => {
    if (state.selectedLink) {
      const link = state.links.find(l => l.id === state.selectedLink);
      if (link) {
        link.points = [];
        renderLinks();
        saveToLocalStorage();
      }
    }
  });
}

/* ==========================================================================
   6. AUTO-LAYOUT Y HERRAMIENTAS
   ========================================================================== */

function autoLayoutTables() {
  const count = state.tables.size;
  if (count === 0) return;

  const cols = Math.ceil(Math.sqrt(count * 1.5));
  const colWidth = 320;
  const rowHeight = 350;

  let index = 0;
  state.tables.forEach((table) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    table.x = 80 + col * colWidth;
    table.y = 80 + row * rowHeight;
    index++;
  });

  renderDiagram();
  saveToLocalStorage();
}

function resetView() {
  state.zoom = 1;
  state.panX = 40;
  state.panY = 40;
  updateTransform();
}

function updateStats() {
  dom.statusStats.textContent = `${state.tables.size} tablas | ${state.links.length} relaciones`;
}

/* ==========================================================================
   7. PERSISTENCIA LOCAL Y EXPORTAR / IMPORTAR
   ========================================================================== */

function saveToLocalStorage() {
  try {
    localStorage.setItem('erd_monkey_project', JSON.stringify(createProjectSnapshot()));
  } catch (err) {
    console.warn('No se pudo guardar en localStorage:', err);
  }
}

function createProjectSnapshot() {
  return {
    version: '1.1',
    tables: Array.from(state.tables.entries()),
    links: state.links,
    panX: state.panX,
    panY: state.panY,
    zoom: state.zoom,
    showCardinalities: state.showCardinalities
  };
}

function isValidColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeProject(data) {
  if (!data || !Array.isArray(data.tables) || !Array.isArray(data.links || [])) return null;
  if (data.tables.length > 1000 || (data.links || []).length > 5000) return null;
  const tables = new Map();

  for (const entry of data.tables) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') return null;
    const [key, source] = entry;
    if (!source || typeof source !== 'object' || source.id !== key || typeof source.name !== 'string' || source.name.length > 512 || !Array.isArray(source.columns) || source.columns.length > 1000) return null;
    if (!Number.isFinite(source.x) || !Number.isFinite(source.y) || Math.abs(source.x) > 1000000 || Math.abs(source.y) > 1000000) return null;
    const columns = [];
    for (const column of source.columns) {
      if (!column || typeof column.name !== 'string' || column.name.length > 512 || typeof column.type !== 'string' || column.type.length > 256) return null;
      columns.push({ name: column.name, type: column.type, isPk: column.isPk === true, isFk: column.isFk === true });
    }
    tables.set(key, {
      id: key,
      name: source.name,
      schema: typeof source.schema === 'string' ? source.schema : null,
      columns,
      x: source.x,
      y: source.y,
      color: isValidColor(source.color) ? source.color : '#1e3a8a'
    });
  }

  const links = [];
  for (const source of data.links || []) {
    if (!source || typeof source !== 'object' || typeof source.id !== 'string' || !tables.has(source.fromTable) || !tables.has(source.toTable)) return null;
    if (typeof source.fromCol !== 'string' || typeof source.toCol !== 'string') return null;
    const fromTable = tables.get(source.fromTable);
    const toTable = tables.get(source.toTable);
    if (!fromTable.columns.some(column => column.name === source.fromCol) || !toTable.columns.some(column => column.name === source.toCol)) return null;
    const points = source.points === undefined ? [] : source.points;
    if (!Array.isArray(points) || points.length > 50 || points.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1000000 || Math.abs(point.y) > 1000000)) return null;
    links.push({
      id: source.id,
      fromTable: source.fromTable,
      fromCol: source.fromCol,
      toTable: source.toTable,
      toCol: source.toCol,
      color: isValidColor(source.color) ? source.color : '#38bdf8',
      width: Number.isFinite(source.width) ? Math.min(5, Math.max(1, source.width)) : 2,
      style: source.style === 'dashed' ? 'dashed' : 'solid',
      cardinality: ['1:1', '1:N', 'N:N'].includes(source.cardinality) ? source.cardinality : '1:N',
      points: points.map(point => ({ x: point.x, y: point.y }))
    });
  }

  const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
  return {
    tables,
    links,
    panX: finiteOr(data.panX, 40),
    panY: finiteOr(data.panY, 40),
    zoom: Math.min(3, Math.max(0.2, finiteOr(data.zoom, 1))),
    showCardinalities: data.showCardinalities !== false
  };
}

function applyProject(data) {
  const project = normalizeProject(data);
  if (!project) throw new Error('Estructura de proyecto inválida.');
  state.tables = project.tables;
  state.links = project.links;
  state.selectedTable = null;
  state.selectedLink = null;
  state.panX = project.panX;
  state.panY = project.panY;
  state.zoom = project.zoom;
  state.showCardinalities = project.showCardinalities;
  dom.btnToggleCardinality.classList.toggle('active', state.showCardinalities);
  dom.svgLayer.classList.toggle('hide-cardinalities', !state.showCardinalities);
  renderDiagram();
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem('erd_monkey_project');
    if (!raw) return false;
    applyProject(JSON.parse(raw));
    return true;
  } catch (err) {
    console.error('Error al cargar proyecto guardado:', err);
  }
  return false;
}

// Guardar archivo JSON
document.getElementById('btn-save-project').addEventListener('click', () => {
  const data = createProjectSnapshot();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `erd_project_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Cargar archivo JSON
document.getElementById('btn-load-project').addEventListener('click', () => {
  dom.fileLoadProject.click();
});

dom.fileLoadProject.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      applyProject(data);
      saveToLocalStorage();
    } catch (err) {
      alert(`Archivo JSON de proyecto inválido: ${err.message}`);
    }
  };
  reader.readAsText(file);
  dom.fileLoadProject.value = '';
});

// Exportar a PNG
document.getElementById('btn-export-png').addEventListener('click', () => {
  if (state.tables.size === 0) {
    alert('No hay tablas para exportar.');
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.tables.forEach(t => {
    const el = document.getElementById(`node-${t.id}`);
    const w = el ? el.offsetWidth : 250;
    const h = el ? el.offsetHeight : 200;
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + w);
    maxY = Math.max(maxY, t.y + h);
  });

  const padding = 60;
  const totalW = maxX - minX + padding * 2;
  const totalH = maxY - minY + padding * 2;

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = totalW;
  tempCanvas.height = totalH;
  const ctx = tempCanvas.getContext('2d');

  // Fondo
  ctx.fillStyle = '#131b2e';
  ctx.fillRect(0, 0, totalW, totalH);

  // Líneas SVG
  state.links.forEach(link => {
    const fromTable = state.tables.get(link.fromTable);
    const toTable = state.tables.get(link.toTable);
    if (!fromTable || !toTable) return;
    const fromEl = document.getElementById(`node-${fromTable.id}`);
    const toEl = document.getElementById(`node-${toTable.id}`);
    if (!fromEl || !toEl) return;

    const pts = calculateLinkPoints(fromTable, link.fromCol, toTable, link.toCol, fromEl, toEl);

    // Ajustar puntos a coordenadas del canvas de exportación
    const exportPts = {
      ...pts,
      x1: pts.x1 - minX + padding,
      y1: pts.y1 - minY + padding,
      x2: pts.x2 - minX + padding,
      y2: pts.y2 - minY + padding,
    };
    const exportPoints = (link.points || []).map(p => ({
      x: p.x - minX + padding,
      y: p.y - minY + padding
    }));

    const { pathD } = computeLinkPath(exportPts, exportPoints);

    ctx.save();
    ctx.strokeStyle = link.color || '#38bdf8';
    ctx.lineWidth = link.width || 2;
    if (link.style === 'dashed') ctx.setLineDash([5, 5]);

    if (typeof Path2D !== 'undefined') {
      ctx.stroke(new Path2D(pathD));
    }

    // Puntos terminales
    ctx.fillStyle = link.color || '#38bdf8';
    ctx.beginPath();
    ctx.arc(exportPts.x1, exportPts.y1, 3.5, 0, Math.PI * 2);
    ctx.arc(exportPts.x2, exportPts.y2, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Micro-badges de cardinalidad (1 y N) en PNG
    if (state.showCardinalities) {
      const card = link.cardinality || '1:N';
      let fromLabel = 'N';
      let toLabel = '1';
      if (card === '1:1') {
        fromLabel = '1';
        toLabel = '1';
      } else if (card === 'N:N') {
        fromLabel = 'N';
        toLabel = 'N';
      }

      const b1x = exportPts.isFromRight ? exportPts.x1 + 13 : exportPts.x1 - 13;
      const b1y = exportPts.y1;
      const b2x = exportPts.isToRight ? exportPts.x2 + 13 : exportPts.x2 - 13;
      const b2y = exportPts.y2;

      drawCanvasBadge(ctx, b1x, b1y, fromLabel, link.color || '#38bdf8');
      drawCanvasBadge(ctx, b2x, b2y, toLabel, link.color || '#38bdf8');
    }

    ctx.restore();
  });

  // Tarjetas de tablas
  state.tables.forEach(table => {
    const el = document.getElementById(`node-${table.id}`);
    const w = el ? el.offsetWidth : 250;
    const h = el ? el.offsetHeight : 200;
    const x = table.x - minX + padding;
    const y = table.y - minY + padding;

    // Caja tabla
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, 8);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.fill();
    ctx.stroke();

    // Cabecera
    ctx.fillStyle = table.color || '#1e3a8a';
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, 34, [8, 8, 0, 0]);
    } else {
      ctx.rect(x, y, w, 34);
    }
    ctx.fill();

    // Nombre tabla
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(table.name, x + 12, y + 22);

    // Columnas
    let curY = y + 54;
    table.columns.forEach(col => {
      let textX = x + 12;
      if (col.isPk) {
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('PK', textX, curY - 1);
        textX += 22;
      }
      if (col.isFk) {
        ctx.fillStyle = '#06b6d4';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('FK', textX, curY - 1);
        textX += 22;
      }

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(col.name, textX, curY);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px monospace';
      const typeW = ctx.measureText(col.type).width;
      ctx.fillText(col.type, x + w - typeW - 12, curY);

      curY += 26;
    });
  });

  const link = document.createElement('a');
  link.download = `erd_diagram_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = tempCanvas.toDataURL('image/png');
  link.click();
});

/* ==========================================================================
   8. EVENTOS DE UI Y MODALES
   ========================================================================== */

document.getElementById('btn-import-sql').addEventListener('click', () => {
  dom.modalSql.classList.add('active');
  dom.sqlInput.focus();
});

const closeModal = () => dom.modalSql.classList.remove('active');
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);

dom.fileImportSql.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    dom.sqlInput.value = event.target.result;
  };
  reader.readAsText(file);
});

document.getElementById('btn-load-sample-sql').addEventListener('click', async () => {
  try {
    const res = await fetch('sample.sql');
    if (res.ok) {
      dom.sqlInput.value = await res.text();
    } else {
      loadFallbackSample();
    }
  } catch (err) {
    loadFallbackSample();
  }
});

function loadFallbackSample() {
  dom.sqlInput.value = `-- Ejemplo Rápido PostgreSQL
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    role_id INT REFERENCES roles(id),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES categories(id),
    name VARCHAR(150) NOT NULL,
    price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    total NUMERIC(12, 2)
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id),
    product_id INT REFERENCES products(id),
    quantity INT NOT NULL
);`;
}

document.getElementById('btn-process-sql').addEventListener('click', () => {
  const sql = dom.sqlInput.value.trim();
  if (!sql) {
    alert('Por favor pega o carga un script SQL primero.');
    return;
  }

  const result = SqlParser.parse(sql);
  if (result.tables.size === 0) {
    const details = result.diagnostics.length ? `\n\n${result.diagnostics.join('\n')}` : '';
    alert(`No se detectaron sentencias CREATE TABLE válidas en el SQL.${details}`);
    return;
  }

  state.tables = result.tables;
  state.links = result.links;
  state.selectedTable = null;
  state.selectedLink = null;

  closeModal();
  renderDiagram();
  saveToLocalStorage();
  if (result.diagnostics.length) {
    alert(`Diagrama generado con advertencias:\n\n${result.diagnostics.join('\n')}`);
  }
});

document.getElementById('btn-zoom-in').addEventListener('click', () => {
  state.zoom = Math.min(state.zoom + 0.15, 3);
  updateTransform();
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
  state.zoom = Math.max(state.zoom - 0.15, 0.2);
  updateTransform();
});

document.getElementById('btn-reset-view').addEventListener('click', resetView);
document.getElementById('btn-auto-layout').addEventListener('click', autoLayoutTables);

window.addEventListener('click', (e) => {
  if (!dom.linkPopover.contains(e.target) && !e.target.classList.contains('rel-line') && !e.target.classList.contains('rel-hitbox')) {
    closeLinkPopover();
  }
});

/* ==========================================================================
   9. INICIALIZACIÓN
   ========================================================================== */

function init() {
  const loaded = loadFromLocalStorage();
  if (!loaded) {
    loadFallbackSample();
    const result = SqlParser.parse(dom.sqlInput.value);
    state.tables = result.tables;
    state.links = result.links;
    renderDiagram();
    saveToLocalStorage();
  }
}

init();
