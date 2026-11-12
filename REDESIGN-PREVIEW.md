# The English Room - prueba de recorrido 3D

Rama: `redesign/english-room-exploration`.

Prueba visual autorizada de dos cursos, A1 y B2, en `experiencia.html`.
No reemplaza la web completa. Las páginas originales permanecen disponibles.

## Abrir localmente

Ejecutar `npm start` y abrir `http://127.0.0.1:4187/experiencia.html`.
`npm run check` verifica la sintaxis de los scripts propios.

Los archivos de Three.js y sus recursos se incluyen en `experiencia/vendor/`
con su licencia. El prototipo no necesita CDN para renderizar 3D.
La tipografía externa tiene alternativas locales del sistema.

## Dirección

Inspiración: continuidad espacial y cámara controlada por scroll de Active Theory.
Geometría, composición y animación originales: recorrido en profundidad, cintas
volumétricas, portales, libros y tipografía 3D. Colores de la web existente.
La segunda iteración reemplaza el scroll convencional de bloques por estaciones
de texto fijas que aparecen al llegar a cada destino tridimensional.

Controles: scroll, enlaces de cursos, navegación por teclado, diálogos con Escape.
Respeta movimiento reducido y ofrece contenido accesible si WebGL no funciona.
La representación 3D es experimental; no se afirma equivalencia de calidad con
el sitio de referencia ni se considera rediseño final aprobado.

## Contenido

Los dos cursos conservan datos de `cursos.html` de esta misma rama.
El catálogo completo, sus enlaces con parámetro `curso`, los recursos PDF,
contactos, imágenes y páginas informativas originales no fueron modificados.
La lectura automatizada de la página pública de cursos devolvió 403; por eso
no se certifica paridad actual entre Hostinger y GitHub.

Antes de ampliar el recorrido al resto del catálogo, contrastar esa información
con el contenido publicado y revisar la dirección visual con Santiago.
