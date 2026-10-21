# ⚡ ERD Monkey

Modelador visual interactivo de diagramas Entidad-Relación (ERD) diseñado específicamente para scripts SQL de **PostgreSQL**.

---

## 🚀 Cómo Usar
No requiere instalar Node.js ni Python. Funciona de inmediato en cualquier navegador.
- Haz doble clic en el archivo **`abrir-erd-Monkey.bat`** o abre directamente **`index.html`** en tu navegador (Chrome, Edge, Firefox, Brave).

---

## 🌟 Características Clave
1. **Lector de PostgreSQL**:
   - Interpreta `CREATE TABLE`, tipos de datos (`SERIAL`, `INT`, `VARCHAR`, `NUMERIC`, `UUID`, etc.).
   - Detecta `PRIMARY KEY` (inline o por restricción de tabla).
   - Detecta `FOREIGN KEY / REFERENCES` (inline o por restricciones `ALTER TABLE / CONSTRAINT`).
2. **Generación automática de tablas y relaciones**:
   - Dibuja tarjetas de tablas con columnas, tipos y etiquetas visuales (`PK`, `FK`).
   - Genera líneas curvas Bézier automáticas entre las columnas conectadas.
3. **Personalización de color por tabla**:
   - Cada tabla tiene un selector de color en su cabecera. Puedes elegir el tono que prefieras para agrupar tablas por módulos (ventas, usuarios, productos, etc.).
4. **Personalización de color y estilo por enlace**:
   - Haz clic en cualquier línea de relación para cambiar su color con la paleta, ajustar el grosor o cambiar entre línea continua o discontinuada.
5. **Indicadores de Cardinalidad Minimalistas (`1` y `N`)**:
   - Cada enlace muestra micro-etiquetas estilizadas cerca de los puertos de las tablas: `1` en el extremo de la clave primaria (PK) y `N` en el extremo de la clave foránea (FK).
   - **Detección automática**: Detecta relaciones `1:1` cuando la clave foránea es `UNIQUE` o forma parte de la clave primaria.
   - **Selector manual**: En el menú flotante de la línea puedes forzar la relación a `1:N`, `1:1` o `N:N`.
   - **Interruptor en la barra superior (`1:N`)**: Activa o desactiva la visibilidad de los badges de cardinalidad con un solo clic para mantener el diagrama 100% despejado cuando tengas muchas tablas.
6. **Control manual de líneas con Puntos Vectoriales**:
   - Cada enlace cuenta con un **punto vector (handle circular ●)** en el centro de la línea.
   - Solo **arrastra ese punto con el mouse** para mover o curvar la línea manualmente en cualquier dirección (ideal para separar líneas paralelas o que se cruzan).
   - Puedes hacer **doble clic en el punto** para restablecer la curva a automática.
   - En el menú flotante del enlace tienes botones para **"+ Añadir punto vector"** o **"↺ Restablecer curva"**.
7. **Control manual total de orden y posiciones**:
   - Arrastra libremente cada tabla para acomodarla exactamente como quieras.
   - Paneo del lienzo manteniendo presionado el **clic derecho** o arrastrando el fondo.
   - Zoom suave con la **rueda del ratón** o los botones de la barra superior.
   - Botón **"Auto Orden"** si deseas una distribución automática inicial.
7. **Guardar y Exportar**:
   - **Guardar / Cargar**: Exporta e importa tu diagrama en archivo `.json` conservando todas las posiciones y colores manuales.
   - **Autoguardado**: Guarda automáticamente en tu navegador para que nunca pierdas tu trabajo si cierras la pestaña.
   - **Exportar PNG**: Descarga tu diagrama en alta calidad con un solo clic.
