# Diseño: formato de mensajes WhatsApp de renovación

## Objetivo

Corregir los dos mensajes de renovación para que WhatsApp muestre los emojis correctamente, use su sintaxis real de negrita y conserve una separación visible entre párrafos.

## Decisión aprobada

- Usar un solo asterisco por lado: `*1 clase disponible*` y `*vencida*`.
- Separar saludo y recomendación con dos saltos de línea (`\n\n`).
- Representar 👋 y 🏹 mediante escapes Unicode en el código fuente para que la cadena generada no dependa de la codificación del archivo o del proceso de compilación.
- Mantener `encodeURIComponent` para transportar el mensaje en el parámetro `text` de `wa.me`.

## Mensajes

Última clase:

```text
Hola 👋 Te contamos que actualmente te queda *1 clase disponible* de tu membresía.

Para que puedas continuar con tus entrenamientos sin interrupciones, te recomendamos renovar antes de utilizar tu última clase. 🏹
```

Membresía vencida:

```text
Hola 👋 Te informamos que tu membresía ya se encuentra *vencida* y actualmente no tienes clases disponibles.

Para continuar con tus entrenamientos y poder reservar nuevas clases, es necesario realizar la renovación de tu membresía. 🏹
```

## Validación

Las pruebas deben verificar el texto exacto, que no exista `**`, que haya una línea en blanco, que los puntos de código de ambos emojis sean correctos y que la URL decodificada reproduzca exactamente el mensaje aprobado.
