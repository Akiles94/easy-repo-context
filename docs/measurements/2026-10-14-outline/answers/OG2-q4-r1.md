La app resuelve el tema en tres pasos: un store de MobX guarda la preferencia, un hook construye el objeto de tema y un componente lo entrega a styled-components.

## 1. Estado: `app/stores/UiStore.ts`
- `Theme` es un enum con `Light`, `Dark` y `System`. `SystemTheme` es `Light` o `Dark`.
- `theme` guarda la preferencia del usuario y por defecto vale `System` (`UiStore.ts:55`).
- `systemTheme` refleja el tema del sistema operativo. En el constructor (`~L175-190`) se escucha `matchMedia("(prefers-color-scheme: dark)")` y se actualiza con cada cambio. Si el navegador es antiguo, usa `addListener`.
- `themeOverride` se rellena cuando la URL trae `?theme=light|dark`. Dura toda la sesión, así que sobrevive a la navegación.
- El getter `resolvedTheme` (`UiStore.ts:540`) decide el tema efectivo. Prioriza `themeOverride`, luego `systemTheme` si la preferencia es `system`, y si no, `theme`.
- `setTheme()` (`~L308`) cambia `theme` y lo guarda en `Storage` con la clave `"theme"`. Al iniciar, el store restaura ese valor.

## 2. Construcción del tema: `app/hooks/useBuildTheme.ts`
El hook lee `ui.resolvedTheme` y devuelve un objeto de tema desde `@shared/styles/theme`:
- **Impresión** (`print`): siempre `buildLightTheme`.
- **Móvil** (ancho ≤ `breakpoints.tablet`): `buildPitchBlackTheme` si es oscuro, `buildLightTheme` si es claro.
- **Escritorio**: `buildDarkTheme` o `buildLightTheme`.

Antes de construir el tema, descarta los colores del tema personalizado (`CustomTheme`) que no sean hex válidos. El resultado va en `useMemo`.

## 3. Aplicación: `app/components/Theme.tsx`
- Envuelve la app en `ThemeProvider` de styled-components con el tema construido, además de `GlobalStyles` y `DirectionProvider`.
- Cada vez que cambia `resolvedTheme`, lanza un `CustomEvent("theme-changed", { detail: { isDark } })` en `window`. Lo usan elementos del editor que no son React, como los diagramas de Mermaid.
- Al imprimir, escucha `matchMedia("print")` y emite ese mismo evento con `isDark: false`.
- Los componentes usan `props.theme.*` en sus estilos. Cuando cambia el tema, styled-components los vuelve a renderizar.

## 4. Puntos de control del usuario
- `app/actions/definitions/settings.tsx:33-60` define las acciones de la paleta de comandos para cambiar de tema. El icono es sol o luna según `resolvedTheme`.
- `app/components/Sharing/components/Actions.tsx` y `app/scenes/Shared/index.tsx:164` ofrecen el interruptor en las páginas compartidas públicas, que llaman a `ui.setTheme(...)`.
- Otros consumidores: `app/components/Toasts.tsx` pasa `resolvedTheme` al `Toaster`. `app/scenes/Settings/Details.tsx` y `app/scenes/Shared/index.tsx` montan su propio `ThemeProvider` para previsualizar o aplicar el tema personalizado del equipo.

No abrí `shared/styles/theme.ts`, así que no revisé los valores concretos de colores de los temas.
