El cambio de tema claro/oscuro funciona con tres piezas: un estado en MobX, un hook que construye el tema y un `ThemeProvider` de styled-components. No ejecuté nada. Esto sale de leer el código.

## 1. Estado: `app/stores/UiStore.ts`
- `Theme` es un enum con `Light`, `Dark` y `System`. `theme` guarda la preferencia del usuario y por defecto vale `System`.
- `systemTheme` sigue la preferencia del sistema operativo. Se actualiza con un listener de `matchMedia("(prefers-color-scheme: dark)")` (líneas ~175-190).
- `themeOverride` se activa con el parámetro `?theme=light|dark` de la URL. Dura toda la sesión (`setThemeOverride`).
- `resolvedTheme` es un getter computado (línea ~540) con esta prioridad:
  1. `themeOverride`, si existe.
  2. `systemTheme`, si `theme === "system"`.
  3. `theme`, en cualquier otro caso.
- `setTheme()` actualiza `theme` y lo guarda en `Storage` bajo la clave `"theme"`. Así la preferencia persiste en el navegador.

## 2. Construcción del tema: `app/hooks/useBuildTheme.ts`
El hook lee `ui.resolvedTheme` y elige una de las funciones de `shared/styles/theme.ts`:

| Situación | Tema |
|---|---|
| Impresión (`print`) | siempre `buildLightTheme` |
| Móvil (ancho ≤ `breakpoints.tablet`) y oscuro | `buildPitchBlackTheme` |
| Móvil y claro | `buildLightTheme` |
| Escritorio y oscuro | `buildDarkTheme` |
| Escritorio y claro | `buildLightTheme` |

Estas funciones reciben los colores del tema personalizado del equipo (`CustomTheme`). Antes de usarlos, el hook descarta los valores que no son hex válidos (`validateColorHex`), para que un valor malo no rompa el renderizado. El hook también detecta `?theme=` en la URL y lo pasa a `ui.setThemeOverride`.

## 3. Aplicación: `app/components/Theme.tsx`
- Es un componente `observer` que llama a `useBuildTheme(...)` con el tema personalizado del equipo.
- Envuelve la app en `<ThemeProvider theme={theme}>` y monta `GlobalStyles`. Los componentes styled leen los colores desde `props.theme`.
- Cada vez que cambia `ui.resolvedTheme`, emite un evento `window` `"theme-changed"` con `{ isDark }`. Elementos del editor como los diagramas Mermaid lo usan para volver a renderizarse con los colores correctos. Al imprimir, el evento reporta `isDark: false`.

## 4. Interfaz de usuario
En `app/scenes/Settings/Preferences.tsx` hay un selector con Claro, Oscuro y Sistema. Su `onChange` llama a `ui.setTheme(...)`.

## Otros usos
- `app/scenes/Shared/index.tsx` usa su propio `ThemeProvider` y `useBuildTheme` para las páginas compartidas públicas.
- `app/scenes/Settings/Details.tsx` usa un `ThemeProvider` para previsualizar el tema personalizado.

Si quieres, sigo con cómo se definen los colores en `shared/styles/theme.ts`.
