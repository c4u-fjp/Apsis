# Cómo trabajar en Apsis

## Regla de oro
**Una tarea = un issue = una rama = un Pull Request.** Nadie sube cambios directo a `main`.

## Flujo
1. Elige un issue del tablero (columna *Por hacer*) y asígnatelo. Si no existe, créalo con la plantilla "Tarea".
2. Actualiza tu copia y crea una rama desde `main`:
   ```bash
   git switch main && git pull
   git switch -c feat/23-lrv-apollo15      # tipo/numero-issue-descripcion
   ```
   Tipos: `feat/` (nuevo), `fix/` (error), `docs/`, `refactor/`, `datos/` (JSON de misiones), `modelo/` (GLB).
3. Commits pequeños con mensaje claro:
   ```
   feat(superficie): estacionar el LRV junto al LM en Apolo 15
   fix(espacio): la S-IVB parpadeaba tras la extracción
   ```
4. Antes de abrir el PR:
   ```bash
   cd frontend && npm test && npm run build
   cd ../backend && source venv/bin/activate && pytest
   ```
5. Sube la rama y abre el PR (`git push -u origin HEAD`). Escribe `Cierra #23` en la descripción.
6. Otra persona revisa. Con 1 aprobación y la CI en verde → **Squash and merge**. Borra la rama.

Si `main` avanzó mientras trabajabas: `git switch main && git pull && git switch tu-rama && git merge main`.

## Primera vez (instalación)
```bash
git clone https://github.com/USUARIO/Apsis.git && cd Apsis
# backend
cd backend && python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt && python scripts/download_kernels.py && cd ..
# frontend
cd frontend && npm install && cd ..
# los modelos .glb: ver "Modelos" más abajo
```
Arranque: ver README.

## Áreas (para repartir el trabajo sin pisarse)
| Área | Etiqueta | Archivos principales |
|---|---|---|
| Lanzamiento y ascenso | `area:escenas-tierra` | `escenas/plataforma.js`, `modelos/efectos.js` |
| Espacio y trayectoria | `area:espacio-trayectoria` | `escenas/espacio.js`, `mision/*.js`, `modelos/nave.js` |
| Superficie y alunizaje | `area:superficie-alunizaje` | `escenas/superficie.js`, `simulation/*.js` |
| Backend y datos SPICE | `area:backend-datos` | `backend/**` |
| Interfaz, VR, móvil | `area:ui-vr` | `core/*.js`, `index.html`, `style.css`, `main.js` |
| Modelos 3D | `area:modelos-3d` | `public/models/`, `modelos/cargador.js` |
| Contenido e historia | `area:contenido-historia` | `data/*.json`, `nasa_data/*.json`, textos |

Archivos "compartidos" que tocan casi todos (`main.js`, `apollo11.json`): cambios pequeños y avisa en el issue.

## Convenciones de código
- Nombres y comentarios en **español**, como el resto del proyecto. Unidades en el nombre o en un comentario (km, m, s).
- Las escenas son **funciones puras del tiempo** `t` (GET en segundos): no acumules estado que se rompa al saltar
  con la línea de tiempo. Ver `docs/ARQUITECTURA.md`.
- Datos de la misión: cada número real lleva su fuente (NASA SP-4029, Apollo Flight Journal, SPICE).
- `frontend/src/data/apollo11.json` y `backend/nasa_data/apollo11_mission.json` son el **mismo** archivo: si cambias uno, copia el otro.
- Nada de rutas con mayúsculas mal escritas: en Linux `saturnov.glb` ≠ `saturnoV.glb`.

## Modelos (.glb)
- Se suben al repo si pesan < 25 MB. Más grandes → comprímelos (`npx gltf-transform optimize in.glb out.glb --compress draco --texture-compress webp`).
- `luna.glb` y `tierra.glb` están en `.gitignore` (son duplicados de la Luna; se usa `luna1.glb`).
- Escala y orientación esperadas: ver la cabecera de `modelos/cargador.js`.

## Configurar GitHub (lo hace el dueño del repo, una vez)
1. **Settings → Collaborators** → invitar a cada persona (rol *Write*).
2. **Settings → Branches → Add rule** para `main`: *Require a pull request* (1 aprobación) y *Require status checks* (`frontend`, `backend`).
3. **Projects → New project → Board** con columnas *Por hacer / En curso / En revisión / Hecho*; añadir los issues.
4. Ejecutar `scripts/crear_issues.sh` (crea etiquetas, hitos y el backlog inicial; necesita `gh auth login`).
5. Rellenar `.github/CODEOWNERS` con los usuarios responsables de cada área.
