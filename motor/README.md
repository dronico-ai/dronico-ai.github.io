# Motor: presentaciones que hablan

Convierte un guion de texto en una página web con voz narrada, subtítulos, música compuesta en directo y partículas que forman palabras, formas e imágenes. El resultado es una web estática que se publica en esta misma web (GitHub Pages).

Ejemplo: [Talking Light / Luz que habla](https://dronico-ai.github.io/talking-light/), cuyo guion está en `motor/shows/talking-light/`.

## Cómo se usa

En la práctica, se lo pides a Claude en el chat («hazme una presentación sobre…»). Claude escribe el guion, lo construye con este motor y lo publica. Los pasos que sigue:

```bash
bash motor/setup.sh                                   # una vez por entorno: paquetes, modelo de voz (~350 MB), ffmpeg
python3 motor/build.py motor/shows/<nombre>           # genera /<slug>/ y actualiza la portada
python3 motor/build.py motor/shows/<nombre> --single  # además, una copia en un solo archivo para compartir
python3 motor/build.py --landing                      # solo regenera la portada desde motor/site.json
```

La voz se sintetiza frase a frase y se guarda en caché (`motor/.cache/`, que git ignora), así que al retocar un guion solo se vuelven a generar las frases cambiadas.

## Estructura

```
motor/
  build.py          el constructor
  setup.sh          prepara el entorno
  site.json         portada: título, lema y lista de presentaciones
  engine/           el reproductor: page.html, player.js, player.css, landing.html
  lib/              guion.py (formato), voice.py (voz), timing.py, images.py, landing.py
  shows/<nombre>/   una presentación: show.json, guion.<idioma>.md e imágenes
  extras/blender/   scripts de ejemplo para renders con Blender
```

## Una presentación: `show.json`

```json
{
  "slug": "talking-light",
  "languages": {
    "en": { "script": "guion.en.md", "voices": ["af_heart", "am_michael"] },
    "es": { "script": "guion.es.md", "voices": ["ef_dora", "em_alex"] }
  },
  "images": { "portrait": "portrait.jpg" },
  "speed": 0.95,
  "landing_image": "portrait"
}
```

- `slug`: la carpeta de la web donde se publica (`/talking-light/`).
- `languages`: un guion por idioma y las voces de cada uno. El primero es el idioma por defecto; el reproductor elige el del navegador si está disponible y muestra un selector.
- `images`: nombre → archivo. Se usan en el guion con `[@image nombre]` y salen en las notas.
- `speed`: velocidad de la voz (1.0 es la normal).

## El guion: `guion.<idioma>.md`

```
---
title: Luz que habla
eyebrow: Una demo corta · con sonido
lede: Descripción corta que aparece bajo el título.
play: Ver la demo
outro_title: Te toca.
outro_text: Texto final, opcional.
image.portrait.title: Un autorretrato, más o menos
image.portrait.caption: Pie de foto para las notas.
image.portrait.alt: Descripción de la imagen para lectores de pantalla.
colophon: Créditos al pie de las notas.
---

## El guion | warm
[hola] Hola. Esto es un pequeño motor de presentaciones que hablan.
[@wave] Un modelo de voz lee las frases, y la música se compone en directo.

## La luz | inward
[@layers] La luz se convierte en {palabra}una palabra, o {@sphere}una forma.
[@image portrait] Incluso puede mostrar una imagen. <pause 1.2>
No tenía [[ElevenLabs|Eleven Labs]] a mano.
```

Reglas:

- **Cabecera** entre `---`: `title` es obligatorio. Opcionales: `eyebrow`, `lede`, `description`, `play`, `voice_prompt`, `idle` (palabra de las partículas antes de empezar), `outro_eyebrow`, `outro_title`, `outro_text`, `outro_word`, `notes`, `colophon` e `image.<nombre>.title/caption/alt`.
- **Capítulos:** `## Título | ambiente`. El ambiente musical es `warm` (cálido), `inward` (íntimo), `hush` (casi en silencio) o `resolve` (resolución). Si se omite, se mantiene el anterior.
- **Una frase por línea.** Cada línea se sintetiza y se subtitula por separado; las frases largas se subtitulan por oraciones.
- **Indicación al empezar la línea:** `[palabra]` hace que las partículas formen esa palabra; `[@forma]` forma una figura; `[@image nombre]` muestra una imagen.
- **Indicación a mitad de línea:** `{palabra}` o `{@forma}` justo antes del texto donde debe cambiar. Funciona mejor después de una coma o un punto, porque ahí la voz hace pausa.
- **Pronunciación:** `[[lo que se lee en pantalla|lo que dice la voz]]`.
- **Pausas:** `<pause 1.2>` al final de la línea (segundos). Por defecto 0,45 s entre frases y 1,5 s antes de un capítulo nuevo.
- **Comentarios:** líneas que empiezan por `//`.

Formas disponibles: `@drift` (dispersión libre), `@wave` (onda que sigue la música), `@ring` (anillos que laten con la voz), `@sphere` (esfera que gira), `@layers` (red neuronal con señales), `@many` (muchos anillos a la vez), `@compass` (brújula cuya aguja oscila y se asienta; `@compass 0.3` la deja desviada 0,3 radianes) y `@heart` (corazón que late a 72 pulsaciones).

Consejos:

- Deja a cada imagen una línea entera (unos 4 segundos o más): tarda 1,5 s en aparecer.
- Frases de 8 a 25 palabras funcionan mejor que párrafos.
- Palabras cortas en las partículas (1 a 12 caracteres) se leen mejor, sobre todo en el móvil.

## Voces

El modelo es [Kokoro-82M](https://github.com/thewh1teagle/kokoro-onnx) (pesos abiertos, Apache 2.0), que corre en CPU.

- Español: `ef_dora` (mujer), `em_alex`, `em_santa` (hombre).
- Inglés (EE. UU.): `af_heart`, `af_bella`, `af_nicole`, `af_sarah`, `am_michael`, `am_fenrir`, `am_puck`.
- Inglés (Reino Unido): `bf_emma`, `bf_isabella`, `bm_george`, `bm_fable`.
- También hay voces en francés (`ff_siwis`), italiano (`if_sara`, `im_nicola`) y portugués (`pf_dora`, `pm_alex`).

## Lo que genera

- `/<slug>/index.html`: la página, con el reproductor y los datos incluidos.
- `/<slug>/audio/`: la narración en MP3, un archivo por capítulo y voz. El reproductor descodifica un capítulo cada vez para no agotar la memoria del móvil.
- `/<slug>/img/`: las imágenes.
- `/<slug>/<slug>.html` (con `--single`): copia en un solo archivo, con una voz por idioma, enlazada desde las notas.
- Una entrada en la portada (`/index.html`), desde `motor/site.json`.

Las presentaciones anteriores al motor (`hello-im-claude`, `claude-in-80-seconds`) están hechas a mano y no se regeneran.
