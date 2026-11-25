# WebCarlos: propuesta de rediseño de Pizzerías Carlos

Propuesta de rediseño de la web de [Pizzerías Carlos](https://www.pizzeriascarlos.es/). Es una página estática (HTML, CSS y JavaScript) que no necesita servidor ni instalación.

## Cómo verla

Abre `index.html` en cualquier navegador. Hace falta conexión a internet para cargar la tipografía y el mapa.

## Qué incluye

- **Imagen de marca**: el negro característico de Carlos es el color principal, con acabado premium. El rojo del logo se usa solo como acento y el logo original va en su pestaña negra de la cabecera.
- **Escaparate de promociones** al abrir la web. Muestra los banners oficiales a pantalla ancha y cambia solo cada 6,5 segundos. Cada cambio entra con un barrido de luz roja, y debajo hay barras de progreso con el título de cada promoción. Detalles:
  - el fondo toma el color del banner activo;
  - el banner se inclina y refleja la luz al pasar el ratón;
  - se puede pausar, usar con flechas o con el teclado, y deslizar con el dedo en el móvil.
- **Aviso de la app**: "¡Envío gratis por la app!" aparece una vez por visita y lleva a Google Play. Al cerrarlo se recoge en un botón flotante para volver a abrirlo.
- **Portada animada**: una pizza gigante gira y va cambiando de especialidad. Al moverse el ratón, la escena se desplaza en capas (efecto parallax).
- **"Así se hace una Carlos"**: la pizza se monta paso a paso a medida que se baja por la página (masa, salsa, queso, ingredientes y horno).
- **Promociones** que avanzan en horizontal al hacer scroll.
- **Carta completa** con:
  - categorías, buscador y filtros (novedades, sin gluten, vegano y picante);
  - precios a domicilio o para recoger;
  - ficha de cada producto con tamaño, masa clásica o fina y **pizza por mitades**.
- **Crea tu pizza** con los ingredientes y precios reales; la pizza se monta en directo mientras se eligen.
- **Formas de pedir**: domicilio, recoger, Click & Car, reservar mesa, pedido programado y seguimiento del pedido.
- Pizzerías por provincia, app, franquicias y empleo.
- Carrito con el total, que se guarda en el navegador.

## Mejoras respecto a la web actual

| | Antes | Ahora |
|---|---|---|
| Título principal (SEO) | Ninguno | Uno |
| Hojas de estilo / archivos de código | 53 / 22 | 2 / 5 |
| Vista previa en redes sociales y datos estructurados | No | Sí |
| Zoom en el móvil | Bloqueado | Permitido |
| Selección de texto | Bloqueada | Permitida |
| Enlaces de redes sociales | Sin destino | Funcionan |
| Contenido en el HTML | Solo un icono de carga | Textos y secciones principales (la carta y las promociones se generan con JavaScript) |

## Estructura

```
index.html        Página principal
css/carlos.css    Estilos
js/carlos.js      Interacción y animaciones
js/datos.js       Carta, promociones e ingredientes
js/vendor/        GSAP, ScrollTrigger y Lenis (animaciones y scroll suave)
img/pizzas/       Pizzas recortadas en círculo con fondo transparente
img/productos/    Fotos de productos con un ligero realce de color y nitidez
img/promos/       Imágenes de promociones
```

## Notas

- La carta, los precios y las imágenes proceden de la web oficial. Los precios son orientativos y pueden variar según la pizzería.
- "Finalizar pedido" lleva a la web oficial, porque el pago requiere integrarse con su sistema de pedidos.
- En las pizzas por mitades se aplica el precio de la mitad más cara. Es una suposición que hay que confirmar con su sistema de pedidos.
