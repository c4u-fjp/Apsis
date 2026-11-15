# Idiomas en Apsis (Español / English)

Esta copia incorpora un selector **ES / EN** siempre visible en la esquina superior derecha.

- **ES** mantiene el texto original en español.
- **EN** muestra las traducciones al inglés de la portada, telemetría, controles,
  eventos de Apollo 11, destinos, restos espaciales, y textos de los monitores 3D/VR.
- El idioma se conserva en el navegador y puede fijarse por URL con `?lang=en` o `?lang=es`.
- Al cambiar de idioma, la página **se recarga** para reconstruir las etiquetas gráficas
  de las escenas y las texturas de los paneles VR. Si estás a mitad de una misión,
  se reiniciará la experiencia; el código de física y los datos son los originales.

## Dónde editar las traducciones

- `frontend/src/i18n/es-en.json`: diccionario de expresiones en español y su versión inglesa.
- `frontend/src/i18n/index.js`: motor de traducción de DOM y etiquetas Canvas2D/VR.
- `frontend/index.html`: botones para seleccionar el idioma.
- `frontend/src/style.css`: estilos del selector.
- `frontend/src/main.js`: inicialización del sistema de idiomas.
- `frontend/src/misiones/restos.js`: comparación de sitios por identificador (estable en ambos idiomas).

El sistema traduce textos de presentación, **no nombres de variables, claves de JSON,
identificadores, endpoints, coordenadas, timings ni acciones**. Mantiene los datos
originales para evitar romper los cálculos o la navegación.

## Ejecución en Visual Studio Code (Windows)

Abre una terminal dentro de `frontend` y escribe:

```powershell
npm install
npm run dev
```

Abre la URL que muestre Vite y prueba **ES / EN**. Para producción usa `npm run build`.

Si el repositorio `Apsis` ya está clonado, copia únicamente los archivos que aparecen
arriba sobre tu copia local (no hace falta reemplazar el repositorio completo).
No se hizo ningún `git push` desde aquí.

**Nota**: el diccionario es ampliable. Las traducciones cubren las secciones principales
pero alguna cadena no incluida podría mostrarse todavía en español. Agrega la
expresión exacta y su traducción a `es-en.json` si encuentras una.
