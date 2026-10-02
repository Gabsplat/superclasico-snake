# Superclásico Snake

Snake 3D con dos modos seleccionables dentro del juego: **Boca** (víbora azul y oro en La Bombonera, junta estrellas y copas) y **River** (personaje fálico cartoon con camiseta blanca y banda roja en El Monumental, junta fantasmitas). Ambos comparten reglas, controles y cámaras. Los récords y las preferencias se guardan por separado en `localStorage`.

Publicado: https://gabsplat.github.io/superclasico-snake/

Vista previa (solo tailnet): https://omarchy.tailff08b5.ts.net:28443

## Publicar en GitHub Pages

Pages sirve la rama `gh-pages`, que contiene solo el build:

```sh
pnpm build
rm -rf /tmp/scs-pages && cp -r dist /tmp/scs-pages && touch /tmp/scs-pages/.nojekyll
cd /tmp/scs-pages && git init -q -b gh-pages && git add -A && git commit -qm "Deploy build"
git push -f https://github.com/Gabsplat/superclasico-snake.git gh-pages
```

## Ejecutar

```sh
pnpm install
pnpm dev        # http://127.0.0.1:4390
pnpm test       # lógica del juego (node --test)
pnpm build && pnpm preview
```

La vista previa corre como unidad transitoria de usuario (`superclasico-snake-preview.service`, `vite preview` en 127.0.0.1:4390), publicada con `tailscale serve --https=28443`. No arranca sola al reiniciar el equipo. Para apagarla:

```sh
systemctl --user stop superclasico-snake-preview
tailscale serve --https=28443 off
```

## Controles

- **Táctil:** pad grande abajo (vertical) o repartido entre ambos pulgares (horizontal). Arrastrar la cancha gira la cámara, pellizcar hace zoom y un doble toque recentra.
- **Teclado:** flechas o WASD, Espacio/P para pausar, C para cambiar de cámara, 1–4 para elegir vista (1–5 en la death cam), Enter para jugar o reiniciar, R para el replay y Esc para omitirlo.
- Las direcciones siguen a la pantalla: "arriba" es hacia donde mira la cámara. En la vista **Cerca**, izquierda y derecha giran respecto de la cabeza.

## Estructura

- `src/game.js`: lógica pura (grilla 15×23, cola de giros, colisiones, comida, bonus cada 5 e historial para el replay).
- `src/characters.js`: cuerpo como tubo deformable con Catmull-Rom, ondulación, "tragadas", cabezas con ojos que miran la comida, parpadeo, lengua y mareo al morir.
- `src/stage.js`: cancha con texturas por código, carteles LED, arcos, banderas, hinchada animada en GPU, papelitos y panorama fotográfico curvo.
- `src/thrower.js`: hincha que tira un rollo de papel, un choripán, un vaso o un gorro. Tiene trayectoria, rebotes y serpentina. Es solo decorativo: la víbora lo patea y nunca puede morir por eso.
- `src/fx.js`: partículas, ondas de impacto y pase final (viñeta, aberración y desaturación al morir), todo por GPU.
- `src/camera.js`: vistas Cancha, Aérea, Cerca y Tribuna, más la death cam Auto. La cancha se encuadra en el espacio libre que deja la UI.

## Decisiones técnicas

- **WebGL2** (`WebGLRenderer`) en vez de WebGPU: es el backend más estable y liviano en Safari de iPhone. La resolución interna queda en 2× como máximo (1,5× con "Efectos: livianos", que además desactiva el pase final y baja la sombra a 1024).
- Las animaciones son propias (interpolaciones, resortes y animaciones en shaders); no hizo falta Anime.js.
- La UI respeta `safe-area-inset-*` y `100dvh`. Ningún panel tapa el botón de cámara, y en la pantalla de muerte siempre quedan visibles Reiniciar, Replay y Cámara.

## Créditos

- **La Bombonera:** [Panorama La Bombonera (Buenos Aires, Argentina) looking east](https://commons.wikimedia.org/wiki/File:Panorama_La_Bombonera_(Buenos_Aires,_Argentina)_looking_east.jpg), de [Uwebart](https://commons.wikimedia.org/wiki/User:Uwebart), Wikimedia Commons, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- **El Monumental:** [Panorama Estadio Monumental (Buenos Aires, Argentina) from inside](https://commons.wikimedia.org/wiki/File:Panorama_Estadio_Monumental_(Buenos_Aires,_Argentina)_from_inside.jpg), de [Uwebart](https://commons.wikimedia.org/wiki/User:Uwebart), Wikimedia Commons, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- Las dos fotos están reducidas a 4096 px de ancho, recortadas, espejadas y proyectadas sobre un cilindro (`public/assets/`). Estas adaptaciones se distribuyen bajo CC BY-SA 3.0.
- [Three.js](https://threejs.org/), licencia MIT.
- El resto (personajes, coleccionables, cancha, tribunas, texturas y sonido sintetizado con WebAudio) se genera por código en este proyecto.
- Los créditos también se ven dentro del juego: hay una línea fija bajo el puntaje y un panel completo en "Créditos".

Juego de hinchas, sin afiliación con Boca Juniors ni con River Plate.

## Verificación

- `pnpm test`: 8 tests de lógica (movimiento, comer y crecer, bonus, giros inválidos, choque con borde, choque con el cuerpo, entrar en la celda de la cola, historial y embestida).
- `node tests/e2e/play.mjs <url> <ancho> <alto> <boca|river> <prefijo>` recorre una partida en Chromium: menú, giro con el pad táctil, crecimiento, choque con el borde, death cam automática, replay, omitir, cambio de cámara, reinicio y choque con el propio cuerpo. Verifica además que Reiniciar, Replay y Cámara queden en pantalla. Se probó en 393×852 (iPhone 15 Pro vertical) y 852×393 (horizontal) en ambos modos, sin errores de consola.
- `node tests/e2e/shot.mjs <url> <ancho> <alto> <salida.png> [js]` saca capturas para revisión visual.
